# -*- coding: utf-8 -*-
# Runs before the field change: when eCommerce is already loaded, copy "Show on
# Website" into is_published so the related field starts from the same values.


def migrate(cr, version):
    cr.execute("""
        SELECT 1 FROM information_schema.columns
         WHERE table_name = 'product_template' AND column_name = 'is_published'
    """)
    if cr.fetchone():
        cr.execute("""
            UPDATE product_template
               SET is_published = COALESCE(pnsb_website_published, FALSE)
        """)
