from odoo.tools.sql import column_exists


def migrate(cr, version):
    # The original scaffold did not create the booking model.
    if column_exists(cr, "tour_operator_booking", "booking_source"):
        cr.execute("""
            UPDATE tour_operator_booking
               SET booking_source = 'direct'
             WHERE booking_source IN ('phone', 'email')
        """)
