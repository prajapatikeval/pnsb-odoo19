# -*- coding: utf-8 -*-
import json
import logging
import os
import re


from odoo import http
from odoo.fields import Domain
from odoo.http import request
from odoo.tools import email_normalize

_logger = logging.getLogger(__name__)

MAX_LINES = 60
MAX_FILES = 6
MAX_FILE_SIZE = 15 * 1024 * 1024  # 15 MB per drawing
ALLOWED_EXTENSIONS = {
    '.pdf', '.dwg', '.dxf', '.step', '.stp', '.igs', '.iges', '.stl', '.x_t',
    '.png', '.jpg', '.jpeg', '.webp', '.zip', '.xlsx', '.xls', '.csv', '.docx',
}
# Nominal diameters offered by the catalogue "thread size" filter.
SIZE_STEPS = [3, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 27, 30, 36, 42, 48, 56, 64, 72]


def _published_domain():
    return Domain('website_published', '=', True) & request.website.website_domain()


def sitemap_catalog(env, rule, qs):
    if '<model' not in rule.rule:
        if not qs or qs.lower() in '/products':
            yield {'loc': '/products'}
        return
    for category in env['industrial.product.category'].search([('website_published', '=', True)]):
        loc = '/products/category/%s' % env['ir.http']._slug(category)
        if not qs or qs.lower() in loc:
            yield {'loc': loc}


