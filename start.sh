#!/bin/bash
set -e

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

echo "==> Odoo addons path:"
echo "/usr/lib/python3/dist-packages/odoo/addons,/mnt/extra-addons"

echo "==> Checking custom addon..."

if [ -d "/mnt/extra-addons/pnsb_website" ]; then
    echo "==> pnsb_website addon found"
else
    echo "==> pnsb_website addon not found"
fi

echo "==> Starting Odoo..."

exec odoo \
    --config=/etc/odoo/odoo.conf \
    --http-port="${PORT:-10000}" \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}"