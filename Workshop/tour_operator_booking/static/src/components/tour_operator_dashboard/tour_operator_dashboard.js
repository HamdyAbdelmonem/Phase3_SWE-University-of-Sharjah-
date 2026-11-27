/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

export class TourOperatorDashboard extends Component {
    static template = "tour_operator_booking.Dashboard";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");

        this.state = useState({
            totalBookings: "—",
            confirmedBookings: "—",
            upcomingTours: "—",
            error: false,
        });

        onWillStart(() => this.loadDashboard());
    }

    // LOAD LIVE DASHBOARD STATISTICS

    async loadDashboard() {
        try {
            const now = new Date().toISOString()
                .slice(0, 19).replace("T", " ");

            const [total, confirmed, upcoming] =
                await Promise.all([
                    this.orm.searchCount(
                        "tour.operator.booking", []
                    ),
                    this.orm.searchCount(
                        "tour.operator.booking",
                        [["state", "=", "confirmed"]]
                    ),
                    this.orm.searchCount(
                        "tour.operator.schedule",
                        [
                            ["state", "=", "published"],
                            ["start_datetime", ">=", now]
                        ]
                    ),
                ]);

            this.state.totalBookings = total;
            this.state.confirmedBookings = confirmed;
            this.state.upcomingTours = upcoming;
            this.state.error = false;

        } catch (error) {
            this.state.error = true;
            console.error(error);
        }
    }

    // OPEN BOOKINGS

    openBookings() {
        return this.action.doAction(
            "tour_operator_booking.action_bookings"
        );
    }

    // OPEN NEXUS PROFESSIONAL TOUR SCHEDULING

    openSchedules() {
        return this.action.doAction(
            "tour_operator_booking.action_tour_scheduling_dashboard"
        );
    }

    // OPEN NEXUS PROFESSIONAL BOOKING REPORTS

    openReports() {
        return this.action.doAction(
            "tour_operator_booking.action_booking_reports_dashboard"
        );
    }

    // CREATE A NEW BOOKING

    addBooking() {
    return this.action.doAction(
        "tour_operator_booking.action_create_booking_dashboard"
    );
}

    // OPEN PROFESSIONAL SCHEDULING WORKSPACE

    scheduleTour() {
        return this.openSchedules();
    }
}

registry.category("actions").add(
    "tour_operator_dashboard",
    TourOperatorDashboard
);
