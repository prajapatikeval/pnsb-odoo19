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

echo "==> Config file: /etc/odoo/odoo.conf"

echo "==> Addons paths:"
echo "    /usr/lib/python3/dist-packages/odoo/addons"
echo "    /var/lib/odoo/.local/share/Odoo/addons/19.0"
echo "    /mnt/extra-addons"

echo "========================================"
echo " STARTING ODOO"
echo "========================================"

# IMPORTANT:
# No database is selected here.
# No module is installed here.
# Website must be installed manually.
# Custom modules must be installed manually.

exec odoo \
    --config=/etc/odoo/odoo.conf \
    --http-port="${PORT:-10000}" \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT:-5432}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}"