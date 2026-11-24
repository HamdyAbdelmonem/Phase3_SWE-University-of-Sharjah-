from odoo import api, fields, models, _
from odoo.exceptions import AccessError, ValidationError
from odoo.tools import format_datetime


class TourSchedule(models.Model):
    _name = "tour.operator.schedule"
    _description = "Tour Departure"
    _order = "start_datetime, id"
    _check_company_auto = True

    name = fields.Char(required=True)
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
    )
    package_id = fields.Many2one(
        "tour.operator.package",
        required=True,
        ondelete="restrict",
        check_company=True,
    )
    driver_id = fields.Many2one(
        "tour.operator.resource",
        string="Driver",
        domain=[("kind", "=", "driver")],
        check_company=True,
        ondelete="restrict",
    )
    guide_id = fields.Many2one(
        "tour.operator.resource",
        string="Tour Guide",
        domain=[("kind", "=", "guide")],
        check_company=True,
        ondelete="restrict",
    )
    vehicle_id = fields.Many2one(
        "tour.operator.resource",
        string="Vehicle",
        domain=[("kind", "=", "vehicle")],
        check_company=True,
        ondelete="restrict",
    )
    vehicle_capacity = fields.Integer(
        related="vehicle_id.vehicle_capacity",
        string="Vehicle Capacity",
        readonly=True,
    )
    start_datetime = fields.Datetime(required=True)
    end_datetime = fields.Datetime(required=True)
    capacity = fields.Integer(
        string="Guest Capacity",
        required=True,
        default=10,
        help="Maximum number of guests that can be booked on this departure.",
    )
    state = fields.Selection(
        [("draft", "Draft"), ("published", "Published")],
        default="draft",
        required=True,
        copy=False,
    )
    scheduled_at = fields.Datetime(readonly=True, copy=False)
    scheduled_by_id = fields.Many2one("res.users", readonly=True, copy=False)
    reservation_revision = fields.Integer(default=0, readonly=True, copy=False)
    booking_ids = fields.One2many("tour.operator.booking", "schedule_id")
    reserved_guests = fields.Integer(compute="_compute_availability", compute_sudo=True)
    available_seats = fields.Integer(compute="_compute_availability", compute_sudo=True)

    @api.depends("capacity", "booking_ids.state", "booking_ids.number_of_guests")
    def _compute_availability(self):
        for schedule in self:
            schedule.reserved_guests = sum(
                schedule.booking_ids.filtered(
                    lambda booking: booking.state == "confirmed"
                ).mapped("number_of_guests")
            )
            schedule.available_seats = schedule.capacity - schedule.reserved_guests

    @api.depends("name", "start_datetime", "available_seats")
    @api.depends_context("tz", "lang")
    def _compute_display_name(self):
        for schedule in self:
            when = (
                format_datetime(
                    self.env,
                    schedule.start_datetime,
                    dt_format="short",
                )
                if schedule.start_datetime
                else ""
            )
            schedule.display_name = _(
                "%(name)s — %(when)s (%(seats)s seats left)",
                name=schedule.name or "",
                when=when,
                seats=schedule.available_seats,
            )

    def _require_operations_staff(self):
        if not self.env.user.has_group(
            "tour_operator_booking.group_operations_staff"
        ):
            raise AccessError(
                _("Only Operations Staff or Managers may schedule tours.")
            )

    def _lock_capacity(self):
        # Serialize reservation decisions and schedule edits on the same departure.
        if self:
            self.flush_recordset()
            self.env.cr.execute(
                "SELECT id FROM tour_operator_schedule "
                "WHERE id IN %s ORDER BY id FOR UPDATE",
                [tuple(sorted(self.ids))],
            )
            self.env.cr.execute(
                "UPDATE tour_operator_schedule "
                "SET reservation_revision = reservation_revision + 1 "
                "WHERE id IN %s",
                [tuple(sorted(self.ids))],
            )
            self.invalidate_recordset()

    def _assigned_resources(self):
        return (
            self.mapped("driver_id")
            | self.mapped("guide_id")
            | self.mapped("vehicle_id")
        )

    def _validate_schedule_details(self):
        now = fields.Datetime.now()
        for schedule in self:
            if schedule.capacity <= 0:
                raise ValidationError(
                    _("Guest capacity must be greater than zero.")
                )
            if schedule.end_datetime <= schedule.start_datetime:
                raise ValidationError(
                    _("Departure end must be after its start.")
                )
            if schedule.state == "published" and schedule.start_datetime <= now:
                raise ValidationError(
                    _("Only future departures can be published.")
                )

    def _validate_resource_types(self):
        for schedule in self:
            expected = (
                ("driver_id", "driver", _("Driver")),
                ("guide_id", "guide", _("Tour Guide")),
                ("vehicle_id", "vehicle", _("Vehicle")),
            )
            for field_name, kind, label in expected:
                resource = schedule[field_name]
                if resource and resource.kind != kind:
                    raise ValidationError(
                        _("%(label)s must use a %(kind)s resource.",
                          label=label, kind=kind)
                    )

    def _validate_publish_requirements(self):
        now = fields.Datetime.now()
        for schedule in self:
            if schedule.start_datetime <= now:
                raise ValidationError(
                    _("The tour must be scheduled for a future date and time.")
                )
            if not schedule.driver_id:
                raise ValidationError(_("Select an available driver."))
            if not schedule.guide_id:
                raise ValidationError(_("Select an available tour guide."))
            if not schedule.vehicle_id:
                raise ValidationError(_("Select an available vehicle."))

            if (
                schedule.vehicle_id.vehicle_capacity > 0
                and schedule.capacity > schedule.vehicle_id.vehicle_capacity
            ):
                raise ValidationError(
                    _(
                        "The selected vehicle can carry only %(vehicle)s guests, "
                        "but this departure requires %(required)s.",
                        vehicle=schedule.vehicle_id.vehicle_capacity,
                        required=schedule.capacity,
                    )
                )

            duplicate_tour = self.sudo().search_count(
                [
                    ("id", "!=", schedule.id),
                    ("state", "=", "published"),
                    ("package_id", "=", schedule.package_id.id),
                    ("start_datetime", "<", schedule.end_datetime),
                    ("end_datetime", ">", schedule.start_datetime),
                ],
                limit=1,
            )
            if duplicate_tour:
                raise ValidationError(
                    _(
                        "This tour package already has an overlapping published departure."
                    )
                )

            for field_name, label in (
                ("driver_id", _("driver")),
                ("guide_id", _("tour guide")),
                ("vehicle_id", _("vehicle")),
            ):
                resource = schedule[field_name]
                conflict = self.sudo().search_count(
                    [
                        ("id", "!=", schedule.id),
                        ("state", "=", "published"),
                        (field_name, "=", resource.id),
                        ("start_datetime", "<", schedule.end_datetime),
                        ("end_datetime", ">", schedule.start_datetime),
                    ],
                    limit=1,
                )
                if conflict:
                    raise ValidationError(
                        _(
                            "The selected %(resource)s is already assigned "
                            "to an overlapping departure.",
                            resource=label,
                        )
                    )

    @api.constrains("capacity", "start_datetime", "end_datetime", "state")
    def _check_details(self):
        self._validate_schedule_details()

    @api.constrains(
        "package_id",
        "driver_id",
        "guide_id",
        "vehicle_id",
        "capacity",
        "state",
        "start_datetime",
        "end_datetime",
    )
    def _check_assignments(self):
        self._validate_resource_types()
        published = self.filtered(lambda schedule: schedule.state == "published")
        if published:
            published._assigned_resources()._lock_assignments()
            published._validate_publish_requirements()

    def action_check_resources(self):
        self.ensure_one()
        self._require_operations_staff()
        self.check_access("read")
        self._validate_schedule_details()
        self._validate_resource_types()
        self._validate_publish_requirements()

        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Schedule check passed"),
                "message": _(
                    "No conflicts were found. Driver, guide, and vehicle are available."
                ),
                "type": "success",
                "sticky": False,
            },
        }

    def action_publish(self):
        self.ensure_one()
        self._require_operations_staff()
        self.check_access("write")
        if self.state != "draft":
            return True

        resources = self._assigned_resources()
        resources._lock_assignments()
        self._validate_schedule_details()
        self._validate_resource_types()

        # Validate using the intended published state before the write.
        self.flush_recordset()
        self.env.cr.execute(
            "SELECT id FROM tour_operator_schedule WHERE id = %s FOR UPDATE",
            [self.id],
        )
        self.invalidate_recordset()
        self._validate_publish_requirements()

        return super(TourSchedule, self).write(
            {
                "state": "published",
                "scheduled_at": fields.Datetime.now(),
                "scheduled_by_id": self.env.user.id,
            }
        )

    def action_set_draft(self):
        self.ensure_one()
        self._require_operations_staff()
        self.check_access("write")
        if self.booking_ids.filtered(lambda booking: booking.state == "confirmed"):
            raise ValidationError(
                _("A departure with confirmed bookings cannot be returned to draft.")
            )
        return super(TourSchedule, self).write(
            {
                "state": "draft",
                "scheduled_at": False,
                "scheduled_by_id": False,
            }
        )

    def write(self, vals):
        self.check_access("write")
        self._lock_capacity()

        booked = self.env["tour.operator.booking"].sudo().search(
            [
                ("schedule_id", "in", self.ids),
                ("state", "=", "confirmed"),
            ]
        )
        if booked and set(vals) & {
            "package_id",
            "company_id",
            "start_datetime",
            "end_datetime",
            "state",
        }:
            raise ValidationError(
                _(
                    "A departure with confirmed bookings cannot change its tour, "
                    "dates, company, or status."
                )
            )
        if "capacity" in vals:
            for schedule in self:
                reserved = sum(
                    booked.filtered(
                        lambda booking: booking.schedule_id == schedule
                    ).mapped("number_of_guests")
                )
                if vals["capacity"] < reserved:
                    raise ValidationError(
                        _("Capacity cannot be less than the confirmed guest count.")
                    )

        result = super().write(vals)
        if vals.get("state") == "published":
            self._validate_publish_requirements()
        return result
