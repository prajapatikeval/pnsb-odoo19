# -*- coding: utf-8 -*-
import json
import logging
import os

from markupsafe import Markup, escape

from odoo import http
from odoo.http import request
from odoo.tools import email_normalize

from odoo.addons.pnsb_website.models.product import TOP_CATEGORY_LIMIT

_logger = logging.getLogger(__name__)

MAX_ITEMS = 40
MAX_FILES = 5
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB per file
ALLOWED_EXTENSIONS = {
    '.pdf', '.dwg', '.dxf', '.step', '.stp', '.igs', '.iges', '.stl',
    '.png', '.jpg', '.jpeg', '.webp', '.zip', '.xlsx', '.xls', '.csv', '.docx',
}

def _ok_json():
    return 'application/json' in (request.httprequest.headers.get('Accept') or '')


class PnsbWebsite(http.Controller):

    # ------------------------------------------------------------------
    # Shared helpers
    # ------------------------------------------------------------------

    def _pnsb_categories(self):
        return request.env['product.category'].sudo().search(
            [('pnsb_website_published', '=', True)], order='pnsb_website_sequence, name')

    def _pnsb_products(self, categories=None):
        domain = [
            ('pnsb_website_published', '=', True),
            ('sale_ok', '=', True),
            ('company_id', 'in', [False, request.website.company_id.id]),
        ]
        if categories is not None:
            domain.append(('categ_id', 'in', categories.ids))
        return request.env['product.template'].sudo().search(
            domain, order='pnsb_website_sequence, name')

    def _pnsb_values(self, page, **extra):
        values = request.website._pnsb_layout_values(page)
        values.update(extra)
        return values

    # ------------------------------------------------------------------
    # Pages
    # ------------------------------------------------------------------

    @http.route('/industrial', type='http', auth='public', website=True, sitemap=False)
    def pnsb_home(self, **kw):
        categories = self._pnsb_categories()
        products = self._pnsb_products(categories)
        # Our Top Products: categories marked "Is Top Product Category" that have
        # products on the website, at most 5. Recent developments: products marked
        # "Is Recently Developed", at most 6.
        top_categories = categories.filtered(
            lambda c: c.pnsb_website_top and c in products.categ_id)[:TOP_CATEGORY_LIMIT]
        highlights = products.filtered('pnsb_website_highlight')[:6]
        return request.render('pnsb_website.page_home', self._pnsb_values(
            'home', categories=top_categories, products=products, highlights=highlights))

    @http.route('/about', type='http', auth='public', website=True, sitemap=True)
    def pnsb_about(self, **kw):
        return request.render('pnsb_website.page_about', self._pnsb_values('about'))

    @http.route('/services', type='http', auth='public', website=True, sitemap=True)
    def pnsb_services(self, **kw):
        return request.render('pnsb_website.page_services', self._pnsb_values('services'))

    @http.route('/industries', type='http', auth='public', website=True, sitemap=True)
    def pnsb_industries(self, **kw):
        return request.render('pnsb_website.page_industries', self._pnsb_values('industries'))

    def sitemap_industries(env, rule, qs):
        for industry in env['pnsb.industry'].sudo().search([('website_published', '=', True)]):
            if not qs or qs.lower() in industry.website_url:
                yield {'loc': industry.website_url}

    @http.route('/industries/<string:key>', type='http', auth='public', website=True,
                sitemap=sitemap_industries)
    def pnsb_industry(self, key, **kw):
        industries = request.env['pnsb.industry'].sudo().search([('website_published', '=', True)])
        industry = industries.filtered(lambda i: i.url_key == key)[:1]
        if not industry:
            raise request.not_found()
        # Only products that are on the website, in the catalogue order.
        products = self._pnsb_products(self._pnsb_categories()) & industry.product_ids
        return request.render('pnsb_website.page_industry', self._pnsb_values(
            'industries', industry=industry, industry_index=list(industries).index(industry),
            industry_total=len(industries), other_industries=industries - industry,
            products=products, pnsb_description=industry.summary))

    @http.route('/products', type='http', auth='public', website=True, sitemap=True)
    def pnsb_products(self, line='', **kw):
        categories = self._pnsb_categories()
        products = self._pnsb_products(categories)
        counts = {}
        for product in products:
            counts[product.categ_id.id] = counts.get(product.categ_id.id, 0) + 1
        active = categories.filtered(lambda c: c.pnsb_website_key == line)[:1]
        return request.render('pnsb_website.page_products', self._pnsb_values(
            'products', categories=categories.filtered(lambda c: counts.get(c.id)), products=products,
            counts=counts, active_key=active.pnsb_website_key or 'all'))

    @http.route('/contact', type='http', auth='public', website=True, sitemap=True)
    def pnsb_contact(self, **kw):
        return request.render('pnsb_website.page_contact', self._pnsb_values('contact'))

    @http.route('/contact/thank-you', type='http', auth='public', website=True, sitemap=False)
    def pnsb_thanks(self, ref='', **kw):
        return request.render('pnsb_website.page_thanks', self._pnsb_values(
            'thanks', reference=(ref or '')[:32]))

    @http.route(['/work', '/quote', '/process', '/contactus', '/products/compare',
                 '/products/category/<path:rest>'],
                type='http', auth='public', website=True, sitemap=False)
    def pnsb_legacy(self, **kw):
        path = request.httprequest.path
        target = '/products'
        if path in ('/quote', '/contactus'):
            target = '/contact'
        elif path == '/process':
            target = '/about'
        return request.redirect(target, code=301)

    @http.route('/pnsb/image/<int:product_id>/<int:size>', type='http', auth='public', sitemap=False)
    def pnsb_product_image(self, product_id, size, unique=None, **kw):
        """Product images for the public site, limited to published products."""
        product = request.env['product.template'].sudo().browse(product_id).exists()
        if not product or not product.pnsb_website_published:
            raise request.not_found()
        field = 'image_%s' % (size if size in (128, 256, 512, 1024) else 1920)
        stream = request.env['ir.binary']._get_image_stream_from(
            product, field, placeholder='web/static/img/placeholder.png')
        return stream.get_response(immutable=bool(unique))

    @http.route('/pnsb/industry-image/<int:industry_id>', type='http', auth='public', sitemap=False)
    def pnsb_industry_image(self, industry_id, unique=None, **kw):
        """Industry photos for the public site, limited to published industries."""
        industry = request.env['pnsb.industry'].sudo().browse(industry_id).exists()
        if not industry or not industry.website_published or not industry.image:
            raise request.not_found()
        stream = request.env['ir.binary']._get_image_stream_from(industry, 'image')
        return stream.get_response(immutable=bool(unique))

    # ------------------------------------------------------------------
    # Enquiry: products -> Sales quotation, otherwise -> CRM lead
    # ------------------------------------------------------------------

    @http.route('/pnsb/enquiry', type='http', auth='public', methods=['POST'], website=True,
                csrf=True, sitemap=False)
    def pnsb_enquiry(self, **post):
        def reply(ok, reference='', error='', status=200):
            if _ok_json():
                return request.make_json_response(
                    {'ok': ok, 'reference': reference, 'error': error}, status=status)
            if ok:
                return request.redirect('/contact/thank-you?ref=%s' % reference)
            return request.render('pnsb_website.page_contact', self._pnsb_values(
                'contact', form_error=error, form_values=post), status=status)

        # Honeypot: bots fill every field, humans never see this one.
        if post.get('website_url'):
            return reply(True)

        def clean(key, size=255):
            return (post.get(key) or '').strip()[:size]

        name = clean('name', 128)
        email = email_normalize(clean('email', 254))
        phone = clean('phone', 40)
        company_name = clean('company', 128)
        message = clean('message', 5000)
        if not name or not email:
            return reply(False, error=request.env._('Please enter your name and a valid e-mail address.'),
                         status=400)

        try:
            raw_items = json.loads(post.get('items') or '[]')
        except ValueError:
            raw_items = []
        Product = request.env['product.template'].sudo()
        items = []
        for raw in (raw_items if isinstance(raw_items, list) else [])[:MAX_ITEMS]:
            if not isinstance(raw, dict) or not str(raw.get('id') or '').isdigit():
                continue
            product = Product.search([
                ('id', '=', int(raw['id'])), ('pnsb_website_published', '=', True), ('sale_ok', '=', True),
            ], limit=1)
            if not product:
                continue
            try:
                qty = max(1, min(int(raw.get('qty') or 1), 1_000_000))
            except (TypeError, ValueError):
                qty = 1
            items.append((product, qty))

        if not items and not message:
            return reply(False, error=request.env._('Please tell us a little about your requirement.'),
                         status=400)

        website = request.website
        company = website.company_id
        body = Markup('<p>%s</p>') % request.env._('Enquiry received from the website contact form.')
        details = [(request.env._('Name'), name), (request.env._('Company'), company_name),
                   (request.env._('E-mail'), email), (request.env._('Phone'), phone)]
        body += Markup('<ul>%s</ul>') % Markup('').join(
            Markup('<li><b>%s:</b> %s</li>') % (label, value) for label, value in details if value)
        if message:
            body += Markup('<p>%s</p>') % Markup('<br/>').join(escape(line) for line in message.splitlines())

        if items:
            record = self._pnsb_create_quotation(company, name, email, phone, company_name, items)
        else:
            record = self._pnsb_create_lead(company, name, email, phone, company_name, message)

        attachments = request.env['ir.attachment'].sudo()
        uploads = [f for f in request.httprequest.files.getlist('attachments') if f and f.filename]
        for upload in uploads[:MAX_FILES]:
            filename = os.path.basename(upload.filename)[:180]
            if os.path.splitext(filename)[1].lower() not in ALLOWED_EXTENSIONS:
                continue
            data = upload.read(MAX_FILE_SIZE + 1)
            if not data or len(data) > MAX_FILE_SIZE:
                continue
            attachments |= attachments.create({
                'name': filename,
                'raw': data,
                'res_model': record._name,
                'res_id': record.id,
            })
        record.message_post(
            body=body,
            attachment_ids=attachments.ids,
            message_type='comment',
            subtype_xmlid='mail.mt_note',
        )
        reference = record.name if record._name == 'sale.order' else 'L%05d' % record.id
        return reply(True, reference=reference)

    def _pnsb_sales_team(self, company):
        return request.env['crm.team'].sudo().search(
            [('company_id', 'in', [False, company.id])], order='sequence, id', limit=1)

    def _pnsb_partner(self, company, name, email, phone, company_name):
        Partner = request.env['res.partner'].sudo().with_company(company)
        partner = Partner.search([('email', '=ilike', email), ('company_id', 'in', [False, company.id])],
                                 order='is_company, id', limit=1)
        if not partner:
            country = request.env['res.country'].sudo().search(
                [('code', '=', request.geoip.country_code)], limit=1) if request.geoip.country_code else False
            partner = Partner.create({
                'name': name,
                'email': email,
                'phone': phone or False,
                'company_name': company_name or False,
                'country_id': country.id if country else False,
            })
        elif phone and not partner.phone:
            partner.phone = phone
        return partner

    def _pnsb_create_quotation(self, company, name, email, phone, company_name, items):
        partner = self._pnsb_partner(company, name, email, phone, company_name)
        team = self._pnsb_sales_team(company)
        return request.env['sale.order'].sudo().with_company(company).create({
            'partner_id': partner.id,
            'company_id': company.id,
            'origin': request.env._('Website enquiry'),
            'team_id': team.id or False,
            # sudo() keeps the public user as env.user: never make it the salesperson.
            'user_id': team.user_id.id or False,
            'order_line': [(0, 0, {
                'product_id': product.product_variant_id.id,
                'product_uom_qty': qty,
            }) for product, qty in items],
        })

    def _pnsb_create_lead(self, company, name, email, phone, company_name, message):
        partner = self._pnsb_partner(company, name, email, phone, company_name)
        team = self._pnsb_sales_team(company)
        subject = (company_name or name)[:60]
        return request.env['crm.lead'].sudo().with_company(company).create({
            'name': request.env._('Website enquiry: %(who)s', who=subject),
            'partner_id': partner.id,
            'contact_name': name,
            'partner_name': company_name or False,
            'email_from': email,
            'phone': phone or False,
            'description': Markup('<br/>').join(escape(line) for line in message.splitlines()),
            'company_id': company.id,
            'team_id': team.id or False,
            'user_id': team.user_id.id or False,
        })
