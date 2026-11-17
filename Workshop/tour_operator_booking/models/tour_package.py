from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class TourPackage(models.Model):
    _name = "tour.operator.package"
    _description = "Tour Package"
    _check_company_auto = True

    name = fields.Char(required=True)
    description = fields.Text()
    company_id = fields.Many2one("res.company", required=True, default=lambda self: self.env.company)
    currency_id = fields.Many2one(related="company_id.currency_id")
    price_per_guest = fields.Monetary(required=True, currency_field="currency_id")

    @api.constrains("price_per_guest")
    def _check_price(self):
        for package in self:
            if package.price_per_guest < 0:
                raise ValidationError(_("Price per guest cannot be negative."))

    def write(self, vals):
        if "company_id" in vals:
            if self.env["tour.operator.schedule"].sudo().search_count([("package_id", "in", self.ids)]):
                raise ValidationError(_("A package used by a schedule cannot change company."))
        return super().write(vals)
