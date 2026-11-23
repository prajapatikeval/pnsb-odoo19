# -*- coding: utf-8 -*-
# "Show on Website" became eCommerce's "Published" (is_published). Copy the
# value each product had before the upgrade, whatever order the modules loaded in.


def migrate(cr, version):
    cr.execute("""
        UPDATE product_template
           SET is_published = pnsb_website_published
         WHERE pnsb_website_published IS NOT NULL
           AND is_published IS DISTINCT FROM pnsb_website_published
    """)
