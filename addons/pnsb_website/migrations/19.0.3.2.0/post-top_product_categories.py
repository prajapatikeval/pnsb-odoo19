# -*- coding: utf-8 -*-
# "Our Top Products" on the home page now shows only categories marked
# "Is Top Product Category". Mark the categories shown until now so the home
# page stays the same after the upgrade (product_data.xml is noupdate).


def migrate(cr, version):
    cr.execute("""
        UPDATE product_category
           SET pnsb_website_top = TRUE
         WHERE pnsb_website_published IS TRUE
    """)
