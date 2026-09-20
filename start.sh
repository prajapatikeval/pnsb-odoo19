#!/bin/bash
set -euo pipefail

DB_NAME="${DB_NAME:-pnsb}"
DB_HOST="${DB_HOST:?DB_HOST is required}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:?DB_USER is required}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD is required}"
PORT="${PORT:-10000}"

ODOO=(odoo
  --config=/etc/odoo/odoo.conf
  --db_host="${DB_HOST}"
  --db_port="${DB_PORT}"
  --db_user="${DB_USER}"
  --db_password="${DB_PASSWORD}"
)

echo "========================================"
echo " PNSB ODOO 19 STARTUP"
echo "========================================"

echo "==> Waiting for PostgreSQL at ${DB_HOST}:${DB_PORT}..."
until python3 - <<'PY'
import os
import socket

host = os.environ["DB_HOST"]
port = int(os.environ.get("DB_PORT", "5432"))

with socket.socket() as s:
    s.settimeout(2)
    s.connect((host, port))
PY
do
  sleep 2
done

echo "==> PostgreSQL is reachable"

if [ ! -f /mnt/extra-addons/pnsb_website/__manifest__.py ]; then
  echo "ERROR: /mnt/extra-addons/pnsb_website/__manifest__.py not found"
  exit 1
fi

echo "==> Checking database '${DB_NAME}'..."

DB_EXISTS="$(python3 - <<'PY'
import os
import psycopg2

conn = psycopg2.connect(
    host=os.environ["DB_HOST"],
    port=os.environ.get("DB_PORT", "5432"),
    user=os.environ["DB_USER"],
    password=os.environ["DB_PASSWORD"],
    dbname="postgres",
)
conn.autocommit = True
cur = conn.cursor()
cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (os.environ.get("DB_NAME", "pnsb"),))
print("yes" if cur.fetchone() else "no")
cur.close()
conn.close()
PY
)"

if [ "${DB_EXISTS}" = "no" ]; then
  echo "==> Database does not exist. Creating and initializing '${DB_NAME}'..."
  "${ODOO[@]}" db init "${DB_NAME}" --language=en_US
  echo "==> Database initialized"
else
  echo "==> Database already exists"
fi

echo "==> Installing/updating pnsb_website..."
"${ODOO[@]}" -d "${DB_NAME}" -i pnsb_website --stop-after-init

echo "==> pnsb_website installation/update completed"

echo "==> Starting Odoo on port ${PORT}..."

exec "${ODOO[@]}" \
  --http-port="${PORT}" \
  -d "${DB_NAME}"
