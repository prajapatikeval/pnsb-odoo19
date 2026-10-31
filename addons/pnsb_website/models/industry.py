# -*- coding: utf-8 -*-
from odoo import api, fields, models

# Line icons available in the website's icon sprite (views/website_layout.xml).
INDUSTRY_ICONS = [
    ('textile', 'Textile'),
    ('petroleum', 'Petroleum'),
    ('surgical', 'Surgical'),
    ('plastic', 'Plastic'),
    ('rubber', 'Rubber'),
    ('fire-safety', 'Fire Safety'),
    ('bearings', 'Bearings'),
    ('packaging', 'Packaging'),
    ('component', 'General engineering'),
]


class PnsbIndustry(models.Model):
    """An industry shown on the website (/industries and /industries/<key>).

    Only industries PNSB has confirmed belong here: the website must not claim
    industries or clients the company has not named.
    """
    _name = 'pnsb.industry'
    _description = 'Website Industry'
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    website_published = fields.Boolean(
        string='Show on Website', default=True,
        help="List this industry on the website and publish its page.")
    url_key = fields.Char(
        string='URL Key', required=True, copy=False,
        help="Last part of the page address, e.g. \"textile\" for /industries/textile. "
             "Lowercase letters, digits and dashes; filled from the name when left empty.")
    icon = fields.Selection(INDUSTRY_ICONS, default='component', required=True)
    summary = fields.Text(
        string='Short Description', required=True, translate=True,
        help="One sentence shown in the industry lists and at the top of the industry page.")
    description = fields.Html(
        string='Page Content', translate=True, sanitize=True,
        help="Optional text for the industry page. Keep client names and specifications out of it.")
    image = fields.Image(
        string='Photo', max_width=1920, max_height=1920,
        help="Optional photo shown next to the page content.")
    product_ids = fields.Many2many(
        'product.template', 'pnsb_industry_product_rel', 'industry_id', 'product_id',
        string='Products',
        help="Products listed on this industry's page (only those shown on the website appear).")
    product_count = fields.Integer(compute='_compute_product_count', string='Products on Website')
    website_url = fields.Char(compute='_compute_website_url', string='Page URL')

    _url_key_unique = models.Constraint('UNIQUE(url_key)', 'Each industry needs its own URL key.')

    @api.model
    def _pnsb_slug(self, value):
        return self.env['ir.http']._slugify(value or '') or 'industry'

    @api.depends('url_key')
    def _compute_website_url(self):
        for industry in self:
            industry.website_url = '/industries/%s' % industry.url_key if industry.url_key else False

    @api.depends('product_ids.pnsb_website_published')
    def _compute_product_count(self):
        for industry in self:
            industry.product_count = len(industry.product_ids.filtered('pnsb_website_published'))

    @api.onchange('name')
    def _onchange_name_url_key(self):
        if self.name and not self.url_key:
            self.url_key = self._pnsb_slug(self.name)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals['url_key'] = self._pnsb_slug(vals.get('url_key') or vals.get('name'))
        return super().create(vals_list)

    def write(self, vals):
        if 'url_key' in vals:
            vals['url_key'] = self._pnsb_slug(vals['url_key'] or self[:1].name)
        return super().write(vals)

    def _pnsb_image_url(self):
        """Public URL of the industry photo (served by the website controller)."""
        self.ensure_one()
        unique = fields.Datetime.to_string(self.write_date or fields.Datetime.now())
        return '/pnsb/industry-image/%s?unique=%s' % (self.id, ''.join(c for c in unique if c.isdigit()))

    def action_view_on_website(self):
        self.ensure_one()
        return {'type': 'ir.actions.act_url', 'url': self.website_url, 'target': 'new'}


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    pnsb_industry_ids = fields.Many2many(
        'pnsb.industry', 'pnsb_industry_product_rel', 'product_id', 'industry_id',
        string='Industries',
        help="Industry pages on the website that list this product.")
