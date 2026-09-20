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

echo "========================================"
echo " Checking custom addons"
echo "========================================"

if [ -d "/mnt/extra-addons" ]; then
    echo "==> Custom addons directory found:"
    ls -la /mnt/extra-addons
else
    echo "WARNING: /mnt/extra-addons does not exist"
fi

echo "========================================"
echo " Odoo configuration"
echo "========================================"

echo "==> Database Host: ${DB_HOST}"
echo "==> Database Port: ${DB_PORT}"
echo "==> Database User: ${DB_USER}"
echo "==> HTTP Port: ${PORT:-10000}"

echo "========================================"
echo " Starting Odoo"
echo "========================================"

exec odoo \
    --config=/etc/odoo/odoo.conf \
    --http-port="${PORT:-10000}" \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}"