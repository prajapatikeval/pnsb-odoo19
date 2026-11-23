# -*- coding: utf-8 -*-
"""Odoo eCommerce with PNSB templates.

The routes, search, category filter, paging, publishing and product data are
eCommerce's own; only the templates are swapped (the responses are rendered
lazily, so the qcontext can be extended first). Prices, cart and checkout are
not used: visitors add products to the enquiry list instead.
"""
from odoo import http
from odoo.http import request

from odoo.addons.website_sale.controllers.cart import Cart
from odoo.addons.website_sale.controllers.main import WebsiteSale


def _is_qweb(response, template):
    return getattr(response, 'qcontext', None) is not None and getattr(response, 'template', None) == template


class PnsbShop(WebsiteSale):

    def _pnsb_published_domain(self):
        return [('is_published', '=', True), ('sale_ok', '=', True)]

    def _pnsb_shop_categories(self):
        Product = request.env['product.template'].sudo()
        domain = self._pnsb_published_domain()
        entries = []
        for category in request.env['product.public.category'].search([('parent_id', '=', False)]):
            count = Product.search_count(domain + [('public_categ_ids', 'child_of', category.id)])
            if count:
                entries.append({'category': category, 'url': self._get_shop_path(category), 'count': count})
        return entries, Product.search_count(domain)

    @http.route()
    def shop(self, page=0, category=None, search='', min_price=0.0, max_price=0.0, tags='', **post):
        response = super().shop(page=page, category=category, search=search, min_price=min_price,
                                max_price=max_price, tags=tags, **post)
        if _is_qweb(response, 'website_sale.products'):
            values = response.qcontext
            entries, total = self._pnsb_shop_categories()
            current = values.get('category')
            values.update(request.website._pnsb_layout_values('products'))
            values.update({
                'pnsb_products': values['products'].sudo(),
                'pnsb_shop_categories': entries,
                'pnsb_total': total,
                'pnsb_shop_path': self._get_shop_path(current) if current else '/shop',
            })
            response.template = 'pnsb_website.shop_products'
        return response

    @http.route()
    def product(self, product, category=None, pricelist=None, **kwargs):
        response = super().product(product, category=category, pricelist=pricelist, **kwargs)
        if _is_qweb(response, 'website_sale.product'):
            values = response.qcontext
            record = values['product'].sudo()
            current = values.get('category')
            related = record.alternative_product_ids.filtered(lambda p: p.is_published and p.sale_ok)
            if not related and record.public_categ_ids:
                related = request.env['product.template'].sudo().search(
                    self._pnsb_published_domain() + [
                        ('public_categ_ids', 'in', record.public_categ_ids.ids),
                        ('id', '!=', record.id),
                    ], limit=4)
            values.update(request.website._pnsb_layout_values('products'))
            values.update({
                'pnsb_description': record._pnsb_summary(),
                'pnsb_product': record,
                'pnsb_images': record._get_images(),
                'pnsb_related': related[:4],
                'pnsb_product_industries': record.pnsb_industry_ids.filtered('website_published'),
                'pnsb_category': current,
                'pnsb_category_url': self._get_shop_path(current) if current else '/shop',
                'pnsb_attribute_lines': record.valid_product_template_attribute_line_ids,
                'pnsb_product_categories': [
                    {'category': c, 'url': self._get_shop_path(c)} for c in record.public_categ_ids
                ],
            })
            response.template = 'pnsb_website.shop_product'
        return response


class PnsbCart(Cart):

    @http.route()
    def cart(self, id=None, access_token=None, revive_method='', **post):
        """No online orders: the enquiry list on the contact page replaces the cart."""
        return request.redirect('/contact')
