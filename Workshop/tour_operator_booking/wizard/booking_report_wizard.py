"""Temporary date-range report parameters and calculations. Primary owner: Ameer.


Scaffold only: no business logic or executed test results.
"""

from odoo import models, fields, api
from odoo.exceptions import ValidationError

class BookingReportWizard(models.TransientModel):
    _name = 'booking.report.wizard'
    _description = 'Booking Report Wizard'

    date_from = fields.Date(
        string='Start Date',
        required=True
    )

    date_to = fields.Date(
        string='End Date',
        required=True
    )


    total_bookings = fields.Integer(
    string='Total Bookings',
    readonly=True
    )

    total_revenue = fields.Monetary(
    string='Total Revenue',
    currency_field='currency_id',
    readonly=True
    )

    currency_id = fields.Many2one(
    'res.currency',
    string='Currency',
    default=lambda self: self.env.company.currency_id,
    readonly=True
    )


    @api.constrains('date_from', 'date_to')
    def _check_date_range(self):
       for wizard in self:
        if (wizard.date_from and wizard.date_to
                and wizard.date_from > wizard.date_to):
            raise ValidationError(
                "The start date cannot be later than the end date."
            )


    def _get_bookings(self):

       
       pass
    