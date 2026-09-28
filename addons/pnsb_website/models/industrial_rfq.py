# -*- coding: utf-8 -*-
from odoo import api, fields, models


class IndustrialRfq(models.Model):
    _name = 'industrial.rfq'
    _description = 'Request for Quotation'
    _inherit = ['mail.thread', 'mail.activity.mixin']
    _order = 'priority desc, id desc'

    name = fields.Char(string='Reference', required=True, copy=False, readonly=True, default='New', index=True)
    state = fields.Selection([
        ('new', 'New'),
        ('review', 'In Review'),
        ('quoted', 'Quoted'),
        ('won', 'Won'),
        ('lost', 'Lost'),
    ], default='new', required=True, tracking=True, group_expand=True)
    priority = fields.Selection([('0', 'Normal'), ('1', 'Important'), ('2', 'Urgent')], default='0')
    source = fields.Selection([
        ('basket', 'Quote basket'),
        ('custom', 'Custom part / drawing'),
        ('product', 'Product page'),
    ], default='basket', required=True)

    contact_name = fields.Char(required=True, tracking=True)
    company_name = fields.Char(tracking=True)
    email = fields.Char(required=True, tracking=True)
    phone = fields.Char()
    country_id = fields.Many2one('res.country')
    partner_id = fields.Many2one('res.partner', string='Customer', tracking=True)
    user_id = fields.Many2one('res.users', string='Salesperson', tracking=True, domain=[('share', '=', False)])
    company_id = fields.Many2one('res.company', default=lambda self: self.env.company, required=True)
    website_id = fields.Many2one('website', readonly=True)

    required_date = fields.Date(string='Required By')
    delivery_location = fields.Char()
    message = fields.Text()
    lost_reason = fields.Char()

    currency_id = fields.Many2one(related='company_id.currency_id')
    amount_quoted = fields.Monetary(string='Quoted Value', currency_field='currency_id', tracking=True)

    line_ids = fields.One2many('industrial.rfq.line', 'rfq_id', string='Items', copy=True)
    line_count = fields.Integer(compute='_compute_line_stats', store=True, string='# Items')
    total_quantity = fields.Integer(compute='_compute_line_stats', store=True, string='Total Pieces')
    attachment_count = fields.Integer(compute='_compute_attachment_count', string='Drawings')

    @api.depends('line_ids.quantity')
    def _compute_line_stats(self):
        for rfq in self:
            rfq.line_count = len(rfq.line_ids)
            rfq.total_quantity = sum(rfq.line_ids.mapped('quantity'))

    def _compute_attachment_count(self):
        counts = dict(self.env['ir.attachment']._read_group(
            [('res_model', '=', self._name), ('res_id', 'in', self.ids)], ['res_id'], ['__count']))
        for rfq in self:
            rfq.attachment_count = counts.get(rfq.id, 0)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].next_by_code('industrial.rfq') or 'New'
        return super().create(vals_list)

    # ------------------------------------------------------------------
    # Actions
    # ------------------------------------------------------------------

    def action_review(self):
        self.write({'state': 'review'})

    def action_quoted(self):
        self.write({'state': 'quoted'})

    def action_won(self):
        self.write({'state': 'won'})

    def action_lost(self):
        self.write({'state': 'lost'})

    def action_reset(self):
        self.write({'state': 'new'})

    def action_link_partner(self):
        """Find or create the customer contact from the RFQ details."""
        Partner = self.env['res.partner']
        for rfq in self.filtered(lambda r: not r.partner_id):
            partner = Partner.search([('email', '=ilike', rfq.email)], limit=1)
            if not partner:
                company = Partner
                if rfq.company_name:
                    company = Partner.search([('is_company', '=', True), ('name', '=ilike', rfq.company_name)], limit=1) \
                        or Partner.create({'name': rfq.company_name, 'is_company': True, 'country_id': rfq.country_id.id})
                partner = Partner.create({
                    'name': rfq.contact_name,
                    'email': rfq.email,
                    'phone': rfq.phone,
                    'country_id': rfq.country_id.id,
                    'parent_id': company.id or False,
                })
            rfq.partner_id = partner
            rfq.message_subscribe(partner_ids=partner.ids)

    def action_view_attachments(self):
        self.ensure_one()
        return {
            'type': 'ir.actions.act_window',
            'name': self.env._('Drawings & Files'),
            'res_model': 'ir.attachment',
            'view_mode': 'kanban,list,form',
            'domain': [('res_model', '=', self._name), ('res_id', '=', self.id)],
            'context': {'default_res_model': self._name, 'default_res_id': self.id},
        }

    def _send_acknowledgement(self):
        template = self.env.ref('pnsb_website.mail_template_rfq_acknowledgement', raise_if_not_found=False)
        if not template:
            return
        for rfq in self.filtered('email'):
            template.send_mail(rfq.id, force_send=False)


class IndustrialRfqLine(models.Model):
    _name = 'industrial.rfq.line'
    _description = 'Request for Quotation Item'
    _order = 'sequence, id'

    rfq_id = fields.Many2one('industrial.rfq', required=True, ondelete='cascade', index=True)
    sequence = fields.Integer(default=10)
    product_id = fields.Many2one('industrial.product', string='Product', ondelete='set null')
    name = fields.Char(string='Description', required=True)
    size = fields.Char()
    length = fields.Char()
    material = fields.Char()
    finish = fields.Char()
    quantity = fields.Integer(default=1, required=True)
    note = fields.Char()
