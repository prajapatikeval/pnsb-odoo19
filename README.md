# PNSB Odoo 19 Community Website

Temporary Odoo 19 Community testing setup for Render.

## GitHub
Extract this ZIP and push the files/folders inside it to the ROOT of your GitHub repository.

## Render
Create a Render Blueprint/Web Service from the GitHub repository. The included `render.yaml` creates the Odoo web service and PostgreSQL database and passes the database connection values into the Odoo container.

The `Dockerfile` builds the Odoo 19 container and installs the `pnsb_website` custom module.

This setup is intended for testing, not production data.
