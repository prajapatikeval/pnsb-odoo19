from odoo import fields, models
class PNSBProduct(models.Model):
    _name = "pnsb.product"
    _description = "PNSB Product"
    _order = "sequence, id"
    name = fields.Char(required=True)
    category = fields.Char()
    description = fields.Text()
    image = fields.Image(max_width=1600, max_height=1200)
    sequence = fields.Integer(default=10)
    published = fields.Boolean(default=True)
