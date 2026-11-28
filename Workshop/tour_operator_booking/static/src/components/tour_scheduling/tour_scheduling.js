
/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import {
    deserializeDateTime,
    serializeDateTime,
} from "@web/core/l10n/dates";
import { user } from "@web/core/user";

const { DateTime } = luxon;

const SCHEDULE_MODEL = "tour.operator.schedule";
const RESOURCE_MODEL = "tour.operator.resource";
const PACKAGE_MODEL = "tour.operator.package";

const SCHEDULE_FIELDS = [
    "id",
    "name",
    "company_id",
    "package_id",
    "driver_id",
    "vehicle_id",
    "start_datetime",
    "end_datetime",
    "capacity",
    "reserved_guests",
    "available_seats",
    "state",
];

const PACKAGE_COLORS = [
    { background: "#dcfce7", text: "#047857", border: "#10b981" },
    { background: "#dbeafe", text: "#1d4ed8", border: "#3b82f6" },
    { background: "#ede9fe", text: "#6d28d9", border: "#8b5cf6" },
    { background: "#fef3c7", text: "#a16207", border: "#f59e0b" },
    { background: "#fce7f3", text: "#be185d", border: "#ec4899" },
    { background: "#ccfbf1", text: "#0f766e", border: "#14b8a6" },
    { background: "#ffedd5", text: "#c2410c", border: "#f97316" },
    { background: "#e0e7ff", text: "#4338ca", border: "#6366f1" },
];

export class TourScheduling extends Component {

    static template = "tour_operator_booking.TourScheduling";

    // =========================================================
    // COMPONENT INITIALIZATION
    // =========================================================

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");

        this.loadRequest = 0;
        this.conflictRequest = 0;

        this.state = useState({
            loading: true,
            saving: false,
            error: "",

            view: "month",
            anchorDate: DateTime.local().toISODate(),

            schedules: [],
            packages: [],
            resources: [],

            packageFilter: "",
            statusFilter: "",

            selectedId: false,
            driverId: "",
            vehicleId: "",

            checkingConflicts: false,
            conflictsChecked: false,
            conflictError: "",
            conflictRows: [],

            isManager: false,
            isBookingStaff: false,
        });

