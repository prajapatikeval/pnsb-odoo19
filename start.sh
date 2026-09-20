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
s.settimeout(3)

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

echo "==> Checking database: ${DB_NAME}"

DB_EXISTS=$(python3 - <<'PY'
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

cur.execute(
    "SELECT 1 FROM pg_database WHERE datname = %s",
    (os.environ.get("DB_NAME", "pnsb"),)
)

print("yes" if cur.fetchone() else "no")

cur.close()
conn.close()
PY
)

if [ "$DB_EXISTS" = "no" ]; then

    echo "==> Database does not exist"
    echo "==> Creating and initializing ${DB_NAME}..."

    odoo \
        --config=/etc/odoo/odoo.conf \
        --db_host="${DB_HOST}" \
        --db_port="${DB_PORT:-5432}" \
        --db_user="${DB_USER}" \
        --db_password="${DB_PASSWORD}" \
        db init "${DB_NAME}"

    echo "==> Database initialization completed"

else

    echo "==> Database ${DB_NAME} already exists"

    INITIALIZED=$(python3 - <<'PY'
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
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'ir_module_module'
    )
""")

print("yes" if cur.fetchone()[0] else "no")

cur.close()
conn.close()
PY
)

    if [ "$INITIALIZED" = "no" ]; then

        echo "==> Database exists but is NOT initialized"
        echo "==> Initializing database..."

        odoo \
            --config=/etc/odoo/odoo.conf \
            --db_host="${DB_HOST}" \
            --db_port="${DB_PORT:-5432}" \
            --db_user="${DB_USER}" \
            --db_password="${DB_PASSWORD}" \
            db init "${DB_NAME}"

        echo "==> Database initialization completed"

    else

        echo "==> Database is already initialized"

    fi

fi

echo "==> Starting Odoo HTTP server..."

exec odoo \
    --config=/etc/odoo/odoo.conf \
    --http-port="${PORT:-10000}" \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT:-5432}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}"