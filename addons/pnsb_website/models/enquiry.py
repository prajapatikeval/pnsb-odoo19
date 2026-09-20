from odoo import fields, models
class PNSBEnquiry(models.Model):
    _name = "pnsb.enquiry"
    _description = "PNSB Website Enquiry"
    _order = "create_date desc"
    name = fields.Char(required=True)
    email = fields.Char()
    phone = fields.Char()
    company = fields.Char()
    message = fields.Text()
    state = fields.Selection([("new","New"),("contacted","Contacted"),("closed","Closed")],
                             default="new", required=True)