class IndustrialPartsWebsite(http.Controller):

    # ------------------------------------------------------------------
    # Shared context
    # ------------------------------------------------------------------

    def _ip_base_values(self, page, **extra):
        company = request.website.company_id
        brand = (company.name or request.website.name or '').strip()
        categories = request.env['industrial.product.category'].search([])
        values = {
            'ip_page': page,
            'ip_company': company,
            'ip_nav_categories': categories,
            'ip_brand': brand,
            'ip_brand_short': brand.split(' ', 1)[0],
            'ip_brand_rest': brand.split(' ', 1)[1] if ' ' in brand else '',
        }
        values.update(extra)
        return values

    def _ip_explorer_json(self, materials, finishes):
        return json.dumps({
            'materials': [{
                'id': m.id, 'name': m.name, 'code': m.code or '', 'swatch': m.swatch, 'family': m.family,
                'description': m.description or '', 'tensile': m.tensile_strength, 'yield': m.yield_strength,
                'temp': m.max_temperature, 'density': m.density, 'strength': m.strength_rating,
                'corrosion': m.corrosion_rating, 'cost': m.cost_rating,
            } for m in materials],
            'finishes': [{
                'id': f.id, 'name': f.name, 'code': f.code or '', 'swatch': f.swatch,
                'description': f.description or '', 'thickness': f.thickness or '',
                'saltSpray': f.salt_spray_hours, 'corrosion': f.corrosion_rating, 'k': f.nut_factor,
            } for f in finishes],
        })

    def _ip_product_counts(self, products):
        counts = {}
        for product in products:
            counts[product.category_id.id] = counts.get(product.category_id.id, 0) + 1
        return counts

    # ------------------------------------------------------------------
    # Pages
    # ------------------------------------------------------------------

    @http.route('/industrial', type='http', auth='public', website=True, sitemap=True)
    def industrial_home(self, **kw):
        Product = request.env['industrial.product']
        products = Product.search(_published_domain())
        materials = request.env['industrial.material'].search([('show_in_explorer', '=', True)])
        finishes = request.env['industrial.finish'].search([('show_in_explorer', '=', True)])
        values = self._ip_base_values(
            'home',
            categories=request.env['industrial.product.category'].search([]),
            category_counts=self._ip_product_counts(products),
            featured=products.filtered('is_featured')[:4] or products[:4],
            materials=materials,
            finishes=finishes,
            explorer_json=self._ip_explorer_json(materials, finishes),
            sectors=request.env['industrial.sector'].search([]),
            product_total=len(products),
        )
        return request.render('pnsb_website.page_home', values)

    @http.route([
        '/products',
        '/products/category/<model("industrial.product.category"):category>',
    ], type='http', auth='public', website=True, sitemap=sitemap_catalog)
    def industrial_catalog(self, category=None, q='', **kw):
        products = request.env['industrial.product'].search(_published_domain())
        categories = request.env['industrial.product.category'].search([])
        standards = set()
        for product in products:
            for token in re.split(r'[·,/|]', product.standard or ''):
                family = token.strip().split(' ')[0].upper()
                if family:
                    standards.add(family)
        size_min = min(products.mapped('size_min') or [0]) or 0
        size_max = max(products.mapped('size_max') or [0]) or 0
        sizes = [s for s in SIZE_STEPS if size_min <= s <= size_max] if size_max else []
        values = self._ip_base_values(
            'catalog',
            products=products,
            categories=categories,
            category_counts=self._ip_product_counts(products),
            active_category=category,
            materials=request.env['industrial.material'].search([]),
            finishes=request.env['industrial.finish'].search([]),
            standards=sorted(standards),
            sizes=sizes,
            search=(q or '')[:80],
        )
        if category:
            values['main_object'] = category
        return request.render('pnsb_website.page_catalog', values)

    @http.route(['/about', '/process', '/contact', '/contactus'], type='http', auth='public',
                website=True, sitemap=False)
    def legacy_pages(self, **kw):
        target = {
            '/about': '/industrial#ip-intro',
            '/process': '/industrial#process',
        }.get(request.httprequest.path, '/quote')
        return request.redirect(target, code=301)

    @http.route('/products/compare', type='http', auth='public', website=True, sitemap=False)
    def industrial_compare(self, ids='', **kw):
        product_ids = [int(i) for i in re.findall(r'\d+', ids or '')][:4]
        products = request.env['industrial.product'].search(
            _published_domain() & Domain('id', 'in', product_ids)) if product_ids else request.env['industrial.product']
        products = products.sorted(lambda p: product_ids.index(p.id))
        spec_names = []
        for product in products:
            for spec in product.spec_ids.sorted('sequence'):
                if spec.name not in spec_names:
                    spec_names.append(spec.name)
        spec_map = {p.id: {s.name: s.value for s in p.spec_ids} for p in products}
        values = self._ip_base_values(
            'compare',
            products=products,
            spec_names=spec_names,
            spec_map=spec_map,
        )
        return request.render('pnsb_website.page_compare', values)

    @http.route('/quote', type='http', auth='public', website=True, sitemap=True)
    def industrial_quote(self, **kw):
        values = self._ip_base_values(
            'quote',
            countries=request.env['res.country'].sudo().search([]),
            default_country=request.geoip.country_code and request.env['res.country'].sudo().search(
                [('code', '=', request.geoip.country_code)], limit=1),
        )
        return request.render('pnsb_website.page_quote', values)

    # ------------------------------------------------------------------
    # RFQ submission
    # ------------------------------------------------------------------

    @http.route('/quote/submit', type='http', auth='public', methods=['POST'], website=True, csrf=True, sitemap=False)
    def industrial_quote_submit(self, **post):
        # Honeypot: bots fill every field, humans never see this one.
        if post.get('company_website'):
            return request.make_json_response({'ok': True, 'reference': ''})

        def clean(key, size=255):
            return (post.get(key) or '').strip()[:size]

        contact_name = clean('contact_name', 128)
        email = email_normalize(clean('email', 254))
        if not contact_name or not email:
            return request.make_json_response(
                {'ok': False, 'error': request.env._('Please provide your name and a valid e-mail address.')},
                status=400)

        try:
            raw_lines = json.loads(post.get('lines') or '[]')
        except ValueError:
            raw_lines = []
        Product = request.env['industrial.product']
        line_vals = []
        for raw in raw_lines[:MAX_LINES] if isinstance(raw_lines, list) else []:
            if not isinstance(raw, dict):
                continue
            product = Product
            if str(raw.get('productId') or '').isdigit():
                product = Product.search(_published_domain() & Domain('id', '=', int(raw['productId'])), limit=1)
            name = (product.name or str(raw.get('name') or '')).strip()[:200]
            if not name:
                continue
            try:
                quantity = max(1, min(int(raw.get('qty') or 1), 100_000_000))
            except (TypeError, ValueError):
                quantity = 1
            line_vals.append((0, 0, {
                'product_id': product.id or False,
                'name': name,
                'size': str(raw.get('size') or '')[:40],
                'length': str(raw.get('length') or '')[:40],
                'material': str(raw.get('material') or '')[:80],
                'finish': str(raw.get('finish') or '')[:80],
                'quantity': quantity,
                'note': str(raw.get('note') or '')[:250],
            }))

        files = [f for f in request.httprequest.files.getlist('attachments') if f and f.filename][:MAX_FILES]
        if not line_vals and not files and not clean('message', 5000):
            return request.make_json_response(
                {'ok': False, 'error': request.env._('Add at least one item, a drawing or a message.')}, status=400)

        country = False
        if clean('country_id').isdigit():
            country = request.env['res.country'].sudo().browse(int(clean('country_id'))).exists()

        source = clean('source', 20)
        required_date = clean('required_date', 10)
        rfq = request.env['industrial.rfq'].sudo().create({
            'contact_name': contact_name,
            'company_name': clean('company_name', 128),
            'email': email,
            'phone': clean('phone', 40),
            'country_id': country.id if country else False,
            'delivery_location': clean('delivery_location', 128),
            'required_date': required_date if re.match(r'^\d{4}-\d{2}-\d{2}$', required_date) else False,
            'message': clean('message', 5000),
            'source': source if source in ('basket', 'custom', 'product') else ('custom' if files and not line_vals else 'basket'),
            'website_id': request.website.id,
            'company_id': request.website.company_id.id,
            'line_ids': line_vals,
        })

        attachments = request.env['ir.attachment']
        for upload in files:
            filename = os.path.basename(upload.filename)[:180]
            if os.path.splitext(filename)[1].lower() not in ALLOWED_EXTENSIONS:
                continue
            data = upload.read(MAX_FILE_SIZE + 1)
            if not data or len(data) > MAX_FILE_SIZE:
                continue
            attachments |= request.env['ir.attachment'].sudo().create({
                'name': filename,
                'raw': data,
                'res_model': 'industrial.rfq',
                'res_id': rfq.id,
            })
        rfq.message_post(
            body=request.env._('Request submitted from the website (%(items)s items, %(files)s files).',
                               items=len(line_vals), files=len(attachments)),
            attachment_ids=attachments.ids,
            message_type='comment',
            subtype_xmlid='mail.mt_note',
        )
        try:
            rfq._send_acknowledgement()
        except Exception:  # noqa: BLE001 - never block the visitor on mail issues
            _logger.exception('Could not queue RFQ acknowledgement for %s', rfq.name)
        return request.make_json_response({'ok': True, 'reference': rfq.name})
