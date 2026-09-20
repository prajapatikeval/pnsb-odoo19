from odoo import http
from odoo.http import request


class PNSBWebsiteController(http.Controller):

    @http.route("/", type="http", auth="public", website=True)
    def home(self, **kwargs):
        return request.render("pnsb_website.home_page")

    @http.route("/products", type="http", auth="public", website=True)
    def products(self, **kwargs):
        products = request.env["pnsb.product"].sudo().search(
            [("published", "=", True)],
            order="sequence, id",
        )
        return request.render(
            "pnsb_website.products_page",
            {"products": products},
        )

    @http.route("/about", type="http", auth="public", website=True)
    def about(self, **kwargs):
        return request.render("pnsb_website.about_page")

    @http.route("/process", type="http", auth="public", website=True)
    def process(self, **kwargs):
        return request.render("pnsb_website.process_page")

    @http.route(
        "/contact",
        type="http",
        auth="public",
        website=True,
        methods=["GET", "POST"],
        csrf=True,
    )
    def contact(self, **post):
        success = False

        if request.httprequest.method == "POST" and post.get("name"):
            request.env["pnsb.enquiry"].sudo().create({
                "name": post.get("name"),
                "email": post.get("email"),
                "phone": post.get("phone"),
                "company": post.get("company"),
                "message": post.get("message"),
            })
            success = True

        return request.render(
            "pnsb_website.contact_page",
            {"success": success},
        )
