# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.tools import html2plaintext


class ProductCategory(models.Model):
    """Product categories double as the website's product lines (filters)."""
    _inherit = 'product.category'

    pnsb_website_published = fields.Boolean(
        string='Show on Website', default=False,
        help="Show this category as a filter on the website's Products page.")
    pnsb_website_sequence = fields.Integer(string='Website Sequence', default=10)
    pnsb_website_description = fields.Text(
        string='Website Description', translate=True,
        help="One or two sentences shown on the website for this product line.")
    pnsb_website_key = fields.Char(
        string='Website Key', compute='_compute_pnsb_website_key',
        help="Stable identifier used by the website filters.")

    @api.depends('name')
    def _compute_pnsb_website_key(self):
        for category in self:
            category.pnsb_website_key = '%s-%s' % (
                self.env['ir.http']._slugify(category.name or 'line') or 'line', category.id or 0)


class ProductTemplate(models.Model):
    """Standard Odoo products, with the few fields the website needs.

    Products are quoted, never sold online: the website only lists them and
    collects enquiries that become Sales quotations.
    """
    _inherit = 'product.template'

    pnsb_website_published = fields.Boolean(
        string='Show on Website', default=False, copy=False,
        help="List this product on the website's Products page.")
    pnsb_website_sequence = fields.Integer(string='Website Sequence', default=10)
    pnsb_website_summary = fields.Text(
        string='Website Summary', translate=True,
        help="Short public description. Keep confidential details (client names, "
             "specifications, drawings) out of it.")
    pnsb_website_highlight = fields.Boolean(
        string='Highlight on Home Page',
        help="Feature this product in the work showcase on the home page.")
    pnsb_website_story = fields.Html(
        string='Development Story', translate=True, sanitize=True,
        help="Optional short case study shown when a visitor expands the product card.")

    def _pnsb_summary(self):
        self.ensure_one()
        return self.pnsb_website_summary or html2plaintext(self.description_sale or '')[:220]

    def _pnsb_image_url(self, size=1024):
        """Public URL of the product image (served by the website controller
        so visitors never need read access on product.template)."""
        self.ensure_one()
        size = size if size in (128, 256, 512, 1024, 1920) else 1024
        unique = fields.Datetime.to_string(self.write_date or fields.Datetime.now()).replace(' ', '').replace(':', '').replace('-', '')
        return '/pnsb/image/%s/%s?unique=%s' % (self.id, size, unique)
