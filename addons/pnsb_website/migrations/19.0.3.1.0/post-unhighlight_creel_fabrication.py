# -*- coding: utf-8 -*-
# Client request (2026-10): "Creel Stand Fabrication" (Custom Fabrication) no
# longer appears under Recent developments on the home page. product_data.xml is
# noupdate, so existing databases are updated here once.


def migrate(cr, version):
    cr.execute("""
        UPDATE product_template
           SET pnsb_website_highlight = FALSE
         WHERE id IN (SELECT res_id FROM ir_model_data
                       WHERE module = 'pnsb_website'
                         AND model = 'product.template'
                         AND name = 'product_creel_fabrication')
    """)
