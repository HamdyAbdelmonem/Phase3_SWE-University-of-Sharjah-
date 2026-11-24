from datetime import datetime, time, timedelta

import pytz

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class BookingReportWizard(models.TransientModel):
    _name = "booking.report.wizard"
    _description = "Confirmed Booking Report"

    date_from = fields.Date(string="Start Date")
    date_to = fields.Date(string="End Date")



    booking_ids = fields.Many2many(
        "tour.operator.booking",
        string="Bookings",
        compute="_compute_totals",
    )



    total_bookings = fields.Integer(string="Confirmed Bookings", compute="_compute_totals")
    total_revenue = fields.Monetary(string="Booking Value", compute="_compute_totals")
    currency_id = fields.Many2one("res.currency", compute="_compute_totals")


    @api.constrains("date_from", "date_to")
    def _check_date_range(self):
        for wizard in self:
            if wizard.date_from and wizard.date_to and wizard.date_from > wizard.date_to:
                raise ValidationError(_("The start date cannot be later than the end date."))


    def _get_bookings(self):
        self.ensure_one()
        zone = pytz.timezone(self.env.context.get("tz") or self.env.user.tz or "UTC")

        def utc_midnight(day):
            local = zone.localize(datetime.combine(day, time.min))
            return local.astimezone(pytz.UTC).replace(tzinfo=None)

        domain = [
            ("company_id", "=", self.env.company.id),
            ("state", "=", "confirmed"),
        ]

        if self.date_from:
            domain.append(
                ("schedule_id.start_datetime", ">=", utc_midnight(self.date_from))
            )

        if self.date_to:
            domain.append(
                ("schedule_id.start_datetime", "<", utc_midnight(self.date_to + timedelta(days=1)))
            )

        return self.env["tour.operator.booking"].search(domain)


  
    @api.depends("date_from", "date_to")
    @api.depends_context("company", "uid", "tz")
    def _compute_totals(self):
        for wizard in self:
            bookings = wizard._get_bookings()
            wizard.booking_ids = bookings
            wizard.currency_id = self.env.company.currency_id
            wizard.total_bookings = len(bookings)
            wizard.total_revenue = sum(bookings.mapped("total_price"))

    def action_show_report(self):
        self.ensure_one()
        self.check_access("read")
        self._check_date_range()
        return {
            "type": "ir.actions.act_window", "name": _("Booking Report"),
            "res_model": self._name, "res_id": self.id, "view_mode": "form", "target": "new",
        }
