from odoo import fields, models, _
from odoo.exceptions import ValidationError


class CancelBookingWizard(models.TransientModel):
    _name = "tour.operator.booking.cancel.wizard"
    _description = "Cancel Tour Booking"

    booking_id = fields.Many2one(
        "tour.operator.booking",
        string="Booking",
        required=True,
        readonly=True,
        ondelete="cascade",
    )
    reason = fields.Text(string="Cancellation Reason", required=True)

    def action_cancel_booking(self):
        self.ensure_one()
        if not (self.reason or "").strip():
            raise ValidationError(_("A cancellation reason is required."))
        return self.booking_id.action_cancel(self.reason)
