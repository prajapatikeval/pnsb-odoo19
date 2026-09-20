#!/bin/bash

set -e

DB_NAME="${DB_NAME:-pnsb}"

echo "========================================"
echo " PNSB ODOO 19 STARTUP"
echo "========================================"

echo "==> Waiting for PostgreSQL..."

until python3 - <<'PY'
import os
import socket

host = os.environ["DB_HOST"]
port = int(os.environ.get("DB_PORT", "5432"))

s = socket.socket()
s.settimeout(2)

try:
    s.connect((host, port))
    raise SystemExit(0)
except Exception:
    raise SystemExit(1)
finally:
    s.close()
PY
do
    sleep 2
done

echo "==> PostgreSQL reachable"

MODULE_PATH="/mnt/extra-addons/pnsb_website"
MANIFEST_PATH="${MODULE_PATH}/__manifest__.py"
INIT_PATH="${MODULE_PATH}/__init__.py"

echo "========================================"
echo " Checking PNSB module"
echo "========================================"

echo "Module path: ${MODULE_PATH}"

if [ ! -d "${MODULE_PATH}" ]; then
    echo "ERROR: pnsb_website directory not found!"
    exit 1
fi

if [ ! -f "${MANIFEST_PATH}" ]; then
    echo "ERROR: pnsb_website __manifest__.py not found!"
    exit 1
fi

if [ ! -f "${INIT_PATH}" ]; then
    echo "ERROR: pnsb_website __init__.py not found!"
    exit 1
fi

echo "==> pnsb_website directory found"
echo "==> __manifest__.py found"
echo "==> __init__.py found"

echo "==> Module directory contents:"
find "${MODULE_PATH}" -maxdepth 2 -type f -print | sort

echo "========================================"
echo " Checking Odoo manifest"
echo "========================================"

python3 - <<'PY'
import os
import sys
import ast

module_path = "/mnt/extra-addons/pnsb_website"
manifest_path = os.path.join(module_path, "__manifest__.py")

print("Manifest:", manifest_path)

try:
    with open(manifest_path, "r", encoding="utf-8") as f:
        source = f.read()

    tree = ast.parse(source, filename=manifest_path)

    manifest = None

    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name) and target.id == "__manifest__":
                    manifest = ast.literal_eval(node.value)

    if not isinstance(manifest, dict):
        print("ERROR: __manifest__ does not contain a valid dictionary")
        sys.exit(1)

    print("==> Manifest parsed successfully")
    print("Name:", manifest.get("name"))
    print("Version:", manifest.get("version"))
    print("Depends:", manifest.get("depends"))
    print("Installable:", manifest.get("installable"))
    print("Application:", manifest.get("application"))

    if not manifest.get("installable", False):
        print("ERROR: Module is not marked installable!")
        sys.exit(1)

except Exception as e:
    print("========================================")
    print("MANIFEST LOAD ERROR")
    print("========================================")
    print(repr(e))
    sys.exit(1)
PY

echo "========================================"
echo " Odoo addons path"
echo "========================================"

echo "/usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons"

echo "========================================"
echo " Updating Odoo base modules"
echo "========================================"

odoo \
    --config=/etc/odoo/odoo.conf \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}" \
    -d "${DB_NAME}" \
    --update=base \
    --stop-after-init

echo "==> Base module update completed"

echo "========================================"
echo " Installing PNSB Website module"
echo "========================================"

odoo \
    --config=/etc/odoo/odoo.conf \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}" \
    -d "${DB_NAME}" \
    --init=pnsb_website \
    --stop-after-init

echo "==> pnsb_website initialization completed"

echo "========================================"
echo " Checking installed module states"
echo "========================================"

python3 - <<'PY'
import os
import psycopg2

conn = psycopg2.connect(
    host=os.environ["DB_HOST"],
    port=os.environ.get("DB_PORT", "5432"),
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    dbname=os.environ.get("DB_NAME", "pnsb"),
)

cur = conn.cursor()

cur.execute("""
    SELECT name, state
    FROM ir_module_module
    WHERE name IN ('base', 'web', 'website', 'pnsb_website')
    ORDER BY name
""")

rows = cur.fetchall()

print("")
print("========== MODULE STATUS ==========")

for name, state in rows:
    print(f"{name}: {state}")

print("===================================")
print("")

conn.close()
PY

echo "========================================"
echo " Starting Odoo HTTP server"
echo "========================================"

exec odoo \
    --config=/etc/odoo/odoo.conf \
    --http-port="${PORT:-10000}" \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}"