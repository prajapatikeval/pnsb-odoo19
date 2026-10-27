# -*- coding: utf-8 -*-
import base64
import hashlib
import json
import re
from urllib.parse import quote_plus

from markupsafe import Markup

from odoo import api, fields, models
from odoo.tools.misc import file_open

DEFAULT_COMPANY_NAMES = {
    'My Company', 'YourCompany', 'Your Company', 'My Company (San Francisco)',
    'PNSB Machinery Industries',
}
DEFAULT_WEBSITE_NAMES = {'My Website', 'Website', 'website', 'PNSB Machinery Industries'}
COMPANY_NAME = 'PNSB Machinery Industries LLP'
# Contact details confirmed by PNSB (2026-10). Applied once per database
# (see CONTACT_MARKER); later edits in the backend are kept.
CONTACT_VERSION = '2026-10'
CONTACT_MARKER = 'pnsb_website.contact_version'
COMPANY_ADDRESS = {
    'street': '350/4 Ahmedabad Udhyogic Vasahat, Near Punmaji Estate',
    'street2': 'Dhobi Ghaat Road, Dudheshwar',
    'city': 'Ahmedabad',
    'zip': '380001',
}
PHONE_MAIN = '+91 88496 38874'
PHONE_SECOND = '+91 96246 84555'
WHATSAPP = '+91 96246 84555'
LOGO_PATH = 'pnsb_website/static/src/img/pnsb-logo.png'
FAVICON_PATH = 'pnsb_website/static/src/img/favicon.png'
SCRIPT_3D_PATH = 'pnsb_website/static/src/three/pnsb3d.js'
SCRIPT_BOOT_PATH = 'pnsb_website/static/src/boot/boot.js'
_STATIC_URLS = {}

# Industries named in PNSB's own company profile. Do not add industries the
# client has not confirmed. The text describes typical needs, not past clients.
# Rubber replaces the profile's Paper at the client's request (2026-10).
INDUSTRIES = [
    ('textile', 'Textile', 'Creel stands, yarn handling assemblies, tension devices and loom spares.'),
    ('petroleum', 'Petroleum', 'Seals, filtration and machined parts for process equipment.'),
    ('surgical', 'Surgical', 'Precision components developed to strict quality requirements.'),
    ('plastic', 'Plastic', 'Machine spares and parts that keep processing lines running.'),
    ('rubber', 'Rubber', 'Rotating parts, shafts and replacement spares for processing machinery.'),
    ('fire-safety', 'Fire Safety', 'Machined and fabricated parts for safety equipment.'),
    ('bearings', 'Bearings', 'Turned components and assemblies made to drawing.'),
    ('packaging', 'Packaging', 'Custom parts, guides and pulleys for packaging machinery.'),
]

# Services, worded from PNSB's company profile.
SERVICES = [
    ('design', 'Product Design & Development',
     'From your conceptual idea to a finished product: we take care of the complete product '
     'development cycle, with quality and approval standards in mind.'),
    ('prototype', 'Prototype Development',
     'Working prototypes that turn drawings and ideas into parts you can test, assess and improve '
     'before investing in production.'),
    ('manufacturing', 'Manufacturing Support',
     'Continuous production support. We can evaluate, adopt, equip and collaborate with your current '
     'manufacturers to achieve the required results.'),
    ('component', 'Component Engineering',
     'Engineering of individual components and assemblies, with attention to function, fit, material '
     'and manufacturability.'),
    ('improvement', 'Product Improvement',
     'Improvements for products already in production: material cost reduction and shorter cycle '
     'times, without compromising reliability.'),
    ('certification', 'Certification & Testing Support',
     'Support through certification and testing so your product meets the standards it is approved '
     'against.'),
]

PAGE_DESCRIPTIONS = {
    'home': 'PNSB Machinery Industries LLP, Ahmedabad: product design, development and manufacturing '
            'partner for machine spares, mechanical components and custom fabrication.',
    'about': 'PNSB Machinery Industries, established in 2019: customized products, specialized assemblies '
             'and engineering solutions for industrial customers and OEMs.',
    'services': 'Product design and development, prototypes, manufacturing support, component '
                'engineering, product improvement and certification support.',
    'industries': 'Industries PNSB works with: textile, petroleum, surgical, plastic, rubber, fire safety, '
                  'bearings and packaging.',
    'products': 'Textile machinery spares, filtration and airflow assemblies, mechanical components, '
                'precision machined parts and custom fabrication.',
    'contact': "Let's discuss your requirement. Send your enquiry, drawing or sample details to PNSB "
               "Machinery Industries LLP, Ahmedabad.",
}


