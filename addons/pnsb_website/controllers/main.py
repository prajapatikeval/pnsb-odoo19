from odoo import http
from odoo.http import request

class PNSBWebsiteController(http.Controller):
    @http.route("/", type="http", auth="public", website=True)
    def home(self, **kwargs):
        products = request.env["pnsb.product"].sudo().search(
            [("published", "=", True)], order="sequence, id")
        return request.render("pnsb_website.home_page", {"products": products})

    @http.route("/products", type="http", auth="public", website=True)
    def products(self, **kwargs):
        products = request.env["pnsb.product"].sudo().search(
            [("published", "=", True)], order="sequence, id")
        return request.render("pnsb_website.products_page", {"products": products})

    @http.route("/contact", type="http", auth="public", website=True,
                methods=["GET", "POST"], csrf=True)
    def contact(self, **post):
        success = False
        if post.get("name"):
            request.env["pnsb.enquiry"].sudo().create({
                "name": post.get("name"), "email": post.get("email"),
                "phone": post.get("phone"), "company": post.get("company"),
                "message": post.get("message"),
            })
            success = True
        return request.render("pnsb_website.contact_page", {"success": success})
