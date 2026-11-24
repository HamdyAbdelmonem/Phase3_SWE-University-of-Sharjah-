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
        [("direct", "Direct"), ("ota", "OTA")],
        required=True,
        default="direct",
        help="Choose Direct for bookings made with your tour business, or OTA for bookings received from an online travel agency.",
    )
    unit_price = fields.Monetary(readonly=True, currency_field="currency_id")
    total_price = fields.Monetary(compute="_compute_total_price", store=True, currency_field="currency_id")
    available_seats = fields.Integer(related="schedule_id.available_seats")
    state = fields.Selection(
        [("draft", "Draft"), ("confirmed", "Confirmed"), ("cancelled", "Cancelled")],
        required=True,
        default="draft",
        copy=False,
    )
    confirmed_at = fields.Datetime(readonly=True, copy=False)
    confirmed_by_id = fields.Many2one("res.users", readonly=True, copy=False)
    cancellation_reason = fields.Text(readonly=True, copy=False)
    cancelled_at = fields.Datetime(readonly=True, copy=False)
    cancelled_by_id = fields.Many2one("res.users", readonly=True, copy=False)

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
        if self.schedule_id and self.package_id != self.schedule_id.package_id:
            self.package_id = self.schedule_id.package_id
        self.unit_price = self.schedule_id.package_id.price_per_guest if self.schedule_id else 0

    @api.onchange("number_of_guests", "schedule_id")
    def _onchange_guests_warning(self):
        if self.number_of_guests <= 0:
            return {
                "warning": {
                    "title": _("Invalid guest count"),
                    "message": _("Number of guests must be greater than zero."),
                }
            }
        if self.schedule_id and self.number_of_guests > self.schedule_id.available_seats:
            return {
                "warning": {
                    "title": _("Not enough seats"),
                    "message": _("Only %s places remain on this departure.", self.schedule_id.available_seats),
                }
            }

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
            vals["state"] = "draft"
            vals["unit_price"] = schedule.package_id.price_per_guest
            vals.setdefault("package_id", schedule.package_id.id)
            vals["name"] = self.env["ir.sequence"].next_by_code("tour.operator.booking") or "New"
            vals["confirmed_at"] = False
            vals["confirmed_by_id"] = False
            vals["cancellation_reason"] = False
            vals["cancelled_at"] = False
            vals["cancelled_by_id"] = False
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

        protected = {
            "name",
            "state",
            "confirmed_at",
            "confirmed_by_id",
            "cancellation_reason",
            "cancelled_at",
            "cancelled_by_id",
        }
        if set(vals) & protected:
            raise UserError(_("Use the booking actions to change booking status or audit information."))

        if self.filtered(lambda b: b.state in ("confirmed", "cancelled")):
            raise UserError(_("Confirmed or cancelled bookings are locked to preserve their history."))

        if "company_id" in vals:
            raise UserError(_("Create a new booking to change company."))

        if "schedule_id" in vals:
            schedule = self.env["tour.operator.schedule"].browse(vals["schedule_id"]).exists()
            if not schedule:
                raise ValidationError(_("Select an existing tour departure."))
            schedule.check_access("read")
            # An explicit re-save of the same departure keeps its quoted price.
            same = self.filtered(lambda booking: booking.schedule_id == schedule)
            changed = self - same
            if same:
                unchanged_price = {key: value for key, value in vals.items() if key not in ("schedule_id", "unit_price")}
                super(TourBooking, same).write(unchanged_price)
            if not changed:
                return True
            return super(TourBooking, changed).write(dict(vals, unit_price=schedule.package_id.price_per_guest))
        elif "unit_price" in vals:
            vals = dict(vals)
            vals.pop("unit_price")
        return super().write(vals)

    @api.constrains("schedule_id", "package_id", "number_of_guests", "company_id")
    def _check_booking(self):
        for booking in self:
            if booking.number_of_guests <= 0:
                raise ValidationError(_("Number of guests must be greater than zero."))
            booking._validate_departure()

    def _validate_departure(self):
        self.ensure_one()
        if self.schedule_id.package_id != self.package_id:
            raise ValidationError(_("The departure must belong to the selected tour package."))
        if self.schedule_id.state != "published":
            raise ValidationError(_("Select a published departure."))
        if self.schedule_id.start_datetime <= fields.Datetime.now():
            raise ValidationError(_("Bookings require a future departure."))
        if self.number_of_guests > self.schedule_id.available_seats:
            raise ValidationError(
                _("Insufficient availability: only %s places remain.", self.schedule_id.available_seats)
            )

    def _require_booking_staff(self):
        if not self.env.user.has_group("tour_operator_booking.group_booking_staff"):
            raise AccessError(_("Only Booking Staff or Managers may manage bookings."))

    def action_check_availability(self):
        self.ensure_one()
        self.check_access("read")
        self._validate_departure()
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Availability checked"),
                "message": _(
                    "%s places are currently available. Seats are reserved only on confirmation.",
                    self.available_seats,
                ),
                "type": "success",
                "sticky": False,
            },
        }

    def action_confirm(self):
        self.ensure_one()
        self._require_booking_staff()
        self.check_access("write")
        self.flush_recordset()
        self.env.cr.execute("SELECT id FROM tour_operator_booking WHERE id = %s FOR UPDATE", [self.id])
        self.invalidate_recordset()
        if self.state != "draft":
            raise UserError(_("Only draft bookings can be confirmed."))

        self.schedule_id._lock_capacity()
        self.schedule_id.invalidate_recordset(["booking_ids", "available_seats", "reserved_guests"])
        self._validate_departure()

        super(TourBooking, self).write(
            {
                "state": "confirmed",
                "confirmed_at": fields.Datetime.now(),
                "confirmed_by_id": self.env.user.id,
            }
        )
        return self.action_print_voucher()

    def action_open_cancel_wizard(self):
        self.ensure_one()
        self._require_booking_staff()
        self.check_access("write")
        if self.state != "confirmed":
            raise UserError(_("Only confirmed bookings can be cancelled."))
        if self.schedule_id.start_datetime <= fields.Datetime.now():
            raise UserError(_("This booking can no longer be cancelled because the tour has already started."))
        return {
            "type": "ir.actions.act_window",
            "name": _("Cancel Booking"),
            "res_model": "tour.operator.booking.cancel.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {"default_booking_id": self.id},
        }

    def action_cancel(self, reason):
        self.ensure_one()
        self._require_booking_staff()
        self.check_access("write")

        clean_reason = (reason or "").strip()
        if not clean_reason:
            raise ValidationError(_("A cancellation reason is required."))

        self.flush_recordset()
        self.env.cr.execute("SELECT id FROM tour_operator_booking WHERE id = %s FOR UPDATE", [self.id])
        self.invalidate_recordset()

        if self.state != "confirmed":
            raise UserError(_("Only confirmed bookings can be cancelled."))
        if self.schedule_id.start_datetime <= fields.Datetime.now():
            raise UserError(_("This booking can no longer be cancelled because the tour has already started."))

        self.schedule_id._lock_capacity()
        super(TourBooking, self).write(
            {
                "state": "cancelled",
                "cancellation_reason": clean_reason,
                "cancelled_at": fields.Datetime.now(),
                "cancelled_by_id": self.env.user.id,
            }
        )
        self.schedule_id.invalidate_recordset(["booking_ids", "available_seats", "reserved_guests"])

        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Booking cancelled"),
                "message": _("%s has been cancelled and its seats are available again.", self.name),
                "next": {"type": "ir.actions.act_window_close"},
                "type": "success",
                "sticky": False,
            },
        }

    def action_print_voucher(self):
        self.ensure_one()
        self._require_booking_staff()
        self.check_access("read")
        if self.state != "confirmed":
            raise UserError(_("Only confirmed bookings have a valid voucher / QR code."))
        return self.env.ref("tour_operator_booking.action_booking_voucher").report_action(self)

    @api.ondelete(at_uninstall=False)
    def _unlink_except_historical(self):
        if any(booking.state in ("confirmed", "cancelled") for booking in self):
            raise UserError(_("Confirmed and cancelled bookings must be kept for audit history."))
