# PNSB Odoo 19 - Render Deployment

This project runs Odoo 19 with the custom `pnsb_website` addon on Render.

## Deployment behavior

The container startup script:

1. Waits for PostgreSQL to become reachable.
2. Checks whether the configured database exists.
3. Creates/initializes the database with Odoo 19 `db init` when it does not exist.
4. Installs/updates `pnsb_website` using Odoo's `-i` module option.
5. Starts the Odoo HTTP server on Render's `PORT`.

The custom addon is available at `/mnt/extra-addons/pnsb_website` and depends on the standard Odoo `website` module.

## Render environment variables

`render.yaml` provisions the PostgreSQL database and supplies:

- `DB_NAME`
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `PORT`

Do not use `--force` with `db init` in production because it would delete an existing database.
