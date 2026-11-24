from datetime import timedelta

from odoo import fields
from odoo.exceptions import AccessError, ValidationError
from odoo.tests import Form, TransactionCase, tagged
from odoo.tests.common import new_test_user


@tagged("post_install", "-at_install")
class TestScheduleTour(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.ops = new_test_user(
            cls.env,
            login="schedule_ops",
            groups="tour_operator_booking.group_operations_staff",
        )
        cls.manager = new_test_user(
            cls.env,
            login="schedule_manager",
            groups="tour_operator_booking.group_tour_manager",
        )
        cls.booking_staff = new_test_user(
            cls.env,
            login="schedule_booking_staff",
            groups="tour_operator_booking.group_booking_staff",
        )
        cls.package = cls.env["tour.operator.package"].with_user(cls.manager).create(
            {"name": "Desert Safari", "price_per_guest": 250}
        )
        resources = cls.env["tour.operator.resource"].with_user(cls.ops)
        cls.driver = resources.create({"name": "Driver A", "kind": "driver"})
        cls.guide = resources.create({"name": "Guide A", "kind": "guide"})
        cls.vehicle = resources.create(
            {"name": "Bus A", "kind": "vehicle", "vehicle_capacity": 12}
        )
        cls.start = fields.Datetime.now() + timedelta(days=3)

    def _draft(self, **extra):
        values = {
            "name": "Morning Safari",
            "package_id": self.package.id,
            "start_datetime": self.start,
            "end_datetime": self.start + timedelta(hours=4),
            "capacity": 10,
            "driver_id": self.driver.id,
            "guide_id": self.guide.id,
            "vehicle_id": self.vehicle.id,
        }
        values.update(extra)
        return self.env["tour.operator.schedule"].with_user(self.ops).create(values)

    def test_schedule_tour_happy_path(self):
        schedule = self._draft()
        check = schedule.action_check_resources()
        self.assertEqual(check["tag"], "display_notification")
        self.assertEqual(schedule.state, "draft")

        schedule.action_publish()

        self.assertEqual(schedule.state, "published")
        self.assertEqual(schedule.scheduled_by_id, self.ops)
        self.assertTrue(schedule.scheduled_at)
        self.assertEqual(schedule.available_seats, 10)

    def test_requires_driver_guide_and_vehicle(self):
        for field_name in ("driver_id", "guide_id", "vehicle_id"):
            schedule = self._draft(**{field_name: False})
            with self.assertRaises(ValidationError):
                schedule.action_publish()

    def test_vehicle_capacity_is_checked(self):
        small_vehicle = self.env["tour.operator.resource"].with_user(self.ops).create(
            {
                "name": "Small Van",
                "kind": "vehicle",
                "vehicle_capacity": 4,
            }
        )
        schedule = self._draft(vehicle_id=small_vehicle.id, capacity=5)
        with self.assertRaises(ValidationError):
            schedule.action_publish()

    def test_overlapping_same_tour_is_rejected(self):
        first = self._draft()
        first.action_publish()

        resources = self.env["tour.operator.resource"].with_user(self.ops)
        other_driver = resources.create({"name": "Driver B", "kind": "driver"})
        other_guide = resources.create({"name": "Guide B", "kind": "guide"})
        other_vehicle = resources.create(
            {"name": "Bus B", "kind": "vehicle", "vehicle_capacity": 20}
        )
        second = self._draft(
            name="Second Safari",
            driver_id=other_driver.id,
            guide_id=other_guide.id,
            vehicle_id=other_vehicle.id,
            start_datetime=self.start + timedelta(minutes=30),
            end_datetime=self.start + timedelta(hours=5),
        )
        with self.assertRaises(ValidationError):
            second.action_publish()

    def test_guide_overlap_is_rejected(self):
        first = self._draft()
        first.action_publish()

        other_package = self.env["tour.operator.package"].with_user(self.manager).create(
            {"name": "City Tour", "price_per_guest": 100}
        )
        resources = self.env["tour.operator.resource"].with_user(self.ops)
        other_driver = resources.create({"name": "Driver C", "kind": "driver"})
        other_vehicle = resources.create(
            {"name": "Bus C", "kind": "vehicle", "vehicle_capacity": 20}
        )
        second = self._draft(
            name="City Departure",
            package_id=other_package.id,
            driver_id=other_driver.id,
            vehicle_id=other_vehicle.id,
        )
        with self.assertRaises(ValidationError):
            second.action_publish()

    def test_adjacent_resource_assignment_is_allowed(self):
        first = self._draft()
        first.action_publish()

        second = self._draft(
            name="Later Safari",
            start_datetime=first.end_datetime,
            end_datetime=first.end_datetime + timedelta(hours=2),
        )
        second.action_publish()
        self.assertEqual(second.state, "published")

    def test_only_operations_staff_can_publish(self):
        schedule = self._draft()
        schedule = schedule.with_user(self.booking_staff)
        with self.assertRaises(AccessError):
            schedule.action_publish()

    def test_past_tour_cannot_be_published(self):
        past = fields.Datetime.now() - timedelta(days=1)
        schedule = self._draft(
            start_datetime=past,
            end_datetime=past + timedelta(hours=2),
        )
        with self.assertRaises(ValidationError):
            schedule.action_publish()

    def test_booking_staff_can_select_published_departure(self):
        schedule = self._draft()
        schedule.action_publish()

        customer = self.env["res.partner"].with_user(self.booking_staff).create(
            {"name": "Schedule Test Customer"}
        )
        form = Form(
            self.env["tour.operator.booking"].with_user(self.booking_staff)
        )
        form.customer_id = customer
        form.schedule_id = schedule

        self.assertEqual(form.schedule_id, schedule)
        self.assertEqual(form.package_id, self.package)
