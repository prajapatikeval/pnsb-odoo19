#!/usr/bin/env python3
"""
Boot manager for Odoo 19 on Render (or any small container host).

Why this exists
---------------
On small instances (Render free: 0.1 CPU / 512 MB) installing or upgrading
modules takes minutes. Doing that inside a web request (Apps > Install,
database manager) hits proxy/health-check timeouts; Render then restarts the
container mid-transaction, which shows up as timeouts and "cursor already
closed" errors. The previous start script also re-installed the module on
every boot before opening the port.

What it does, in order
----------------------
1. Answers Render's health check immediately with a tiny placeholder server
   (and shows a friendly "starting" page), so deploys never time out.
2. Writes the Odoo config from environment variables (no secrets in git).
3. Initialises the database on first boot, and stores attachments in
   PostgreSQL because the container disk is wiped on every restart.
4. Installs / upgrades modules only when needed:
   - custom addons whose code changed since the last boot (content hash),
   - modules listed in EXTRA_MODULES that are not installed yet.
5. Sets the admin password from ADMIN_PASSWORD whenever that value changes.
6. Replaces itself with the Odoo server (single process, threaded, so
   websockets / live chat work on the one port Render exposes).

Environment variables
---------------------
DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME   PostgreSQL connection
PORT                                             HTTP port (Render sets it)
ADMIN_PASSWORD      password of the "admin" user (applied when it changes)
ADMIN_LOGIN         optional new login for the admin user (e.g. an e-mail)
MASTER_PASSWORD     Odoo master password (database manager is disabled)
EXTRA_MODULES       comma separated Odoo apps to install, e.g. "crm,sale_management"
RESET_DATABASE      set to YES_DELETE_EVERYTHING to wipe the database once
ODOO_WORKERS        0 (default, threaded) - only raise it on paid plans
"""
import hashlib
import http.server
import json
import os
import secrets
import socketserver
import subprocess
import sys
import threading
import time

import psycopg2

ADDONS_DIR = "/opt/pnsb/addons"
ODOO_ADDONS = "/usr/lib/python3/dist-packages/odoo/addons"
DATA_DIR = "/var/lib/odoo"
CONF = os.path.join(DATA_DIR, "odoo.conf")

ENV = os.environ
DB = {
    "host": ENV.get("DB_HOST", "localhost"),
    "port": int(ENV.get("DB_PORT", "5432")),
    "user": ENV.get("DB_USER", "odoo"),
    "password": ENV.get("DB_PASSWORD", ""),
    "dbname": ENV.get("DB_NAME", "pnsb"),
}
PORT = int(ENV.get("PORT", "10000"))


def log(msg):
    print(f"[boot] {msg}", flush=True)


