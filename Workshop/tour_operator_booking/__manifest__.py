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
        "views/menu_views.xml",
    ],

    "assets": {
        "web.assets_backend": [

            # Nexus Dashboard
            "tour_operator_booking/static/src/components/tour_operator_dashboard/tour_operator_dashboard.js",
            "tour_operator_booking/static/src/components/tour_operator_dashboard/tour_operator_dashboard.xml",
            "tour_operator_booking/static/src/components/tour_operator_dashboard/tour_operator_dashboard.scss",

            # Nexus Booking Reports
            "tour_operator_booking/static/src/components/booking_reports/booking_reports.js",
            "tour_operator_booking/static/src/components/booking_reports/booking_reports.xml",
            "tour_operator_booking/static/src/components/booking_reports/booking_reports.scss",

            # Nexus Tour Scheduling
            "tour_operator_booking/static/src/components/tour_scheduling/tour_scheduling.js",
            "tour_operator_booking/static/src/components/tour_scheduling/tour_scheduling.xml",
            "tour_operator_booking/static/src/components/tour_scheduling/tour_scheduling.scss",

            # Nexus Create Booking
            "tour_operator_booking/static/src/components/create_booking/create_booking.js",
            "tour_operator_booking/static/src/components/create_booking/create_booking.xml",
            "tour_operator_booking/static/src/components/create_booking/create_booking.scss",

            # Nexus Resource Management
            "tour_operator_booking/static/src/components/resource_management/resource_management.js",
            "tour_operator_booking/static/src/components/resource_management/resource_management.xml",
            "tour_operator_booking/static/src/components/resource_management/resource_management.scss",
            # Nexus Global Light / Dark Mode
            "tour_operator_booking/static/src/components/nexus_theme/nexus_theme.js",
            "tour_operator_booking/static/src/components/nexus_theme/nexus_theme.xml",
            "tour_operator_booking/static/src/components/nexus_theme/nexus_theme.scss",

        ],
    },

    "application": True,
    "installable": True
}