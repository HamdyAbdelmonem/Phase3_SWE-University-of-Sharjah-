from datetime import timedelta

from odoo import fields
from odoo.exceptions import AccessError, UserError, ValidationError
from odoo.tests import Form, TransactionCase, tagged
from odoo.tests.common import new_test_user


@tagged("post_install", "-at_install")
class TestTourBooking(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.staff = new_test_user(cls.env, login="tour_test_staff", groups="tour_operator_booking.group_booking_staff")
        cls.outsider = new_test_user(cls.env, login="tour_test_outsider", groups="base.group_user")
        cls.customer = cls.env["res.partner"].create({"name": "Tour Test Customer"})
        cls.package = cls.env["tour.operator.package"].create({"name": "Safari", "price_per_guest": 100})
        cls.schedule = cls.env["tour.operator.schedule"].create({
            "name": "Tomorrow's safari", "package_id": cls.package.id,
            "start_datetime": fields.Datetime.now() + timedelta(days=1),
            "end_datetime": fields.Datetime.now() + timedelta(days=1, hours=3),
            "capacity": 5, "state": "published",
        })

    def _book(self, guests=1, **extra):
        return self.env["tour.operator.booking"].with_user(self.staff).create({
            "customer_id": self.customer.id, "package_id": self.package.id,
            "schedule_id": self.schedule.id, "number_of_guests": guests, **extra,
        })

    def test_saved_price_and_draft_capacity(self):
        booking = self._book(2, unit_price=1)
        self.assertEqual(booking.total_price, 200)
        self.assertTrue(booking.name.startswith("TB/"))
        self.assertEqual(self.schedule.available_seats, 5)
        self.package.price_per_guest = 150
        self.assertEqual(booking.total_price, 200)

    def test_confirm_reserves_once_and_returns_voucher(self):
        booking = self._book(5)
        action = booking.action_confirm()
        self.assertEqual(action["report_type"], "qweb-pdf")
        self.assertEqual(booking.state, "confirmed")
        self.assertEqual(self.schedule.available_seats, 0)
        with self.assertRaises(UserError):
            booking.action_confirm()
        with self.assertRaises(UserError):
            booking.write({"number_of_guests": 1})

    def test_confirmation_rechecks_capacity(self):
        first, second = self._book(4), self._book(2)
        first.action_confirm()
        with self.assertRaises(ValidationError), self.cr.savepoint():
            second.action_confirm()
        self.assertEqual(second.state, "draft")
        self.assertEqual(self.schedule.available_seats, 1)

    def test_invalid_guests_and_mismatched_package(self):
        for guests in [0, -1, 6]:
            with self.assertRaises(ValidationError), self.cr.savepoint():
                self._book(guests)
        other = self.env["tour.operator.package"].create({"name": "Yacht", "price_per_guest": 200})
        with self.assertRaises(ValidationError), self.cr.savepoint():
            self._book(package_id=other.id)

    def test_no_direct_state_bypass(self):
        with self.assertRaises(UserError), self.cr.savepoint():
            self._book(state="confirmed")
        booking = self._book()
        with self.assertRaises(UserError):
            booking.write({"state": "confirmed"})

    def test_departure_rules(self):
        self.schedule.state = "draft"
        with self.assertRaises(ValidationError), self.cr.savepoint():
            self._book()
        self.schedule.write({
            "state": "published",
            "start_datetime": fields.Datetime.now() - timedelta(hours=2),
            "end_datetime": fields.Datetime.now() - timedelta(hours=1),
        })
        with self.assertRaises(ValidationError), self.cr.savepoint():
            self._book()

    def test_confirmed_schedule_cannot_shrink(self):
        self._book(4).action_confirm()
        with self.assertRaises(ValidationError), self.cr.savepoint():
            self.schedule.capacity = 3

    def test_form_gui_flow(self):
        # Simulates the Create Booking screen: picking a departure fills package and price.
        form = Form(self.env["tour.operator.booking"].with_user(self.staff))
        form.customer_id = self.customer
        form.schedule_id = self.schedule
        self.assertEqual(form.package_id, self.package)
        self.assertEqual(form.unit_price, 100)
        form.number_of_guests = 3
        self.assertEqual(form.total_price, 300)
        booking = form.save()
        self.assertEqual(booking.state, "draft")
        self.assertIn("5 seats left", self.schedule.display_name)

    def test_permissions(self):
        with self.assertRaises(AccessError), self.cr.savepoint():
            self.env["tour.operator.booking"].with_user(self.outsider).create({
                "customer_id": self.customer.id, "schedule_id": self.schedule.id,
                "package_id": self.package.id,
            })
        with self.assertRaises(AccessError), self.cr.savepoint():
            self.schedule.with_user(self.staff).write({"capacity": 100})