# ---------------------------------------------------------------------------
# 1. Placeholder HTTP server while we prepare Odoo
# ---------------------------------------------------------------------------
STARTING_PAGE = b"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="12">
<title>Starting</title><style>
html,body{height:100%;margin:0;background:#0b0c0e;color:#eceae6;font:16px/1.6 system-ui,sans-serif}
body{display:grid;place-items:center;text-align:center}
.nut{width:64px;height:64px;margin:0 auto 24px;animation:s 2.4s cubic-bezier(.76,0,.24,1) infinite}
@keyframes s{to{transform:rotate(360deg)}}p{color:#9a9ca3;margin:6px 0}
</style></head><body><div>
<svg class="nut" viewBox="0 0 24 24" fill="none" stroke="#ff5b1f" stroke-width="1.5"><path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/><circle cx="12" cy="12" r="3.4"/></svg>
<h1 style="margin:0;font-size:28px">We are getting things ready</h1>
<p>The site is starting up. This page refreshes automatically.</p></div></body></html>"""


class _Placeholder(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        if self.path.startswith("/web/health"):
            body = json.dumps({"status": "starting"}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
        else:
            body = STARTING_PAGE
            self.send_response(503)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Retry-After", "15")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    do_HEAD = do_GET
    do_POST = do_GET

    def log_message(self, *args):
        pass


class _Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def start_placeholder():
    try:
        server = _Server(("0.0.0.0", PORT), _Placeholder)
    except OSError as exc:
        log(f"placeholder could not bind port {PORT}: {exc}")
        return None
    threading.Thread(target=server.serve_forever, daemon=True).start()
    log(f"placeholder listening on :{PORT}")
    return server


# ---------------------------------------------------------------------------
# 2. Config
# ---------------------------------------------------------------------------
def write_config():
    master = ENV.get("MASTER_PASSWORD") or secrets.token_urlsafe(32)
    workers = int(ENV.get("ODOO_WORKERS", "0") or 0)
    lines = [
        "[options]",
        f"addons_path = {ODOO_ADDONS},{ADDONS_DIR}",
        f"data_dir = {DATA_DIR}",
        f"db_host = {DB['host']}",
        f"db_port = {DB['port']}",
        f"db_user = {DB['user']}",
        f"db_password = {DB['password']}",
        f"db_name = {DB['dbname']}",
        f"dbfilter = ^{DB['dbname']}$",
        "list_db = False",
        f"admin_passwd = {master}",
        "proxy_mode = True",
        "http_interface = 0.0.0.0",
        f"http_port = {PORT}",
        f"workers = {workers}",
        "max_cron_threads = 1",
        # Render's free PostgreSQL allows ~100 connections; keep the pool small.
        "db_maxconn = 16",
        "db_maxconn_gevent = 8",
        # Only used when workers > 0 (prefork); generous so installs never get killed.
        "limit_time_cpu = 600",
        "limit_time_real = 1200",
        "limit_memory_soft = 671088640",
        "limit_memory_hard = 805306368",
        "log_level = info",
    ]
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(CONF, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    os.chmod(CONF, 0o600)


# ---------------------------------------------------------------------------
# 3. Database helpers
# ---------------------------------------------------------------------------
def connect(dbname=None):
    params = dict(DB)
    if dbname:
        params["dbname"] = dbname
    return psycopg2.connect(connect_timeout=5, **params)


def wait_for_postgres(timeout=600):
    log(f"waiting for PostgreSQL at {DB['host']}:{DB['port']} ...")
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            conn = connect()
            conn.close()
            log("PostgreSQL is reachable")
            return
        except psycopg2.OperationalError as exc:
            last = exc
            if f'database "{DB["dbname"]}" does not exist' in str(exc):
                create_database()
                continue
            time.sleep(3)
    raise SystemExit(f"PostgreSQL not reachable: {last}")


def create_database():
    log(f"database {DB['dbname']} missing, creating it")
    conn = connect("postgres")
    conn.autocommit = True
    with conn.cursor() as cr:
        cr.execute(f'CREATE DATABASE "{DB["dbname"]}" ENCODING \'unicode\' TEMPLATE template0')
    conn.close()


def query(sql, params=None, fetch="all"):
    conn = connect()
    try:
        with conn.cursor() as cr:
            cr.execute(sql, params)
            if cr.description is None:
                conn.commit()
                return None
            rows = cr.fetchall()
            conn.commit()
            return rows if fetch == "all" else (rows[0] if rows else None)
    finally:
        conn.close()


def is_initialised():
    row = query("SELECT to_regclass('public.ir_module_module')", fetch="one")
    return bool(row and row[0])


def get_param(key):
    row = query("SELECT value FROM ir_config_parameter WHERE key = %s", (key,), fetch="one")
    return row[0] if row else None


def set_param(key, value):
    query(
        """INSERT INTO ir_config_parameter (key, value, create_uid, write_uid, create_date, write_date)
           VALUES (%s, %s, 1, 1, now() at time zone 'utc', now() at time zone 'utc')
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, write_date = EXCLUDED.write_date""",
        (key, value),
    )


def reset_database():
    log("RESET_DATABASE requested: dropping every table in the database")
    conn = connect()
    conn.autocommit = True
    with conn.cursor() as cr:
        cr.execute("DROP SCHEMA public CASCADE")
        cr.execute("CREATE SCHEMA public")
        cr.execute("GRANT ALL ON SCHEMA public TO CURRENT_USER")
    conn.close()


# ---------------------------------------------------------------------------
# 4. Odoo commands
# ---------------------------------------------------------------------------
def odoo(*args, stdin=None, subcommand=None):
    cmd = ["odoo", *([subcommand] if subcommand else []), "-c", CONF, "-d", DB["dbname"], "--no-http", *args]
    log("running: " + " ".join(cmd))
    started = time.time()
    result = subprocess.run(cmd, input=stdin, text=True)
    log(f"finished in {time.time() - started:.0f}s (exit {result.returncode})")
    if result.returncode:
        raise SystemExit(f"Odoo command failed: {' '.join(cmd[1:4])} ...")


STORAGE_SCRIPT = """
import os
env['ir.config_parameter'].sudo().set_param('ir_attachment.location', 'db')
Attachment = env['ir.attachment'].sudo()
# Drop file-backed attachments whose file vanished with a previous container
# (they cause HTTP 500s on assets and images), then move the rest into the DB.
root = Attachment._filestore()
broken = Attachment.search([('store_fname', '!=', False), '|', ('res_field', '=', False), ('res_field', '!=', False)]).filtered(
    lambda a: not os.path.isfile(os.path.join(root, a.store_fname)))
if broken:
    print('[boot] removing %d attachments with missing files' % len(broken))
    broken.unlink()
Attachment.force_storage()
env['ir.config_parameter'].sudo().set_param('pnsb.boot.storage', 'db')
env.cr.commit()
"""


def ensure_db_storage():
    if get_param("pnsb.boot.storage") == "db":
        return
    log("switching attachment storage to PostgreSQL (container disk is ephemeral)")
    odoo("--shell-interface=python", stdin=STORAGE_SCRIPT, subcommand="shell")


def addons_hash():
    digest = hashlib.sha256()
    for base, dirs, files in os.walk(ADDONS_DIR):
        dirs[:] = sorted(d for d in dirs if d not in ("__pycache__", ".git"))
        for name in sorted(files):
            if name.endswith((".pyc", ".pyo")):
                continue
            path = os.path.join(base, name)
            digest.update(os.path.relpath(path, ADDONS_DIR).encode())
            with open(path, "rb") as fh:
                digest.update(fh.read())
    return digest.hexdigest()


def custom_modules():
    mods = []
    for name in sorted(os.listdir(ADDONS_DIR)):
        manifest = os.path.join(ADDONS_DIR, name, "__manifest__.py")
        if os.path.isfile(manifest):
            mods.append(name)
    return mods


def sync_modules():
    custom = custom_modules()
    extra = [m.strip() for m in ENV.get("EXTRA_MODULES", "").split(",") if m.strip()]
    wanted = list(dict.fromkeys(custom + extra))
    states = dict(query("SELECT name, state FROM ir_module_module WHERE name = ANY(%s)", (wanted,)))
    to_install = [m for m in wanted if states.get(m) not in ("installed", "to upgrade")]
    current = addons_hash()
    changed = get_param("pnsb.boot.addons_hash") != current
    to_update = [m for m in custom if m not in to_install and (changed or states.get(m) == "to upgrade")]

    if not to_install and not to_update:
        log("modules are up to date, nothing to install")
        return
    args = ["--stop-after-init"]
    if to_install:
        args += ["-i", ",".join(to_install)]
    if to_update:
        args += ["-u", ",".join(to_update)]
    log(f"install: {to_install or '-'} | update: {to_update or '-'}")
    odoo(*args)
    set_param("pnsb.boot.addons_hash", current)


# ---------------------------------------------------------------------------
# 5. Admin credentials
# ---------------------------------------------------------------------------
def sync_admin():
    password = ENV.get("ADMIN_PASSWORD", "")
    login = ENV.get("ADMIN_LOGIN", "").strip()
    row = query("SELECT res_id FROM ir_model_data WHERE module = 'base' AND name = 'user_admin'", fetch="one")
    if not row:
        return
    uid = row[0]
    if not password:
        log("WARNING: ADMIN_PASSWORD is not set; the admin user keeps its current password")
    else:
        marker = hashlib.sha256(f"{uid}:{password}".encode()).hexdigest()
        if get_param("pnsb.boot.admin_marker") != marker:
            from passlib.context import CryptContext
            ctx = CryptContext(["pbkdf2_sha512"], pbkdf2_sha512__rounds=600_000)
            query("UPDATE res_users SET password = %s WHERE id = %s", (ctx.hash(password), uid))
            set_param("pnsb.boot.admin_marker", marker)
            log("admin password updated from ADMIN_PASSWORD")
    if login:
        query("UPDATE res_users SET login = %s WHERE id = %s AND login <> %s", (login, uid, login))


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    log("PNSB Odoo 19 boot")
    placeholder = start_placeholder()
    write_config()
    wait_for_postgres()

    if ENV.get("RESET_DATABASE") == "YES_DELETE_EVERYTHING":
        if get_reset_marker_done():
            log("RESET_DATABASE is still set but the reset already ran for this value; skipping. Remove the variable.")
        else:
            reset_database()

    if not is_initialised():
        log("empty database: initialising Odoo (first boot takes a few minutes)")
        odoo("--stop-after-init", "-i", "base")
    if ENV.get("RESET_DATABASE") == "YES_DELETE_EVERYTHING":
        set_param("pnsb.boot.reset_done", "1")

    ensure_db_storage()
    sync_modules()
    sync_admin()

    if placeholder:
        placeholder.shutdown()
        placeholder.server_close()
    log(f"starting Odoo on :{PORT}")
    sys.stdout.flush()
    os.execvp("odoo", ["odoo", "-c", CONF])


def get_reset_marker_done():
    try:
        return is_initialised() and get_param("pnsb.boot.reset_done") == "1"
    except psycopg2.Error:
        return False


if __name__ == "__main__":
    main()
