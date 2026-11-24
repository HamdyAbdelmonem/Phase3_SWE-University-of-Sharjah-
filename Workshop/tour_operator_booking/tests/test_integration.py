from datetime import datetime, timedelta

from odoo import fields
from odoo.exceptions import AccessError, ValidationError
from odoo.tests import TransactionCase, tagged
from odoo.tests.common import new_test_user


@tagged("post_install", "-at_install")
class TestTourWorkflows(TransactionCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.ops = new_test_user(cls.env, login="phase3_ops", groups="tour_operator_booking.group_operations_staff")
        cls.staff = new_test_user(cls.env, login="phase3_staff", groups="tour_operator_booking.group_booking_staff")
        cls.manager = new_test_user(cls.env, login="phase3_manager", groups="tour_operator_booking.group_tour_manager")
        cls.package = cls.env["tour.operator.package"].with_user(cls.manager).create({
            "name": "City tour", "price_per_guest": 100,
        })
        cls.customer = cls.env["res.partner"].with_user(cls.staff).create({"name": "Test traveller"})
        cls.resources = cls.env["tour.operator.resource"].with_user(cls.ops)
        cls.driver, cls.guide, cls.vehicle = cls.resources.create([
            {"name": "Salma", "kind": "driver"},
            {"name": "Mariam", "kind": "guide"},
            {"name": "Bus 7", "kind": "vehicle", "vehicle_capacity": 20},
        ])
        cls.start = datetime.combine(fields.Date.today() + timedelta(days=8), datetime.min.time()).replace(hour=21)
        cls.values = {
            "name": "City departure", "package_id": cls.package.id, "start_datetime": cls.start,
            "end_datetime": cls.start + timedelta(hours=1), "capacity": 5, "state": "published",
            "driver_id": cls.driver.id, "guide_id": cls.guide.id, "vehicle_id": cls.vehicle.id,
        }
        cls.schedules = cls.env["tour.operator.schedule"].with_user(cls.ops)
        cls.schedule = cls.schedules.create(cls.values)
        cls.reports = cls.env["booking.report.wizard"].with_user(cls.manager).with_context(tz="Asia/Dubai")

    def _report(self, day):
        return self.reports.create({"date_from": day, "date_to": day})

    def test_connected_workflow(self):
        bookings = self.env["tour.operator.booking"].with_user(self.staff)
        values = {"customer_id": self.customer.id, "schedule_id": self.schedule.id, "number_of_guests": 2}
        booking = bookings.create(values)
        local_day = self.start.date() + timedelta(days=1)
        self.assertEqual(self.schedule.available_seats, 5)
        self.assertEqual(self._report(local_day).total_bookings, 0)
        action = booking.action_confirm()
        self.assertEqual(action["report_type"], "qweb-pdf")
        report_service = booking.env["ir.actions.report"]
        html, _ = report_service._render_qweb_html(action["report_name"], booking.ids)
        self.assertIn(b"Tour Booking Voucher", html)
        self.assertIn(b"data:image/png", html)
        self.assertEqual(self.schedule.available_seats, 3)
        self.package.price_per_guest = 150
        report = self._report(local_day)
        self.assertEqual((report.total_bookings, report.total_revenue), (1, 200))
        self.assertEqual(self._report(self.start.date()).total_bookings, 0)
        with self.assertRaises(ValidationError), self.cr.savepoint():
            bookings.create(dict(values, number_of_guests=4))
        with self.assertRaises(ValidationError), self.cr.savepoint():
            self.schedules.create(self.values)
        wizard = booking.env[booking.action_open_cancel_wizard()["res_model"]].create({
            "booking_id": booking.id, "reason": "Change of plans",
        })
        wizard.action_cancel_booking()
        html, _ = report_service._render_qweb_html(action["report_name"], booking.ids)
        self.assertIn(b"Voucher Invalid", html)
        self.assertNotIn(b"Tour Booking Voucher", html)
        self.assertEqual(self.schedule.available_seats, 5)
        report = self._report(local_day)
        self.assertEqual((report.total_bookings, report.total_revenue), (0, 0))

    def test_resource_conflicts(self):
        for resource in ("driver_id", "guide_id", "vehicle_id"):
            values = dict(
                self.values,
                driver_id=False,
                guide_id=False,
                vehicle_id=False,
                state="draft",
            )
            values[resource] = self.values[resource]
            draft = self.schedules.create(values)
            with self.assertRaises(ValidationError), self.cr.savepoint():
                draft.write({
                    "driver_id": self.driver.id,
                    "guide_id": self.guide.id,
                    "vehicle_id": self.vehicle.id,
                    "state": "published",
                })
        self.schedules.create(dict(
            self.values,
            name="Adjacent city departure",
            start_datetime=self.schedule.end_datetime,
            end_datetime=self.schedule.end_datetime + timedelta(hours=1),
        ))
        with self.assertRaises(ValidationError), self.cr.savepoint():
            self.schedules.create(dict(
                self.values,
                name="Wrong resource type",
                state="draft",
                driver_id=self.vehicle.id,
            ))

    def test_role_and_date_validation(self):
        for user in (self.ops, self.staff):
            with self.assertRaises(AccessError), self.cr.savepoint():
                self.reports.with_user(user).create({})
        with self.assertRaises(ValidationError), self.cr.savepoint():
            self.reports.create({"date_from": self.start.date(), "date_to": self.start.date() - timedelta(days=1)})

    def test_report_uses_current_company_among_allowed_companies(self):
        other = self.env["res.company"].create({"name": "Second tour operator"})
        company = self.package.company_id
        self.manager.company_ids |= other
        self.env["tour.operator.booking"].with_user(self.staff).create({
            "customer_id": self.customer.id, "schedule_id": self.schedule.id,
        }).action_confirm()
        day = self.start.date() + timedelta(days=1)
        for companies, expected in (([company.id, other.id], 1), ([other.id, company.id], 0)):
            report = self.reports.with_context(allowed_company_ids=companies).create({
                "date_from": day, "date_to": day,
            })
            self.assertEqual(report.total_bookings, expected)
