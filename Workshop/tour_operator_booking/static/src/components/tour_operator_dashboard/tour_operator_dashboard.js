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

    openBookings() {
        return this.action.doAction(
            "tour_operator_booking.action_bookings"
        );
    }

    openSchedules() {
        return this.action.doAction(
            "tour_operator_booking.action_schedules"
        );
    }

    openReports() {
        return this.action.doAction(
            "tour_operator_booking.action_booking_report"
        );
    }

    addBooking() {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name: "Create Booking",
            res_model: "tour.operator.booking",
            views: [[false, "form"]],
            target: "current",
        });
    }

    scheduleTour() {
        return this.action.doAction({
            type: "ir.actions.act_window",
            name: "Schedule Tour",
            res_model: "tour.operator.schedule",
            views: [[false, "form"]],
            target: "current",
        });
    }
}

registry.category("actions").add(
    "tour_operator_dashboard",
    TourOperatorDashboard
);