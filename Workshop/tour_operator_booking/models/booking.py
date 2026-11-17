from odoo import api, fields, models, _
from odoo.exceptions import AccessError, UserError, ValidationError


class TourBooking(models.Model):
    _name = "tour.operator.booking"
    _description = "Tour Booking"
    _order = "id desc"
    _check_company_auto = True

    name = fields.Char(required=True, readonly=True, default="New", copy=False)
    company_id = fields.Many2one("res.company", required=True, default=lambda self: self.env.company)
    currency_id = fields.Many2one(related="company_id.currency_id", store=True)
    customer_id = fields.Many2one("res.partner", required=True, ondelete="restrict", check_company=True)
    package_id = fields.Many2one("tour.operator.package", required=True, ondelete="restrict", check_company=True)
    schedule_id = fields.Many2one("tour.operator.schedule", required=True, ondelete="restrict", check_company=True)
    number_of_guests = fields.Integer(required=True, default=1)
    booking_source = fields.Selection(
        [("direct", "Direct"), ("phone", "Phone"), ("email", "Email")], required=True, default="direct"
    )
    unit_price = fields.Monetary(readonly=True, currency_field="currency_id")
    total_price = fields.Monetary(compute="_compute_total_price", store=True, currency_field="currency_id")
    available_seats = fields.Integer(related="schedule_id.available_seats")
    state = fields.Selection([("draft", "Draft"), ("confirmed", "Confirmed")], required=True, default="draft", copy=False)
    confirmed_at = fields.Datetime(readonly=True, copy=False)
    confirmed_by_id = fields.Many2one("res.users", readonly=True, copy=False)

    @api.depends("number_of_guests", "unit_price", "currency_id")
    def _compute_total_price(self):
        for booking in self:
            amount = booking.number_of_guests * booking.unit_price
            booking.total_price = booking.currency_id.round(amount) if booking.currency_id else amount

    @api.onchange("package_id")
    def _onchange_package(self):
        if self.schedule_id.package_id != self.package_id:
            self.schedule_id = False

    @api.onchange("schedule_id")
    def _onchange_schedule(self):
        self.unit_price = self.schedule_id.package_id.price_per_guest if self.schedule_id else 0

    @api.model_create_multi
    def create(self, vals_list):
        prepared = []
        for original in vals_list:
            vals = dict(original)
            if vals.get("state", "draft") != "draft":
                raise UserError(_("Create a draft booking, then use Confirm Booking."))
            schedule = self.env["tour.operator.schedule"].browse(vals.get("schedule_id")).exists()
            if not schedule:
                raise ValidationError(_("Select an existing tour departure."))
            schedule.check_access("read")
            vals["unit_price"] = schedule.package_id.price_per_guest
            vals.setdefault("package_id", schedule.package_id.id)
            vals["name"] = self.env["ir.sequence"].next_by_code("tour.operator.booking") or "New"
            vals["confirmed_at"] = False
            vals["confirmed_by_id"] = False
            prepared.append(vals)
        return super().create(prepared)

    def write(self, vals):
        self.check_access("write")
        self.flush_recordset()
        if self:
            self.env.cr.execute(
                "SELECT id FROM tour_operator_booking WHERE id IN %s ORDER BY id FOR UPDATE",
                [tuple(sorted(self.ids))],
            )
            self.invalidate_recordset()
        protected = {"name", "state", "confirmed_at", "confirmed_by_id"}
        if set(vals) & protected:
            raise UserError(_("Use the booking actions to change its reference or confirmation status."))
        if self.filtered(lambda b: b.state == "confirmed"):
            raise UserError(_("Confirmed bookings are locked to preserve capacity and price."))
        if "company_id" in vals:
            raise UserError(_("Create a new booking to change company."))
        if "schedule_id" in vals:
            schedule = self.env["tour.operator.schedule"].browse(vals["schedule_id"]).exists()
            if not schedule:
                raise ValidationError(_("Select an existing tour departure."))
            schedule.check_access("read")
            vals = dict(vals, unit_price=schedule.package_id.price_per_guest)
        elif "unit_price" in vals:
            # The browser may send readonly values; it may not override saved prices.
            vals = dict(vals)
            vals.pop("unit_price")
        return super().write(vals)

    @api.constrains("schedule_id", "package_id", "number_of_guests", "company_id")
    def _check_booking(self):
        for booking in self:
            if booking.number_of_guests <= 0:
                raise ValidationError(_("Number of guests must be greater than zero."))
            if booking.schedule_id.package_id != booking.package_id:
                raise ValidationError(_("The departure must belong to the selected tour package."))
            booking._validate_departure()

    def _validate_departure(self):
        self.ensure_one()
        if self.schedule_id.state != "published":
            raise ValidationError(_("Select a published departure."))
        if self.schedule_id.start_datetime <= fields.Datetime.now():
            raise ValidationError(_("Bookings require a future departure."))
        if self.number_of_guests > self.schedule_id.available_seats:
            raise ValidationError(_("Insufficient availability: only %s places remain.", self.schedule_id.available_seats))

    def _require_booking_staff(self):
        if not self.env.user.has_group("tour_operator_booking.group_booking_staff"):
            raise AccessError(_("Only Booking Staff or Managers may confirm or print bookings."))

    def action_check_availability(self):
        self.ensure_one()
        self.check_access("read")
        self._validate_departure()
        return {"type": "ir.actions.client", "tag": "display_notification", "params": {
            "title": _("Availability checked"),
            "message": _("%s places are currently available. Seats are reserved only on confirmation.", self.available_seats),
            "type": "success", "sticky": False,
        }}

    def action_confirm(self):
        self.ensure_one()
        self._require_booking_staff()
        self.check_access("write")
        # Lock the booking first, so a second request cannot confirm it twice.
        self.flush_recordset()
        self.env.cr.execute("SELECT id FROM tour_operator_booking WHERE id = %s FOR UPDATE", [self.id])
        self.invalidate_recordset()
        if self.state != "draft":
            raise UserError(_("This booking is already confirmed."))
        self.schedule_id._lock_capacity()
        self.schedule_id.invalidate_recordset(["booking_ids", "available_seats", "reserved_guests"])
        self._validate_departure()
        # Bypass our public write guard only here, after permissions, locks, and validation.
        super(TourBooking, self).write({
            "state": "confirmed", "confirmed_at": fields.Datetime.now(), "confirmed_by_id": self.env.user.id,
        })
        return self.action_print_voucher()

    def action_print_voucher(self):
        self.ensure_one()
        self._require_booking_staff()
        self.check_access("read")
        if self.state != "confirmed":
            raise UserError(_("Confirm the booking before printing its voucher."))
        return self.env.ref("tour_operator_booking.action_booking_voucher").report_action(self)

    @api.ondelete(at_uninstall=False)
    def _unlink_except_confirmed(self):
        if any(booking.state == "confirmed" for booking in self):
            raise UserError(_("Confirmed bookings must be kept for reference."))
