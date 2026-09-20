{
    "name": "PNSB Machinery Website",
    "version": "19.0.1.0.0",
    "summary": "PNSB Machinery Industries website",
    "category": "Website",
    "license": "LGPL-3",
    "depends": ["website"],
    "data": [
        "security/ir.model.access.csv",
        "views/enquiry_views.xml",
        "views/website_templates.xml"
    ],
    "assets": {
        "web.assets_frontend": [
            "pnsb_website/static/src/css/pnsb.css",
            "pnsb_website/static/src/js/pnsb.js"
        ]
    },
    "installable": True,
    "application": True
}
