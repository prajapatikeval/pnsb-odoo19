#!/bin/bash
set -e

exec odoo \
    --config=/etc/odoo/odoo.conf \
    --http-port=${PORT:-10000} \
    --db_host="${DB_HOST}" \
    --db_port="${DB_PORT}" \
    --db_user="${DB_USER}" \
    --db_password="${DB_PASSWORD}"
