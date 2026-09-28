# -*- coding: utf-8 -*-
import json

from odoo import api, fields, models


class IndustrialProduct(models.Model):
    _name = 'industrial.product'
    _description = 'Industrial Product Family'
    _inherit = [
        'industrial.image.source',
        'mail.thread',
        'website.seo.metadata',
        'website.published.multi.mixin',
    ]
    _order = 'is_featured desc, sequence, id'

    name = fields.Char(required=True, translate=True, tracking=True)
    default_code = fields.Char(string='Family Code', help='Internal reference, e.g. "HB-933".')
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    category_id = fields.Many2one('industrial.product.category', string='Category', ondelete='restrict', index=True)
    tagline = fields.Char(translate=True)
    description = fields.Html(translate=True, sanitize=True)

    standard = fields.Char(help='Standards covered, e.g. "DIN 933 · ISO 4017".')
    grade = fields.Char(string='Property Classes', help='e.g. "8.8 · 10.9 · 12.9" or "A2-70 · A4-80".')
    thread_type = fields.Selection([
        ('metric', 'Metric coarse (M)'),
        ('metric_fine', 'Metric fine (MF)'),
        ('unc', 'UNC'),
        ('unf', 'UNF'),
        ('bsw', 'BSW'),
        ('none', 'Not threaded'),
    ], default='metric')
    head_type = fields.Char()
    drive_type = fields.Char()
    drawing_type = fields.Selection([
        ('hex_bolt', 'Hex bolt / screw'),
        ('socket_screw', 'Socket cap screw'),
        ('nut', 'Nut'),
        ('washer', 'Washer'),
        ('rod', 'Threaded rod / stud'),
        ('custom', 'Custom / turned part'),
    ], default='hex_bolt', required=True, help='Technical drawing shown on the product page.')
    dim_a_label = fields.Char(string='Dimension A Label', default='s · Across flats', translate=True)
    dim_b_label = fields.Char(string='Dimension B Label', default='k · Head height', translate=True)

    material_ids = fields.Many2many('industrial.material', string='Materials')
    finish_ids = fields.Many2many('industrial.finish', string='Finishes')
    sector_ids = fields.Many2many(
        'industrial.sector', 'industrial_product_sector_rel', 'product_id', 'sector_id',
        string='Industries')

    moq = fields.Integer(string='Minimum Order Qty (pcs)', default=500)
    lead_time = fields.Char(default='2 – 3 weeks', translate=True)
    packaging = fields.Char(translate=True)
    is_featured = fields.Boolean(string='Featured')
    ribbon = fields.Char(translate=True, help='Small label on the product card, e.g. "New".')
    torque_tool = fields.Boolean(string='Show Torque Calculator', default=True)

    image_ids = fields.One2many('industrial.product.image', 'product_id', string='Gallery')
    spec_ids = fields.One2many('industrial.product.spec', 'product_id', string='Specifications', copy=True)
    size_ids = fields.One2many('industrial.product.size', 'product_id', string='Sizes', copy=True)

    datasheet = fields.Binary(attachment=True)
    datasheet_filename = fields.Char()

    size_range = fields.Char(compute='_compute_size_stats', store=True)
    size_min = fields.Float(compute='_compute_size_stats', store=True, string='Smallest Size (mm)')
    size_max = fields.Float(compute='_compute_size_stats', store=True, string='Largest Size (mm)')
    rfq_line_count = fields.Integer(compute='_compute_rfq_line_count', string='Quote Requests')

    @api.depends('size_ids.name', 'size_ids.nominal_diameter', 'size_ids.sequence')
    def _compute_size_stats(self):
        for product in self:
            sizes = product.size_ids.sorted(lambda s: (s.nominal_diameter, s.sequence))
            if sizes:
                first, last = sizes[0], sizes[-1]
                product.size_range = first.name if first == last else '%s – %s' % (first.name, last.name)
                product.size_min = first.nominal_diameter
                product.size_max = last.nominal_diameter
            else:
                product.size_range = False
                product.size_min = product.size_max = 0.0

    def _compute_rfq_line_count(self):
        counts = dict(self.env['industrial.rfq.line']._read_group(
            [('product_id', 'in', self.ids)], ['product_id'], ['__count']))
        for product in self:
            product.rfq_line_count = counts.get(product, 0)

    def _compute_website_url(self):
        super()._compute_website_url()
        for product in self:
            # No per-product pages: a family is shown inside its category listing.
            if product.id and product.category_id:
                product.website_url = product.category_id.website_url
            elif product.id:
                product.website_url = '/products'

    def action_view_rfq_lines(self):
        self.ensure_one()
        rfqs = self.env['industrial.rfq.line'].search([('product_id', '=', self.id)]).rfq_id
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._('Quote Requests'),
            'res_model': 'industrial.rfq',
            'view_mode': 'list,form',
            'domain': [('id', 'in', rfqs.ids)],
        }

    # ------------------------------------------------------------------
    # Website helpers
    # ------------------------------------------------------------------

    def _ip_card_payload(self):
        """Compact data used by catalogue filters, compare tray and quote basket."""
        self.ensure_one()
        return {
            'id': self.id,
            'name': self.name,
            'url': self.website_url,
            'image': self._ip_image_src(480),
            'category': self.category_id.id or 0,
            'categoryName': self.category_id.name or '',
            'materials': self.material_ids.ids,
            'finishes': self.finish_ids.ids,
            'standard': self.standard or '',
            'sizeMin': self.size_min,
            'sizeMax': self.size_max,
            'sizeRange': self.size_range or '',
            'featured': self.is_featured,
            'sequence': self.sequence,
            'moq': self.moq,
        }

    def _ip_card_json(self):
        return json.dumps(self._ip_card_payload())



class IndustrialProductImage(models.Model):
    _name = 'industrial.product.image'
    _description = 'Industrial Product Gallery Image'
    _inherit = ['industrial.image.source']
    _order = 'sequence, id'

    name = fields.Char(translate=True)
    sequence = fields.Integer(default=10)
    product_id = fields.Many2one('industrial.product', required=True, ondelete='cascade', index=True)

    def _can_return_content(self, field_name=None, access_token=None):
        if field_name in self._fields and not self._fields[field_name].groups \
                and self.sudo().product_id.website_published:
            return True
        return super()._can_return_content(field_name, access_token)


class IndustrialProductSpec(models.Model):
    _name = 'industrial.product.spec'
    _description = 'Industrial Product Specification'
    _order = 'sequence, id'

    product_id = fields.Many2one('industrial.product', required=True, ondelete='cascade', index=True)
    sequence = fields.Integer(default=10)
    group = fields.Char(default='General', translate=True)
    name = fields.Char(required=True, translate=True)
    value = fields.Char(required=True, translate=True)


class IndustrialProductSize(models.Model):
    _name = 'industrial.product.size'
    _description = 'Industrial Product Size'
    _order = 'nominal_diameter, sequence, id'

    product_id = fields.Many2one('industrial.product', required=True, ondelete='cascade', index=True)
    sequence = fields.Integer(default=10)
    name = fields.Char(string='Size', required=True, help='e.g. "M12" or "1/2\\""')
    nominal_diameter = fields.Float(string='Nominal Ø (mm)', digits=(6, 2))
    pitch = fields.Float(string='Pitch (mm)', digits=(4, 2))
    dim_a = fields.Float(string='Dimension A (mm)', digits=(6, 2))
    dim_b = fields.Float(string='Dimension B (mm)', digits=(6, 2))
    lengths = fields.Char(string='Length Range', help='e.g. "20 – 200 mm"')
    in_stock = fields.Boolean(default=True)
