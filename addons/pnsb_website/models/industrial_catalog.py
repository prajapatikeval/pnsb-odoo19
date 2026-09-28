# -*- coding: utf-8 -*-
from odoo import api, fields, models

PLACEHOLDER_IMAGE = '/pnsb_website/static/src/img/placeholder.svg'


class IndustrialImageSource(models.AbstractModel):
    """Uploaded image with an optional external URL fallback (CDN / stock photo)."""
    _name = 'industrial.image.source'
    _description = 'Industrial Image Source'
    _inherit = ['image.mixin']

    image_url = fields.Char(
        string='External Image URL',
        help='Used on the website when no image is uploaded (e.g. a CDN or stock-photo link).')

    def _ip_image_src(self, width=1200):
        """Return the best URL for the requested display width."""
        self.ensure_one()
        if self.image_1920:
            if width > 1024:
                field = 'image_1920'
            elif width > 512:
                field = 'image_1024'
            elif width > 256:
                field = 'image_512'
            else:
                field = 'image_256'
            unique = self.write_date and int(self.write_date.timestamp()) or ''
            return '/web/image/%s/%s/%s?unique=%s' % (self._name, self.id, field, unique)
        url = self.image_url or ''
        if url and 'images.pexels.com' in url and '?' not in url:
            url += '?auto=compress&cs=tinysrgb&w=%d' % width
        return url or PLACEHOLDER_IMAGE

    def _ip_image_srcset(self, widths=(480, 800, 1200, 1800)):
        self.ensure_one()
        return ', '.join('%s %dw' % (self._ip_image_src(w), w) for w in widths)


class IndustrialProductCategory(models.Model):
    _name = 'industrial.product.category'
    _description = 'Industrial Product Category'
    _inherit = ['industrial.image.source', 'website.published.mixin', 'website.seo.metadata']
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    tagline = fields.Char(translate=True)
    description = fields.Text(translate=True)
    size_range = fields.Char(help='Displayed size span, e.g. "M5 – M48".')
    standards = fields.Char(help='Main standards, e.g. "DIN 931 · ISO 4014".')
    product_ids = fields.One2many('industrial.product', 'category_id', string='Products')
    product_count = fields.Integer(compute='_compute_product_count')

    def _default_is_published(self):
        return True

    @api.depends('product_ids')
    def _compute_product_count(self):
        counts = dict(self.env['industrial.product']._read_group(
            [('category_id', 'in', self.ids)], ['category_id'], ['__count']))
        for category in self:
            category.product_count = counts.get(category, 0)

    def _compute_website_url(self):
        super()._compute_website_url()
        for category in self:
            if category.id:
                category.website_url = '/products/category/%s' % self.env['ir.http']._slug(category)


class IndustrialMaterial(models.Model):
    _name = 'industrial.material'
    _description = 'Fastener Material'
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True)
    code = fields.Char(help='Short designation shown on the website, e.g. "A4-80".')
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    family = fields.Selection([
        ('carbon', 'Carbon steel'),
        ('alloy', 'Alloy steel'),
        ('stainless', 'Stainless steel'),
        ('nonferrous', 'Non-ferrous'),
        ('titanium', 'Titanium'),
        ('other', 'Other'),
    ], default='carbon', required=True)
    swatch = fields.Selection([
        ('steel', 'Dark steel'),
        ('black', 'Blackened steel'),
        ('stainless', 'Bright stainless'),
        ('brass', 'Brass'),
        ('titanium', 'Titanium'),
    ], default='steel', required=True, help='Metal rendering used by the website explorer.')
    description = fields.Text(translate=True)
    tensile_strength = fields.Integer(string='Tensile strength (MPa)')
    yield_strength = fields.Integer(string='Yield strength (MPa)')
    max_temperature = fields.Integer(string='Max. service temp. (°C)')
    density = fields.Float(string='Density (g/cm³)', digits=(4, 2))
    strength_rating = fields.Integer(default=3, help='1 (low) to 5 (high)')
    corrosion_rating = fields.Integer(default=2, help='1 (low) to 5 (high)')
    cost_rating = fields.Integer(default=2, help='1 (economical) to 5 (premium)')
    show_in_explorer = fields.Boolean(default=True, string='Show in Website Explorer')


class IndustrialFinish(models.Model):
    _name = 'industrial.finish'
    _description = 'Fastener Surface Finish'
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True)
    code = fields.Char()
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    swatch = fields.Selection([
        ('none', 'Self colour'),
        ('zinc', 'Zinc (clear)'),
        ('yellow', 'Yellow zinc'),
        ('hdg', 'Hot-dip galvanised'),
        ('flake', 'Zinc flake'),
        ('black', 'Black oxide'),
        ('zinc_nickel', 'Zinc-nickel'),
    ], default='none', required=True)
    description = fields.Text(translate=True)
    thickness = fields.Char(help='Typical coating thickness, e.g. "5 – 12 µm".')
    salt_spray_hours = fields.Integer(string='Salt spray (h)', help='Indicative neutral salt spray resistance (ISO 9227).')
    corrosion_rating = fields.Integer(default=2, help='1 (low) to 5 (high)')
    nut_factor = fields.Float(
        string='Nut factor K', digits=(3, 2), default=0.20,
        help='Torque coefficient used by the website torque calculator (T = K · d · F).')
    show_in_explorer = fields.Boolean(default=True, string='Show in Website Explorer')


class IndustrialSector(models.Model):
    _name = 'industrial.sector'
    _description = 'Industry Served'
    _inherit = ['industrial.image.source', 'website.published.mixin']
    _order = 'sequence, id'

    name = fields.Char(required=True, translate=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    tagline = fields.Char(translate=True)
    description = fields.Text(translate=True)
    product_ids = fields.Many2many(
        'industrial.product', 'industrial_product_sector_rel', 'sector_id', 'product_id',
        string='Products')

    def _default_is_published(self):
        return True
