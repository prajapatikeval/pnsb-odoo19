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
echo " ODOO CONFIGURATION"
echo "========================================"

echo "==> Odoo addons paths:"
echo "    /usr/lib/python3/dist-packages/odoo/addons"
echo "    /mnt/extra-addons"

echo "==> Custom addons directory:"

if [ -d "/mnt/extra-addons" ]; then
    ls -la /mnt/extra-addons
else
    echo "WARNING: /mnt/extra-addons does not exist"
fi

echo "========================================"
echo " STARTING ODOO"
echo "========================================"

# IMPORTANT:
#
# Do NOT use --init here.
# Do NOT use -d here.
#
# Odoo Database Manager will create and initialize
# new databases itself.
#
# Website will NOT be pre-installed.
# Custom modules will NOT be pre-installed.

exec odoo \
    --config=/etc/odoo/odoo.conf \
    --http-port="${PORT:-10000}" \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT:-5432}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}"