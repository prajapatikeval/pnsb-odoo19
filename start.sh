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
echo " Checking addons"
echo "========================================"

ODOO_ADDONS="/usr/lib/python3/dist-packages/odoo/addons"
CUSTOM_ADDONS="/mnt/extra-addons"

if [ ! -d "$ODOO_ADDONS" ]; then
    echo "ERROR: Odoo addons directory not found!"
    echo "$ODOO_ADDONS"
    exit 1
fi

echo "==> Odoo addons found:"
echo "$ODOO_ADDONS"

if [ ! -d "$CUSTOM_ADDONS" ]; then
    echo "ERROR: Custom addons directory not found!"
    echo "$CUSTOM_ADDONS"
    exit 1
fi

echo "==> Custom addons found:"
echo "$CUSTOM_ADDONS"

if [ -d "$CUSTOM_ADDONS/pnsb_website" ]; then
    echo "==> pnsb_website module found"
else
    echo "WARNING: pnsb_website module not found"
fi

echo "========================================"
echo " Odoo addons path"
echo "========================================"

echo "$ODOO_ADDONS,$CUSTOM_ADDONS"

echo "========================================"
echo " Starting Odoo HTTP server"
echo "========================================"

exec odoo \
    --config=/etc/odoo/odoo.conf \
    --addons-path="$ODOO_ADDONS,$CUSTOM_ADDONS" \
    --http-port="${PORT:-10000}" \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}"