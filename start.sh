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

echo "==> Checking module files..."

if [ ! -f "/mnt/extra-addons/pnsb_website/__manifest__.py" ]; then
    echo "ERROR: pnsb_website manifest not found!"
    exit 1
fi

echo "==> pnsb_website manifest found"

echo "==> Odoo addons path:"
echo "/usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons"

echo "==> Initializing/updating Odoo modules..."

odoo \
    --config=/etc/odoo/odoo.conf \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}" \
    -d "${DB_NAME}" \
    --stop-after-init

echo "==> Odoo module initialization completed"

echo "==> Checking installed module states..."

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
    WHERE name IN ('base')
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

echo "==> Starting Odoo HTTP server..."

exec odoo \
    --config=/etc/odoo/odoo.conf \
    --http-port="${PORT:-10000}" \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}"