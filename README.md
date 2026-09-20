# PNSB Odoo 19 V5

Render deployment fix: if the PostgreSQL database already exists but the PNSB module was never installed, startup explicitly runs Odoo module initialization for `pnsb_website` instead of assuming the database is complete.

This keeps the existing database and ensures the `website` dependency and `pnsb_website` module are installed before the HTTP server starts.
