
/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { user } from "@web/core/user";

const { DateTime } = luxon;

export class BookingReports extends Component {
    static template = "tour_operator_booking.BookingReports";

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");

        this.state = useState({
    loading: true,
    error: "",
    bookings: [],
    currency: "",
    dateFrom: "",
    dateTo: "",
    packageId: "",
    source: "",
    status: "",

    canAccessDashboard: false,
    canAccessBookings: false,
    canAccessOperations: false,
});

        onWillStart(async () => {
    await Promise.all([
        this.loadReports(),
        this.loadNavigationPermissions(),
    ]);
});
    }

        // =====================================================
    // NEXUS SIDEBAR NAVIGATION
    // =====================================================

    async loadNavigationPermissions() {
        try {
            const [
                manager,
                bookingStaff,
                operationsStaff,
            ] = await Promise.all([
                user.hasGroup(
                    "tour_operator_booking.group_tour_manager"
                ),
                user.hasGroup(
                    "tour_operator_booking.group_booking_staff"
                ),
                user.hasGroup(
                    "tour_operator_booking.group_operations_staff"
                ),
            ]);

            this.state.canAccessDashboard = manager;
            this.state.canAccessBookings = bookingStaff;
            this.state.canAccessOperations = operationsStaff;

        } catch (error) {
            console.error(
                "Booking reports navigation permissions:",
                error
            );
        }
    }

    openDashboard() {
        return this.action.doAction(
            "tour_operator_booking.action_tour_operator_dashboard"
        );
    }

    openBookings() {
        return this.action.doAction(
            "tour_operator_booking.action_bookings"
        );
    }

    openPackages() {
        return this.action.doAction(
            "tour_operator_booking.action_packages"
        );
    }

    openResources() {
        return this.action.doAction(
            "tour_operator_booking.action_resource_management_dashboard"
        );
    }

    openOperations() {
        return this.action.doAction(
            "tour_operator_booking.action_tour_scheduling_dashboard"
        );
    }
    // Retrieve real booking records from Odoo
    async loadReports() {
        this.state.loading = true;
        this.state.error = "";

        try {
            const isManager = await user.hasGroup(
                "tour_operator_booking.group_tour_manager"
            );

            if (!isManager) {
                throw new Error(
                    "Only Tour Operator Managers can access reports."
                );
            }

            const companyId = user.context.allowed_company_ids?.[0];

            if (!companyId) {
                throw new Error("No active company was found.");
            }

            const bookings = await this.orm.searchRead(
                "tour.operator.booking",
                [["company_id", "=", companyId]],
                [
                    "name",
                    "customer_id",
                    "package_id",
                    "schedule_id",
                    "number_of_guests",
                    "total_price",
                    "booking_source",
                    "state",
                    "create_date",
                ],
                { order: "id desc" }
            );

            const scheduleIds = [
                ...new Set(
                    bookings
                        .filter(b => b.schedule_id)
                        .map(b => b.schedule_id[0])
                ),
            ];

            const schedules = scheduleIds.length
                ? await this.orm.read(
                    "tour.operator.schedule",
                    scheduleIds,
                    ["start_datetime"]
                )
                : [];

            const scheduleMap = new Map(
                schedules.map(s => [s.id, s])
            );

            const companies = await this.orm.read(
                "res.company",
                [companyId],
                ["currency_id"]
            );

            const currencyId = companies[0]?.currency_id?.[0];

            if (currencyId) {
                const currencies = await this.orm.read(
                    "res.currency",
                    [currencyId],
                    ["name"]
                );

                this.state.currency = currencies[0]?.name || "";
            }

            const timezone = user.context.tz || "UTC";

            this.state.bookings = bookings.map(booking => {
                const schedule = scheduleMap.get(
                    booking.schedule_id?.[0]
                );

                const departure = schedule?.start_datetime
                    ? DateTime.fromSQL(schedule.start_datetime, {
                        zone: "UTC",
                    }).setZone(timezone)
                    : null;

                return {
                    ...booking,
                    departureDate: departure?.isValid
                        ? departure.toISODate()
                        : "",
                };
            });

        } catch (error) {
            console.error("Booking reports error:", error);
            this.state.bookings = [];
            this.state.error =
                error.message || "Unable to load booking reports.";
        } finally {
            this.state.loading = false;
        }
    }

    // Apply the selected report filters
    get filteredBookings() {
        const s = this.state;

        if (s.dateFrom && s.dateTo && s.dateFrom > s.dateTo) {
            return [];
        }

        return s.bookings.filter(booking => {
            if (
                s.dateFrom &&
                (!booking.departureDate ||
                    booking.departureDate < s.dateFrom)
            ) {
                return false;
            }

            if (
                s.dateTo &&
                (!booking.departureDate ||
                    booking.departureDate > s.dateTo)
            ) {
                return false;
            }

            if (
                s.packageId &&
                String(booking.package_id?.[0]) !== s.packageId
            ) {
                return false;
            }

            if (
                s.source &&
                booking.booking_source !== s.source
            ) {
                return false;
            }

            if (s.status && booking.state !== s.status) {
                return false;
            }

            return true;
        });
    }

    // KPI statistics
    get statistics() {
        const bookings = this.filteredBookings;

        const confirmed = bookings.filter(
            b => b.state === "confirmed"
        );

        const cancelled = bookings.filter(
            b => b.state === "cancelled"
        );

        const drafts = bookings.filter(
            b => b.state === "draft"
        );

        const bookingValue = confirmed.reduce(
            (sum, b) => sum + (b.total_price || 0),
            0
        );

        const guests = confirmed.reduce(
            (sum, b) => sum + (b.number_of_guests || 0),
            0
        );

        return {
            total: bookings.length,
            confirmed: confirmed.length,
            cancelled: cancelled.length,
            draft: drafts.length,
            bookingValue,
            guests,
            confirmationRate: bookings.length
                ? Math.round(
                    confirmed.length / bookings.length * 100
                )
                : 0,
            averageGuests: confirmed.length
                ? (guests / confirmed.length).toFixed(1)
                : "0.0",
        };
    }

    // Package filter options
    get packages() {
        const packages = new Map();

        for (const booking of this.state.bookings) {
            if (booking.package_id) {
                packages.set(
                    booking.package_id[0],
                    booking.package_id[1]
                );
            }
        }

        return Array.from(packages, ([id, name]) => ({
            id,
            name,
        })).sort((a, b) => a.name.localeCompare(b.name));
    }

    // Most popular tour packages
    get popularTours() {
        const tours = {};

        for (const booking of this.filteredBookings) {
            if (booking.state !== "confirmed") {
                continue;
            }

            const id = booking.package_id?.[0];

            if (!id) {
                continue;
            }

            if (!tours[id]) {
                tours[id] = {
                    id,
                    name: booking.package_id[1],
                    count: 0,
                    guests: 0,
                };
            }

            tours[id].count += 1;
            tours[id].guests += booking.number_of_guests || 0;
        }

        return Object.values(tours)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }

    // Booking status distribution
    get statusDistribution() {
        const s = this.statistics;

        const percentage = count =>
            s.total ? count / s.total * 100 : 0;

        return [
            {
                label: "Confirmed",
                count: s.confirmed,
                percentage: percentage(s.confirmed),
                color: "#008C50",
            },
            {
                label: "Draft",
                count: s.draft,
                percentage: percentage(s.draft),
                color: "#F59E0B",
            },
            {
                label: "Cancelled",
                count: s.cancelled,
                percentage: percentage(s.cancelled),
                color: "#EF4444",
            },
        ];
    }

    // Booking trends grouped by departure date
    get bookingTrend() {
        const days = {};

        for (const booking of this.filteredBookings) {
            const date = booking.departureDate;

            if (!date) {
                continue;
            }

            if (!days[date]) {
                days[date] = {
                    date,
                    total: 0,
                    confirmed: 0,
                    cancelled: 0,
                    value: 0,
                };
            }

            days[date].total += 1;

            if (booking.state === "confirmed") {
                days[date].confirmed += 1;
                days[date].value += booking.total_price || 0;
            }

            if (booking.state === "cancelled") {
                days[date].cancelled += 1;
            }
        }

        return Object.values(days).sort(
            (a, b) => a.date.localeCompare(b.date)
        );
    }

    // Direct and OTA booking statistics
    get sourceDistribution() {
        const bookings = this.filteredBookings;

        return [
            {
                label: "Direct",
                count: bookings.filter(
                    b => b.booking_source === "direct"
                ).length,
            },
            {
                label: "OTA",
                count: bookings.filter(
                    b => b.booking_source === "ota"
                ).length,
            },
        ];
    }

    // Format monetary values
    formatMoney(value) {
        if (!this.state.currency) {
            return Number(value || 0).toFixed(2);
        }

        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: this.state.currency,
        }).format(value || 0);
    }

    // Format booking states
    formatStatus(status) {
        const labels = {
            draft: "Draft",
            confirmed: "Confirmed",
            cancelled: "Cancelled",
        };

        return labels[status] || status;
    }

    // Clear all filters
    resetFilters() {
        this.state.dateFrom = "";
        this.state.dateTo = "";
        this.state.packageId = "";
        this.state.source = "";
        this.state.status = "";
    }

    // Open an existing booking
    async openBooking(bookingId) {
        await this.action.doAction({
            type: "ir.actions.act_window",
            name: "Booking Details",
            res_model: "tour.operator.booking",
            res_id: bookingId,
            views: [[false, "form"]],
            target: "current",
        });
    }
}

registry.category("actions").add(
    "tour_operator_booking.booking_reports",
    BookingReports
);
