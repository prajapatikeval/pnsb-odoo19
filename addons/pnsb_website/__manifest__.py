{
    "name": "PNSB Machinery Website",
    "version": "19.1",
    "category": "Website",
    "summary": "PNSB Machinery Industries public website",
    "author": "PNSB Machinery Industries",
    "license": "LGPL-3",
    "depends": ["website"],
    "data": [
        "security/ir.model.access.csv",
        "views/enquiry_views.xml",
        "views/website_templates.xml",
    ],
    "assets": {
        "web.assets_frontend": [
            "pnsb_website/static/src/css/pnsb.css",
            "pnsb_website/static/src/js/pnsb.js",
        ],
    },
    "pre_init_hook": "pre_init_hook",
    "installable": True,
    "application": True,
}
