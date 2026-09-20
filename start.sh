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

echo "========================================"
echo " Checking PNSB module files"
echo "========================================"

MODULE_DIR="/mnt/extra-addons/pnsb_website"

if [ ! -d "$MODULE_DIR" ]; then
    echo "ERROR: Module directory not found:"
    echo "$MODULE_DIR"
    exit 1
fi

if [ ! -f "$MODULE_DIR/__manifest__.py" ]; then
    echo "ERROR: __manifest__.py not found:"
    echo "$MODULE_DIR/__manifest__.py"
    exit 1
fi

echo "Module directory found:"
echo "$MODULE_DIR"

echo "Manifest found:"
echo "$MODULE_DIR/__manifest__.py"

if [ ! -f "$MODULE_DIR/__init__.py" ]; then
    echo "ERROR: __init__.py not found"
    exit 1
fi

echo "__init__.py found"

echo "========================================"
echo " Odoo addons paths"
echo "========================================"

echo "/usr/lib/python3/dist-packages/odoo/addons"
echo "/mnt/extra-addons"

echo "========================================"
echo " Initializing Odoo modules"
echo "========================================"

odoo \
    --config=/etc/odoo/odoo.conf \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}" \
    -d "${DB_NAME}" \
    --init=base,web,website,pnsb_website \
    --stop-after-init

echo "========================================"
echo " Odoo module initialization completed"
echo "========================================"

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