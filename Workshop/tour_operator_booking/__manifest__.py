{
    "name": "Tour Operator Booking Suite",
    "version": "19.0.5.0.0",
    "summary": "Schedule tours, reserve seats, issue vouchers, and report confirmed booking value",
    "category": "Services",
    "author": "University of Sharjah Phase 3 Team",
    "license": "LGPL-3",
    "depends": ["base", "contacts", "web"],
    "data": [
        "security/security.xml",
        "security/ir.model.access.csv",
        "security/company_rules.xml",
        "data/booking_sequence.xml",
        "views/tour_package_views.xml",
        "views/tour_schedule_views.xml",
        "views/booking_views.xml",
        "wizard/cancel_booking_wizard_views.xml",
        "report/booking_voucher.xml",
        "views/operational_resource_views.xml",
        "wizard/booking_report_wizard_views.xml",
        "views/menu_views.xml"
    ],
    "application": True,
    "installable": True
}
