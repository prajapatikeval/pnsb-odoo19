"""Repair missing local filestore attachments before the module is installed."""

import os

from odoo import SUPERUSER_ID, api
from odoo.tools import config


def pre_init_hook(cr):
    """Remove DB attachment rows whose backing files disappeared.

    Render web services have ephemeral local filesystems unless a persistent
    disk is mounted. If the PostgreSQL database survives but the Odoo
    filestore does not, Odoo keeps attachment metadata pointing at files that
    no longer exist. Those stale records cause HTTP 500 responses for assets
    and images. Removing only the broken file-backed attachments lets Odoo
    regenerate assets and avoids touching attachments whose data still exists.
    """
    data_dir = config.get("data_dir")
    if not data_dir:
        return

    filestore = os.path.join(data_dir, "filestore", cr.dbname)
    if not os.path.isdir(filestore):
        return

    env = api.Environment(cr, SUPERUSER_ID, {})
    attachments = env["ir.attachment"].sudo().search(
        [("store_fname", "!=", False)]
    )

    broken = []
    for attachment in attachments:
        store_fname = attachment.store_fname
        if not store_fname:
            continue
        path = os.path.join(filestore, store_fname)
        if not os.path.isfile(path):
            broken.append(attachment)

    if broken:
        env["ir.attachment"].sudo().browse([a.id for a in broken]).unlink()
        cr.commit()