class Website(models.Model):
    _inherit = 'website'

    pnsb_phone_alt = fields.Char(
        string='Second Phone',
        help="Optional second phone number shown on the website next to the company phone.")
    pnsb_whatsapp = fields.Char(
        string='WhatsApp Number',
        help="Number used by the floating WhatsApp button, with country code "
             "(e.g. +91 96246 84555). Leave empty to hide the button.")
    pnsb_whatsapp_link = fields.Char(compute='_compute_pnsb_whatsapp_link')
    pnsb_map_lat = fields.Float(
        string='Map Latitude', digits=(10, 7), default=23.0479236,
        help="Exact location of the workshop, used for the Google Maps link and the footer map.")
    pnsb_map_lng = fields.Float(string='Map Longitude', digits=(10, 7), default=72.5789081)

    @api.depends('pnsb_whatsapp')
    def _compute_pnsb_whatsapp_link(self):
        for website in self:
            digits = re.sub(r'\D', '', website.pnsb_whatsapp or '')
            website.pnsb_whatsapp_link = 'https://wa.me/%s' % digits if len(digits) >= 8 else False

    # ------------------------------------------------------------------
    # Values shared by every page of the public site
    # ------------------------------------------------------------------

    @api.model
    def _pnsb_static_url(self, path):
        """URL of a static file with a content hash, so browsers never keep a
        stale copy after a deploy (used for scripts loaded outside Odoo's
        bundles: the early boot script and the 3D module)."""
        if path not in _STATIC_URLS:
            with file_open(path, 'rb') as fh:
                digest = hashlib.sha1(fh.read()).hexdigest()[:10]
            _STATIC_URLS[path] = '/%s?v=%s' % (path, digest)
        return _STATIC_URLS[path]

    @api.model
    def _pnsb_3d_script_url(self):
        return self._pnsb_static_url(SCRIPT_3D_PATH)

    @api.model
    def _pnsb_boot_script_url(self):
        return self._pnsb_static_url(SCRIPT_BOOT_PATH)

    def _pnsb_map_url(self):
        self.ensure_one()
        if self.pnsb_map_lat and self.pnsb_map_lng:
            return 'https://www.google.com/maps/search/?api=1&query=%.7f,%.7f' % (self.pnsb_map_lat, self.pnsb_map_lng)
        company = self.company_id.sudo()
        return 'https://www.google.com/maps/search/?api=1&query=%s' % quote_plus(', '.join(filter(None, [
            company.street, company.street2, company.city, company.zip])))

    def _pnsb_layout_values(self, page):
        self.ensure_one()
        company = self.company_id.sudo()
        street = ', '.join(filter(None, [company.street, company.street2]))
        base_url = self.get_base_url()
        organization = {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            'name': company.name,
            'url': base_url,
            'logo': base_url + '/' + LOGO_PATH,
            'telephone': company.phone or None,
            'address': {
                '@type': 'PostalAddress',
                'streetAddress': street or None,
                'addressLocality': company.city or None,
                'postalCode': company.zip or None,
                'addressRegion': company.state_id.name or None,
                'addressCountry': company.country_id.code or None,
            },
        }
        address_lines = [line for line in [
            company.street, company.street2,
            ' '.join(filter(None, [company.city, company.zip])),
            ', '.join(filter(None, [company.state_id.name, company.country_id.name])),
        ] if line]
        return {
            'pnsb_page': page,
            'pnsb_company': company,
            'pnsb_website': self,
            'pnsb_services': SERVICES,
            'pnsb_industries': INDUSTRIES,
            'pnsb_address_lines': address_lines,
            'pnsb_map_url': self._pnsb_map_url(),
            'pnsb_description': PAGE_DESCRIPTIONS.get(page, PAGE_DESCRIPTIONS['home']),
            'pnsb_jsonld': Markup(json.dumps(organization).replace('</', '<\\/')),
        }

    # ------------------------------------------------------------------
    # Install / upgrade setup
    # ------------------------------------------------------------------

    @api.model
    def _pnsb_bootstrap(self):
        """Idempotent setup, safe to call on every install/upgrade.

        Only fills values that are empty or still Odoo / earlier-module
        defaults, so anything edited in the backend is never overwritten.
        """
        params = self.env['ir.config_parameter'].sudo()
        apply_contact = params.get_param(CONTACT_MARKER) != CONTACT_VERSION
        company = self.env.ref('base.main_company', raise_if_not_found=False)
        if company:
            vals = {}
            if company.name in DEFAULT_COMPANY_NAMES:
                vals['name'] = COMPANY_NAME
            if apply_contact or not company.street:
                india = self.env.ref('base.in', raise_if_not_found=False)
                gujarat = self.env['res.country.state'].search(
                    [('country_id', '=', india.id), ('code', '=', 'GJ')], limit=1) if india else False
                vals.update(COMPANY_ADDRESS)
                vals.update({
                    'state_id': gujarat.id if gujarat else False,
                    'country_id': india.id if india else False,
                })
            if apply_contact or not company.phone:
                vals['phone'] = PHONE_MAIN
            if not company.logo or company.logo == self._pnsb_default_company_logo():
                vals['logo'] = self._pnsb_read_image(LOGO_PATH)
            if vals:
                company.write(vals)
        for website in self.search([]):
            vals = {}
            if not website.homepage_url or website.homepage_url == '/':
                vals['homepage_url'] = '/industrial'
            if website.name in DEFAULT_WEBSITE_NAMES:
                vals['name'] = COMPANY_NAME
            if apply_contact or (not website.pnsb_whatsapp and not website.pnsb_phone_alt):
                vals.update({'pnsb_whatsapp': WHATSAPP, 'pnsb_phone_alt': PHONE_SECOND})
            if not website.logo:
                vals['logo'] = self._pnsb_read_image(LOGO_PATH)
            if not website.favicon or website.favicon == self._pnsb_default_favicon():
                vals['favicon'] = self._pnsb_read_image(FAVICON_PATH)
            if vals:
                website.write(vals)
        if apply_contact:
            params.set_param(CONTACT_MARKER, CONTACT_VERSION)

    @api.model
    def _pnsb_read_image(self, path):
        with file_open(path, 'rb') as fh:
            return base64.b64encode(fh.read())

    @api.model
    def _pnsb_default_company_logo(self):
        return self.env['res.company']._get_logo()

    @api.model
    def _pnsb_default_favicon(self):
        return self._default_favicon()
