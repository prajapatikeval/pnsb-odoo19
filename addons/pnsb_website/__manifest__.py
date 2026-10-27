# -*- coding: utf-8 -*-
{
    'name': "PNSB Machinery Industries Website",
    'author': 'PNSB Machinery Industries LLP',
    'category': 'Website/Website',
    'summary': "Company website for PNSB Machinery Industries LLP: services, industries, "
               "product catalogue and enquiries that become Sales quotations or CRM leads.",
    'website': 'https://pnsb-odoo19.onrender.com',
    'description': """
PNSB Machinery Industries website
=================================
* Clean, responsive company website: Home, About, Services, Industries,
  Products & Work, Contact and a branded 404 page.
* Catalogue built on standard Odoo Products and Product Categories
  (Sales > Products > Website Products). No prices, no product pages.
* Visitors build an enquiry list; enquiries with products become draft
  Sales quotations, other messages become CRM leads, with uploaded drawings
  attached.
""",
    'version': '19.0.3.2.0',
    'depends': ['website', 'sale_management', 'crm'],
    'data': [
        'views/backend_views.xml',
        'views/website_layout.xml',
        'views/website_home.xml',
        'views/website_pages.xml',
        'views/website_products.xml',
        'views/website_contact.xml',
        'data/product_data.xml',
        'data/website_setup_data.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'pnsb_website/static/src/scss/pnsb.scss',
            'pnsb_website/static/src/js/pnsb.js',
        ],
    },
    'post_init_hook': 'post_init_hook',
    'images': ['static/description/icon.png'],
    'installable': True,
    'application': True,
    'license': 'LGPL-3',
}