        onWillStart(async () => {
            const [isManager, isBookingStaff] = await Promise.all([
                user.hasGroup(
                    "tour_operator_booking.group_tour_manager"
                ).catch(() => false),

                user.hasGroup(
                    "tour_operator_booking.group_booking_staff"
                ).catch(() => false),
            ]);

            this.state.isManager = isManager;
            this.state.isBookingStaff = isBookingStaff;

            await this.loadSchedules();
        });
    }

    // =========================================================
    // DATE AND CALENDAR UTILITIES
    // =========================================================

    get anchor() {
        return DateTime.fromISO(this.state.anchorDate);
    }

    get today() {
        return DateTime.local().toISODate();
    }

    get weekdays() {
        return [
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
            "Sun",
        ];
    }

    get periodRange() {
        const date = this.anchor;

        if (this.state.view === "day") {
            return {
                start: date.startOf("day"),
                end: date.startOf("day").plus({ days: 1 }),
            };
        }

        if (this.state.view === "week") {
            return {
                start: date.startOf("week"),
                end: date.startOf("week").plus({ weeks: 1 }),
            };
        }

        return {
            start: date.startOf("month"),
            end: date.startOf("month").plus({ months: 1 }),
        };
    }

    get calendarRange() {
        if (this.state.view === "month") {
            const start = this.anchor
                .startOf("month")
                .startOf("week");

            return {
                start,
                end: start.plus({ days: 42 }),
            };
        }

        return this.periodRange;
    }

    get calendarTitle() {
        const { start, end } = this.periodRange;

        if (this.state.view === "day") {
            return start.toFormat("cccc, dd LLLL yyyy");
        }

        if (this.state.view === "week") {
            return (
                start.toFormat("dd LLL") +
                " – " +
                end.minus({ days: 1 }).toFormat("dd LLL yyyy")
            );
        }

        return this.anchor.toFormat("LLLL yyyy");
    }

    formatDateTime(value) {
        if (!value) {
            return "—";
        }

        return deserializeDateTime(value)
            .toFormat("dd LLL yyyy, hh:mm a");
    }

    formatTime(value) {
        if (!value) {
            return "—";
        }

        return deserializeDateTime(value)
            .toFormat("hh:mm a");
    }

    eventTime(schedule) {
        if (!schedule.start_datetime || !schedule.end_datetime) {
            return "Time not specified";
        }

        const start = deserializeDateTime(
            schedule.start_datetime
        );

        const end = deserializeDateTime(
            schedule.end_datetime
        );

        if (start.toISODate() !== end.toISODate()) {
            return (
                start.toFormat("dd LLL, hh:mm a") +
                " – " +
                end.toFormat("dd LLL, hh:mm a")
            );
        }

        return (
            start.toFormat("hh:mm a") +
            " – " +
            end.toFormat("hh:mm a")
        );
    }

    overlapsRange(schedule, start, end) {
        if (
            !schedule.start_datetime ||
            !schedule.end_datetime
        ) {
            return false;
        }

        const scheduleStart = deserializeDateTime(
            schedule.start_datetime
        );

        const scheduleEnd = deserializeDateTime(
            schedule.end_datetime
        );

        return scheduleStart < end && scheduleEnd > start;
    }

    // =========================================================
    // LOAD LIVE ODOO DATA
    // =========================================================

    async loadSchedules() {
        const request = ++this.loadRequest;

        ++this.conflictRequest;

        this.state.loading = true;
        this.state.error = "";
        this.state.checkingConflicts = false;
        this.state.conflictsChecked = false;

        const { start, end } = this.calendarRange;

        try {
            const [
                schedules,
                packages,
                resources,
            ] = await Promise.all([

                this.orm.searchRead(
                    SCHEDULE_MODEL,
                    [
                        [
                            "start_datetime",
                            "<",
                            serializeDateTime(end),
                        ],
                        [
                            "end_datetime",
                            ">",
                            serializeDateTime(start),
                        ],
                    ],
                    SCHEDULE_FIELDS,
                    {
                        order: "start_datetime asc, id asc",
                    }
                ),

                this.orm.searchRead(
                    PACKAGE_MODEL,
                    [],
                    [
                        "id",
                        "name",
                        "description",
                        "company_id",
                    ],
                    {
                        order: "name asc",
                    }
                ),

                this.orm.searchRead(
                    RESOURCE_MODEL,
                    [],
                    [
                        "id",
                        "name",
                        "kind",
                        "company_id",
                    ],
                    {
                        order: "kind asc, name asc",
                    }
                ),

            ]);

            if (request !== this.loadRequest) {
                return;
            }

            const previousId = this.state.selectedId;

            this.state.schedules = schedules;
            this.state.packages = packages;
            this.state.resources = resources;

            const selected =
                this.periodSchedules.find(
                    schedule => schedule.id === previousId
                ) || this.periodSchedules[0];

            if (selected) {
                await this.selectDeparture(selected.id);
            } else {
                this.clearSelection();
            }

        } catch (error) {
            if (request === this.loadRequest) {
                this.state.error = this.errorMessage(error);

                console.error(
                    "Tour scheduling loading error:",
                    error
                );
            }

        } finally {
            if (request === this.loadRequest) {
                this.state.loading = false;
            }
        }
    }

    errorMessage(error) {
        return (
            error?.data?.message ||
            error?.message ||
            "An unexpected error occurred."
        );
    }

    // =========================================================
    // CALENDAR NAVIGATION
    // =========================================================

    async setView(view) {
        if (
            !["day", "week", "month"].includes(view) ||
            this.state.saving ||
            this.state.view === view
        ) {
            return;
        }

        this.state.view = view;

        await this.loadSchedules();
    }

    async previousPeriod() {
        await this.shiftPeriod(-1);
    }

    async nextPeriod() {
        await this.shiftPeriod(1);
    }

    async shiftPeriod(direction) {
        if (this.state.saving) {
            return;
        }

        let date = this.anchor;

        if (this.state.view === "day") {
            date = date.plus({ days: direction });

        } else if (this.state.view === "week") {
            date = date.plus({ weeks: direction });

        } else {
            date = date.plus({ months: direction });
        }

        this.state.anchorDate = date.toISODate();

        await this.loadSchedules();
    }

    async goToday() {
        if (this.state.saving) {
            return;
        }

        this.state.anchorDate = this.today;

        await this.loadSchedules();
    }

    async openDay(date) {
        if (this.state.saving) {
            return;
        }

        this.state.anchorDate = date;
        this.state.view = "day";

        await this.loadSchedules();
    }

    // =========================================================
    // FILTERING
    // =========================================================

    get filteredSchedules() {
        return this.state.schedules.filter(schedule => {

            const packageMatches =
                !this.state.packageFilter ||
                String(schedule.package_id?.[0]) ===
                    this.state.packageFilter;

            const statusMatches =
                !this.state.statusFilter ||
                schedule.state === this.state.statusFilter;

            return packageMatches && statusMatches;
        });
    }

    get periodSchedules() {
        const { start, end } = this.periodRange;

        return this.filteredSchedules.filter(
            schedule => this.overlapsRange(
                schedule,
                start,
                end
            )
        );
    }

    async changePackageFilter(event) {
        this.state.packageFilter = event.target.value;

        await this.updateFilteredSelection();
    }

    async changeStatusFilter(event) {
        this.state.statusFilter = event.target.value;

        await this.updateFilteredSelection();
    }

    async resetFilters() {
        this.state.packageFilter = "";
        this.state.statusFilter = "";

        await this.updateFilteredSelection();
    }

    async updateFilteredSelection() {
        const selected = this.periodSchedules.find(
            schedule => schedule.id === this.state.selectedId
        );

        if (selected) {
            return;
        }

        if (this.periodSchedules.length) {
            await this.selectDeparture(
                this.periodSchedules[0].id
            );
        } else {
            this.clearSelection();
        }
    }

    // =========================================================
    // CALENDAR GENERATION
    // =========================================================

    get calendarDays() {
        const { start, end } = this.calendarRange;

        const days = [];

        let date = start;

        while (date < end) {
            const nextDay = date.plus({ days: 1 });
            const dateKey = date.toISODate();

            const events = this.filteredSchedules.filter(
                schedule => this.overlapsRange(
                    schedule,
                    date,
                    nextDay
                )
            );

            days.push({
                date: dateKey,
                dayNumber: date.day,
                dayName: date.toFormat("ccc"),
                fullLabel: date.toFormat("cccc, dd LLLL"),

                isToday: dateKey === this.today,

                isCurrentMonth:
                    date.month === this.anchor.month &&
                    date.year === this.anchor.year,

                isWeekend: date.weekday >= 6,

                events,
            });

            date = nextDay;
        }

        return days;
    }

    packageColor(packageId) {
        const index =
            Math.abs(Number(packageId) || 0) %
            PACKAGE_COLORS.length;

        return PACKAGE_COLORS[index];
    }

    eventStyle(schedule) {
        const color = this.packageColor(
            schedule.package_id?.[0]
        );

        return (
            `background-color: ${color.background};` +
            `color: ${color.text};` +
            `border-left: 4px solid ${color.border};`
        );
    }

    get packageLegend() {
        const ids = new Set(
            this.filteredSchedules
                .map(schedule => schedule.package_id?.[0])
                .filter(Boolean)
        );

        return this.state.packages
            .filter(pkg => ids.has(pkg.id))
            .map(pkg => ({
                id: pkg.id,
                name: pkg.name,
                color: this.packageColor(pkg.id).border,
            }));
    }

    // =========================================================
    // LIVE DEPARTURE STATISTICS
    // =========================================================

    get statistics() {
        const schedules = this.periodSchedules;

        const published = schedules.filter(
            schedule => schedule.state === "published"
        );

        const drafts = schedules.filter(
            schedule => schedule.state === "draft"
        );

        const reserved = published.reduce(
            (sum, schedule) =>
                sum + Number(schedule.reserved_guests || 0),
            0
        );

        const capacity = published.reduce(
            (sum, schedule) =>
                sum + Number(schedule.capacity || 0),
            0
        );

        const available = published.reduce(
            (sum, schedule) =>
                sum + Number(schedule.available_seats || 0),
            0
        );

        return {
            total: schedules.length,
            published: published.length,
            drafts: drafts.length,

            reserved,
            available,
            capacity,

            utilization: capacity
                ? Math.round(reserved / capacity * 100)
                : 0,
        };
    }

    capacityPercent(schedule) {
        if (!schedule || !schedule.capacity) {
            return 0;
        }

        return Math.max(
            0,
            Math.min(
                100,
                Math.round(
                    schedule.reserved_guests /
                    schedule.capacity * 100
                )
            )
        );
    }

    capacityColor(schedule) {
        const percent = this.capacityPercent(schedule);

        if (percent >= 100) {
            return "#dc2626";
        }

        if (percent >= 80) {
            return "#f59e0b";
        }

        return "#008c50";
    }

    formatStatus(state) {
        return state === "published"
            ? "Published"
            : "Draft";
    }

    // =========================================================
    // SELECTED DEPARTURE
    // =========================================================

    get selectedDeparture() {
        return this.state.schedules.find(
            schedule => schedule.id === this.state.selectedId
        ) || null;
    }

    get selectedPackage() {
        const packageId =
            this.selectedDeparture?.package_id?.[0];

        return this.state.packages.find(
            pkg => pkg.id === packageId
        ) || null;
    }

    async selectDeparture(id) {
        if (this.state.saving && !this.state.loading) {
            return;
        }

        const schedule = this.state.schedules.find(
            record => record.id === Number(id)
        );

        if (!schedule) {
            return;
        }

        this.state.selectedId = schedule.id;

        this.state.driverId = schedule.driver_id
            ? String(schedule.driver_id[0])
            : "";

        this.state.vehicleId = schedule.vehicle_id
            ? String(schedule.vehicle_id[0])
            : "";

        await this.checkConflicts();
    }

    clearSelection() {
        ++this.conflictRequest;

        this.state.selectedId = false;
        this.state.driverId = "";
        this.state.vehicleId = "";

        this.state.conflictRows = [];
        this.state.conflictsChecked = false;
        this.state.checkingConflicts = false;
        this.state.conflictError = "";
    }

    // =========================================================
    // DRIVER AND VEHICLE ASSIGNMENTS
    // =========================================================

    resourceOptions(kind) {
        const schedule = this.selectedDeparture;

        if (!schedule) {
            return [];
        }

        const companyId = schedule.company_id?.[0];

        const options = this.state.resources.filter(
            resource =>
                resource.kind === kind &&
                resource.company_id?.[0] === companyId
        );

        const existing = kind === "driver"
            ? schedule.driver_id
            : schedule.vehicle_id;

        if (
            existing &&
            !options.some(resource => resource.id === existing[0])
        ) {
            return [
                ...options,
                {
                    id: existing[0],
                    name: existing[1],
                    kind,
                },
            ];
        }

        return options;
    }

    get drivers() {
        return this.resourceOptions("driver");
    }

    get vehicles() {
        return this.resourceOptions("vehicle");
    }

    changeDriver(event) {
        this.state.driverId = event.target.value;
    }

    changeVehicle(event) {
        this.state.vehicleId = event.target.value;
    }

    get hasPendingChanges() {
        const schedule = this.selectedDeparture;

        if (!schedule) {
            return false;
        }

        return (
            this.state.driverId !==
                String(schedule.driver_id?.[0] || "") ||

            this.state.vehicleId !==
                String(schedule.vehicle_id?.[0] || "")
        );
    }

    assignmentValues() {
        const schedule = this.selectedDeparture;

        if (!schedule) {
            return {};
        }

        const values = {};

        const driver = Number(this.state.driverId) || false;
        const vehicle = Number(this.state.vehicleId) || false;

        if (driver !== (schedule.driver_id?.[0] || false)) {
            values.driver_id = driver;
        }

        if (vehicle !== (schedule.vehicle_id?.[0] || false)) {
            values.vehicle_id = vehicle;
        }

        return values;
    }

    // =========================================================
    // RESOURCE CONFLICT DETECTION
    // =========================================================

    async checkConflicts() {
        const schedule = this.selectedDeparture;

        if (!schedule) {
            return;
        }

        const request = ++this.conflictRequest;

        this.state.checkingConflicts = true;
        this.state.conflictsChecked = false;
        this.state.conflictError = "";
        this.state.conflictRows = [];

        try {
            const overlapping = await this.orm.searchRead(
                SCHEDULE_MODEL,
                [
                    ["id", "!=", schedule.id],
                    ["state", "=", "published"],

                    [
                        "start_datetime",
                        "<",
                        schedule.end_datetime,
                    ],

                    [
                        "end_datetime",
                        ">",
                        schedule.start_datetime,
                    ],
                ],
                [
                    "id",
                    "name",
                    "driver_id",
                    "vehicle_id",
                    "start_datetime",
                    "end_datetime",
                ]
            );

            if (request !== this.conflictRequest) {
                return;
            }

            this.state.conflictRows = overlapping;
            this.state.conflictsChecked = true;

        } catch (error) {
            if (request === this.conflictRequest) {
                this.state.conflictError =
                    this.errorMessage(error);
            }

        } finally {
            if (request === this.conflictRequest) {
                this.state.checkingConflicts = false;
            }
        }
    }

    resourceConflict(kind, resourceId) {
        const id = Number(resourceId);

        if (!id) {
            return null;
        }

        const field = kind === "driver"
            ? "driver_id"
            : "vehicle_id";

        return this.state.conflictRows.find(
            schedule => schedule[field]?.[0] === id
        ) || null;
    }

    resourceStatus(kind, resourceId) {
        if (!resourceId) {
            return {
                label: "Not assigned",
                tone: "neutral",
                detail: "Choose a resource.",
            };
        }

        if (this.state.checkingConflicts) {
            return {
                label: "Checking...",
                tone: "neutral",
                detail: "Checking overlapping departures.",
            };
        }

        if (!this.state.conflictsChecked) {
            return {
                label: "Not verified",
                tone: "warning",
                detail: "Final validation is performed by Odoo.",
            };
        }

        const conflict = this.resourceConflict(
            kind,
            resourceId
        );

        if (conflict) {
            return {
                label: "Conflict detected",
                tone: "danger",
                detail:
                    conflict.name +
                    " | " +
                    this.eventTime(conflict),
            };
        }

        return {
            label: "No visible conflict",
            tone: "success",
            detail: "Subject to final server validation.",
        };
    }

    get driverStatus() {
        return this.resourceStatus(
            "driver",
            this.state.driverId
        );
    }

    get vehicleStatus() {
        return this.resourceStatus(
            "vehicle",
            this.state.vehicleId
        );
    }

    get selectedConflicts() {
        const conflicts = [];

        const driverConflict = this.resourceConflict(
            "driver",
            this.state.driverId
        );

        const vehicleConflict = this.resourceConflict(
            "vehicle",
            this.state.vehicleId
        );

        if (driverConflict) {
            conflicts.push({
                key: "driver",
                type: "Driver",
                departure: driverConflict.name,
                time: this.eventTime(driverConflict),
            });
        }

        if (vehicleConflict) {
            conflicts.push({
                key: "vehicle",
                type: "Vehicle",
                departure: vehicleConflict.name,
                time: this.eventTime(vehicleConflict),
            });
        }

        return conflicts;
    }

    // =========================================================
    // SAVE RESOURCE ASSIGNMENTS
    // =========================================================

    async saveAssignments() {
        const schedule = this.selectedDeparture;

        if (!schedule || this.state.saving) {
            return;
        }

        const values = this.assignmentValues();

        if (!Object.keys(values).length) {
            this.notification.add(
                "No assignment changes to save.",
                { type: "info" }
            );

            return;
        }

        this.state.saving = true;

        try {
            await this.orm.write(
                SCHEDULE_MODEL,
                [schedule.id],
                values
            );

            this.notification.add(
                "Resource assignments saved successfully.",
                { type: "success" }
            );

            await this.loadSchedules();

        } catch (error) {
            this.notification.add(
                this.errorMessage(error),
                {
                    type: "danger",
                    sticky: true,
                }
            );

            await this.checkConflicts();

        } finally {
            this.state.saving = false;
        }
    }

    // =========================================================
    // PUBLISH DEPARTURE
    // =========================================================

    async publishDeparture() {
        const schedule = this.selectedDeparture;

        if (
            !schedule ||
            schedule.state !== "draft" ||
            this.state.saving
        ) {
            return;
        }

        const start = deserializeDateTime(
            schedule.start_datetime
        );

        if (start <= DateTime.local()) {
            this.notification.add(
                "Choose a future departure before publishing.",
                { type: "warning" }
            );

            return;
        }

        this.state.saving = true;

        try {
            await this.orm.write(
                SCHEDULE_MODEL,
                [schedule.id],
                {
                    ...this.assignmentValues(),
                    state: "published",
                }
            );

            this.notification.add(
                "Departure published successfully.",
                { type: "success" }
            );

            await this.loadSchedules();

        } catch (error) {
            this.notification.add(
                this.errorMessage(error),
                {
                    type: "danger",
                    sticky: true,
                }
            );

            await this.checkConflicts();

        } finally {
            this.state.saving = false;
        }
    }

    // =========================================================
    // CREATE AND EDIT DEPARTURES
    // =========================================================

    newDeparture() {
        if (this.state.saving) {
            return;
        }

        const start = this.anchor.set({
            hour: 9,
            minute: 0,
            second: 0,
            millisecond: 0,
        });

        const end = start.plus({ hours: 4 });

        return this.action.doAction(
            {
                type: "ir.actions.act_window",
                name: "Create Tour Departure",
                res_model: SCHEDULE_MODEL,
                views: [[false, "form"]],
                target: "new",

                context: {
                    default_start_datetime:
                        serializeDateTime(start),

                    default_end_datetime:
                        serializeDateTime(end),

                    default_capacity: 10,
                    default_state: "draft",
                },
            },
            {
                onClose: () => this.loadSchedules(),
            }
        );
    }

    editDeparture() {
        const schedule = this.selectedDeparture;

        if (!schedule || this.state.saving) {
            return;
        }

        return this.action.doAction(
            {
                type: "ir.actions.act_window",
                name: "Edit Tour Departure",
                res_model: SCHEDULE_MODEL,
                res_id: schedule.id,
                views: [[false, "form"]],
                target: "new",
            },
            {
                onClose: () => this.loadSchedules(),
            }
        );
    }

    // =========================================================
    // NEXUS NAVIGATION
    // =========================================================

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

    openReports() {
        return this.action.doAction(
            "tour_operator_booking.action_booking_reports_dashboard"
        );
    }

    openResources() {
        return this.action.doAction(
            "tour_operator_booking.action_resource_management_dashboard"
        );
    }

    openPackages() {
        return this.action.doAction(
            "tour_operator_booking.action_tour_packages_dashboard"
        );
    }

    openNativeSchedules() {
        return this.action.doAction(
            "tour_operator_booking.action_schedules"
        );
    }
}

// =============================================================
// REGISTER OWL CLIENT ACTION
// =============================================================

registry.category("actions").add(
    "tour_operator_booking.tour_scheduling",
    TourScheduling
);
