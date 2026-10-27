# -*- coding: utf-8 -*-
from odoo import api, fields, models
from odoo.tools import html2plaintext


# Home page "Our Top Products": at most this many categories.
TOP_CATEGORY_LIMIT = 5


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
    pnsb_website_top = fields.Boolean(
        string='Is Top Product Category',
        help="Show this category under \"Our Top Products\" on the home page. At most "
             "%s categories are shown, in Website Sequence order, and only categories with "
             "at least one product shown on the website." % TOP_CATEGORY_LIMIT)
    pnsb_website_top_warning = fields.Char(compute='_compute_pnsb_website_top_warning')

    @api.depends('name')
    def _compute_pnsb_website_key(self):
        for category in self:
            category.pnsb_website_key = '%s-%s' % (
                self.env['ir.http']._slugify(category.name or 'line') or 'line', category.id or 0)

    @api.model
    def _pnsb_top_shown(self):
        """Categories shown under Our Top Products on the home page."""
        candidates = self.search([
            ('pnsb_website_top', '=', True),
            ('pnsb_website_published', '=', True),
        ], order='pnsb_website_sequence, name')
        with_products = self.env['product.template'].search([
            ('categ_id', 'in', candidates.ids),
            ('pnsb_website_published', '=', True),
            ('sale_ok', '=', True),
        ]).categ_id
        return candidates.filtered(lambda c: c in with_products)[:TOP_CATEGORY_LIMIT]

    def _pnsb_top_problem(self):
        """Why this top category would not appear on the home page (or False)."""
        self.ensure_one()
        if not self.pnsb_website_top:
            return False
        if not self.pnsb_website_published:
            return 'This category is not shown on the website ("Show on Website" is off), ' \
                   'so it will not appear under Our Top Products on the home page.'
        category_id = self._origin.id
        has_products = category_id and self.env['product.template'].search_count([
            ('categ_id', '=', category_id),
            ('pnsb_website_published', '=', True),
            ('sale_ok', '=', True),
        ], limit=1)
        if not has_products:
            return 'This category has no products shown on the website, so it will not appear ' \
                   'under Our Top Products on the home page. Publish at least one of its products ' \
                   '(product form, Website tab, "Show on Website").'
        shown = self._pnsb_top_shown()
        if category_id not in shown.ids and len(shown) >= TOP_CATEGORY_LIMIT:
            return 'The home page shows only the first %s top product categories (in Website ' \
                   'Sequence order): %s. Give this category a lower Website Sequence to show it.' % (
                       TOP_CATEGORY_LIMIT, ', '.join(shown.mapped('name')))
        return False

    @api.depends('pnsb_website_top', 'pnsb_website_published', 'pnsb_website_sequence')
    def _compute_pnsb_website_top_warning(self):
        for category in self:
            category.pnsb_website_top_warning = category._pnsb_top_problem() or False

    @api.onchange('pnsb_website_top', 'pnsb_website_published')
    def _onchange_pnsb_website_top(self):
        problem = self.pnsb_website_top and self._pnsb_top_problem()
        if problem:
            return {'warning': {'title': 'Not shown on the home page', 'message': problem}}


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
        string='Is Recently Developed',
        help="Show this product under \"Recent developments\" on the home page "
             "(at most 6, in Website Sequence order).")
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
