
from odoo import api, models


class BookingSummaryReport(models.AbstractModel):
    _name = "report.tour_operator_booking.booking_summary_document"
    _description = "All Bookings Summary Report"

    @api.model
    def _get_report_values(self, docids, data=None):

        
        bookings = self.env["tour.operator.booking"].search(
            [("company_id", "=", self.env.company.id)],
            order="id desc"
        )

       
        confirmed = bookings.filtered(
            lambda booking: booking.state == "confirmed"
        )

        cancelled = bookings.filtered(
            lambda booking: booking.state == "cancelled"
        )

        draft = bookings.filtered(
            lambda booking: booking.state == "draft"
        )

        total_guests = sum(bookings.mapped("number_of_guests"))

        confirmed_guests = sum(
            confirmed.mapped("number_of_guests")
        )

        total_booking_value = sum(
            bookings.mapped("total_price")
        )

        confirmed_revenue = sum(
            confirmed.mapped("total_price")
        )

        return {
            "doc_ids": bookings.ids,
            "doc_model": "tour.operator.booking",
            "docs": bookings,

            "total_bookings": len(bookings),
            "confirmed_count": len(confirmed),
            "cancelled_count": len(cancelled),
            "draft_count": len(draft),

            "total_guests": total_guests,
            "confirmed_guests": confirmed_guests,

            "total_booking_value": total_booking_value,
            "confirmed_revenue": confirmed_revenue,

            "company": self.env.company,
        }
