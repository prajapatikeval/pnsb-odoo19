# -*- coding: utf-8 -*-
from odoo import api, models

DEFAULT_COMPANY_NAMES = {'My Company', 'YourCompany', 'Your Company', 'My Company (San Francisco)'}
DEFAULT_WEBSITE_NAMES = {'My Website', 'Website', 'website'}


class Website(models.Model):
    _inherit = 'website'

    @api.model
    def _pnsb_bootstrap(self):
        """Idempotent first-run setup, safe to call on every install/upgrade.

        Only replaces values that are still Odoo defaults, so anything edited
        in the backend is never overwritten.
        """
        company = self.env.ref('base.main_company', raise_if_not_found=False)
        if company and company.name in DEFAULT_COMPANY_NAMES:
            india = self.env.ref('base.in', raise_if_not_found=False)
            gujarat = self.env['res.country.state'].search(
                [('country_id', '=', india.id), ('code', '=', 'GJ')], limit=1) if india else False
            company.write({
                'name': 'PNSB Machinery Industries',
                'city': 'Ahmedabad',
                'state_id': gujarat.id if gujarat else False,
                'country_id': india.id if india else False,
            })
        for website in self.search([]):
            if not website.homepage_url or website.homepage_url == '/':
                website.homepage_url = '/industrial'
            if website.name in DEFAULT_WEBSITE_NAMES:
                website.name = 'PNSB Machinery Industries'
