# -*- coding: utf-8 -*-
{
    'name': "PNSB Machinery Industries Website",
    'author': 'PNSB Machinery Industries',
    'category': 'Website/Website',
    'summary': "Motion-rich website for PNSB Machinery Industries: product catalogue, "
               "quote basket, RFQ pipeline and engineering tools.",
    'website': 'https://pnsb-odoo19.onrender.com',
    'company': 'PNSB Machinery Industries',
    'maintainer': 'Botspot Infoware Pvt. Ltd.',
    'description': """
PNSB Machinery Industries website
=================================
* Cinematic home page with smooth scrolling and scroll-driven storytelling.
* Product catalogue with instant filters, comparison and a quote basket.
* Multi-step request-for-quotation form with drawing uploads.
* Backend: catalogue management and an RFQ pipeline with chatter.
""",
    'version': '19.0.2.0.0',
    'depends': ['website', 'mail'],
    'data': [
        'security/security.xml',
        'security/ir.model.access.csv',
        'data/ir_sequence_data.xml',
        'data/mail_template_data.xml',
        'views/industrial_product_views.xml',
        'views/industrial_catalog_views.xml',
        'views/industrial_rfq_views.xml',
        'views/industrial_menus.xml',
        'views/website_layout_templates.xml',
        'views/website_home_templates.xml',
        'views/website_catalog_templates.xml',
        'views/website_compare_templates.xml',
        'views/website_quote_templates.xml',
        'data/industrial_catalog_data.xml',
        'data/website_setup_data.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'pnsb_website/static/src/scss/tokens.scss',
            'pnsb_website/static/src/scss/base.scss',
            'pnsb_website/static/src/scss/components.scss',
            'pnsb_website/static/src/scss/chrome.scss',
            'pnsb_website/static/src/scss/home.scss',
            'pnsb_website/static/src/scss/catalog.scss',
            'pnsb_website/static/src/scss/product.scss',
            'pnsb_website/static/src/scss/quote.scss',
            'pnsb_website/static/src/js/core/*.js',
            'pnsb_website/static/src/js/interactions/*.js',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'images': ['static/description/icon.png'],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
