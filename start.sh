#!/bin/bash
set -e

DB_NAME="${DB_NAME:-pnsb}"

echo "==> Waiting for PostgreSQL..."
until python3 - <<'PY'
import os, socket
host=os.environ.get("DB_HOST")
port=int(os.environ.get("DB_PORT","5432"))
s=socket.socket()
s.settimeout(2)
try:
    s.connect((host,port))
    print("PostgreSQL reachable")
    raise SystemExit(0)
except Exception:
    raise SystemExit(1)
finally:
    s.close()
PY
do
  sleep 2
done

echo "==> Checking Odoo database..."
if ! python3 - <<'PY'
import os, psycopg2
conn=psycopg2.connect(
    host=os.environ["DB_HOST"],
    port=os.environ.get("DB_PORT","5432"),
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    dbname=os.environ.get("DB_NAME","pnsb"),
)
cur=conn.cursor()
cur.execute("SELECT to_regclass('public.ir_module_module')")
exists=cur.fetchone()[0] is not None
conn.close()
raise SystemExit(0 if exists else 1)
PY
then
  echo "==> Fresh/empty database detected. Initializing Odoo and installing pnsb_website..."
  odoo     --config=/etc/odoo/odoo.conf     --db_host="${DB_HOST}"     --db_port="${DB_PORT}"     --db_user="${DB_USER}"     --db_password="${DB_PASSWORD}"     -d "${DB_NAME}"     --init=pnsb_website     --without-demo=all     --stop-after-init
  echo "==> Odoo database initialization completed."
else
  echo "==> Odoo database already initialized."
fi

echo "==> Starting Odoo HTTP server..."
exec odoo   --config=/etc/odoo/odoo.conf   --http-port="${PORT:-10000}"   --db_host="${DB_HOST}"   --db_port="${DB_PORT}"   --db_user="${DB_USER}"   --db_password="${DB_PASSWORD}"
