from odoo import api, fields, models, _
from odoo.exceptions import ValidationError
from odoo.tools import format_datetime


class TourSchedule(models.Model):
    _name = "tour.operator.schedule"
    _description = "Tour Departure"
    _order = "start_datetime, id"
    _check_company_auto = True

    name = fields.Char(required=True)
    company_id = fields.Many2one("res.company", required=True, default=lambda self: self.env.company)
    package_id = fields.Many2one("tour.operator.package", required=True, ondelete="restrict", check_company=True)
    start_datetime = fields.Datetime(required=True)
    end_datetime = fields.Datetime(required=True)
    capacity = fields.Integer(required=True, default=10)
    state = fields.Selection([("draft", "Draft"), ("published", "Published")], default="draft", required=True)
    reservation_revision = fields.Integer(default=0, readonly=True, copy=False)
    booking_ids = fields.One2many("tour.operator.booking", "schedule_id")
    reserved_guests = fields.Integer(compute="_compute_availability", compute_sudo=True)
    available_seats = fields.Integer(compute="_compute_availability", compute_sudo=True)

    @api.depends("capacity", "booking_ids.state", "booking_ids.number_of_guests")
    def _compute_availability(self):
        for schedule in self:
            schedule.reserved_guests = sum(
                schedule.booking_ids.filtered(lambda b: b.state == "confirmed").mapped("number_of_guests")
            )
            schedule.available_seats = schedule.capacity - schedule.reserved_guests

    @api.depends("name", "start_datetime", "available_seats")
    @api.depends_context("tz", "lang")
    def _compute_display_name(self):
        # Show date and remaining seats in the booking form's departure dropdown.
        for schedule in self:
            when = format_datetime(self.env, schedule.start_datetime, dt_format="short") if schedule.start_datetime else ""
            schedule.display_name = _("%(name)s — %(when)s (%(seats)s seats left)",
                                      name=schedule.name or "", when=when, seats=schedule.available_seats)

    def _lock_capacity(self):
        # Serialize reservation decisions and schedule edits on the same departure.
        # All record access is checked by the calling business operation.
        if self:
            self.flush_recordset()
            self.env.cr.execute(
                "SELECT id FROM tour_operator_schedule WHERE id IN %s ORDER BY id FOR UPDATE",
                [tuple(sorted(self.ids))],
            )
            # Odoo uses repeatable-read transactions. Changing this row ensures
            # a competing reservation retries instead of reading an old snapshot.
            self.env.cr.execute(
                "UPDATE tour_operator_schedule SET reservation_revision = reservation_revision + 1 WHERE id IN %s",
                [tuple(sorted(self.ids))],
            )
            self.invalidate_recordset()

    @api.constrains("capacity", "start_datetime", "end_datetime")
    def _check_details(self):
        for schedule in self:
            if schedule.capacity <= 0:
                raise ValidationError(_("Departure capacity must be greater than zero."))
            if schedule.end_datetime <= schedule.start_datetime:
                raise ValidationError(_("Departure end must be after its start."))

    def write(self, vals):
        self.check_access("write")
        self._lock_capacity()
        booked = self.env["tour.operator.booking"].sudo().search([
            ("schedule_id", "in", self.ids), ("state", "=", "confirmed")
        ])
        if booked and set(vals) & {"package_id", "company_id", "start_datetime", "end_datetime", "state"}:
            raise ValidationError(_("A departure with confirmed bookings cannot change its tour, dates, company, or status."))
        if "capacity" in vals:
            for schedule in self:
                reserved = sum(booked.filtered(lambda b: b.schedule_id == schedule).mapped("number_of_guests"))
                if vals["capacity"] < reserved:
                    raise ValidationError(_("Capacity cannot be less than the confirmed guest count."))
        return super().write(vals)
