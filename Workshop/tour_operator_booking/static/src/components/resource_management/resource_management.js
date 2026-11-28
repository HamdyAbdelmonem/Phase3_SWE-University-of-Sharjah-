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

const RESOURCE_MODEL = "tour.operator.resource";
const SCHEDULE_MODEL = "tour.operator.schedule";

const RESOURCE_FIELDS = [
    "id",
    "name",
    "kind",
    "company_id",
];

const SCHEDULE_FIELDS = [
    "id",
    "name",
    "package_id",
    "company_id",
    "driver_id",
    "vehicle_id",
    "start_datetime",
    "end_datetime",
    "capacity",
    "reserved_guests",
    "available_seats",
    "state",
];

export class ResourceManagement extends Component {

    static template = "tour_operator_booking.ResourceManagement";
    static props = ["*"];

    // =====================================================
    // 01. COMPONENT SETUP
    // =====================================================

    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");

        const today = DateTime.local().toISODate();

        this.state = useState({
            loading: true,
            saving: false,
            error: "",
            formError: "",

            resources: [],
            schedules: [],

            search: "",
            kindFilter: "all",
            statusFilter: "all",

            dateFrom: today,
            dateTo: today,

            appliedDateFrom: today,
            appliedDateTo: today,

            selectedResourceId: false,

            showResourceForm: false,
            editingResourceId: false,

            formName: "",
            formKind: "vehicle",

            canAccessBookings: false,
            canAccessDashboard: false,
            canAccessReports: false,
            canAccessOperations: false,
        });

        onWillStart(async () => {
            await Promise.all([
                this.loadPermissions(),
                this.loadResources(),
            ]);
        });
    }

    // =====================================================
    // 02. USER PERMISSIONS
    // =====================================================

    async loadPermissions() {
        try {
            const [
                bookingStaff,
                operationsStaff,
                tourManager,
            ] = await Promise.all([
                user.hasGroup(
                    "tour_operator_booking.group_booking_staff"
                ),
                user.hasGroup(
                    "tour_operator_booking.group_operations_staff"
                ),
                user.hasGroup(
                    "tour_operator_booking.group_tour_manager"
                ),
            ]);

            this.state.canAccessBookings = bookingStaff;
            this.state.canAccessOperations = operationsStaff;
            this.state.canAccessDashboard = tourManager;
            this.state.canAccessReports = tourManager;

        } catch (error) {
            console.error(
                "Nexus resource permissions:",
                error
            );
        }
    }

    // =====================================================
    // 03. DATE RANGE VALIDATION
    // =====================================================

    get invalidDateRange() {
        if (!this.state.dateFrom || !this.state.dateTo) {
            return true;
        }

        const start = DateTime.fromISO(
            this.state.dateFrom
        );

        const end = DateTime.fromISO(
            this.state.dateTo
        );

        return (
            !start.isValid ||
            !end.isValid ||
            start.toMillis() > end.toMillis()
        );
    }

    get periodLabel() {
        const start = DateTime.fromISO(
            this.state.appliedDateFrom
        );

        const end = DateTime.fromISO(
            this.state.appliedDateTo
        );

        if (!start.isValid || !end.isValid) {
            return "Selected period";
        }

        if (start.hasSame(end, "day")) {
            return start.toFormat("dd LLL yyyy");
        }

        return (
            start.toFormat("dd LLL yyyy") +
            " — " +
            end.toFormat("dd LLL yyyy")
        );
    }

    // =====================================================
    // 04. LOAD LIVE RESOURCE DATA
    // =====================================================

    async loadResources() {

        if (this.invalidDateRange) {
            this.notification.add(
                "Please select a valid date range.",
                { type: "warning" }
            );

            this.state.loading = false;
            return false;
        }

        this.state.loading = true;
        this.state.error = "";

        const dateFrom = this.state.dateFrom;
        const dateTo = this.state.dateTo;

        try {

            const start = DateTime.fromISO(
                dateFrom
            ).startOf("day");

            const end = DateTime.fromISO(
                dateTo
            ).plus({ days: 1 }).startOf("day");

            const resources = await this.orm.searchRead(
                RESOURCE_MODEL,
                [],
                RESOURCE_FIELDS,
                {
                    order: "kind, name, id",
                }
            );

            const resourceIds = resources.map(
                resource => resource.id
            );

            let schedules = [];

            if (resourceIds.length) {

                schedules = await this.orm.searchRead(
                    SCHEDULE_MODEL,
                    [
                        ["state", "=", "published"],

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

                        "|",

                        [
                            "driver_id",
                            "in",
                            resourceIds,
                        ],

                        [
                            "vehicle_id",
                            "in",
                            resourceIds,
                        ],
                    ],
                    SCHEDULE_FIELDS,
                    {
                        order: "start_datetime, id",
                    }
                );
            }

            this.state.resources = resources;
            this.state.schedules = schedules;

            this.state.appliedDateFrom = dateFrom;
            this.state.appliedDateTo = dateTo;

            const selectedExists = resources.some(
                resource =>
                    resource.id ===
                    this.state.selectedResourceId
            );

            if (!selectedExists) {
                this.state.selectedResourceId =
                    resources.length
                        ? resources[0].id
                        : false;
            }

            return true;

        } catch (error) {

            console.error(
                "Nexus resource loading error:",
                error
            );

            this.state.error = this.getErrorMessage(
                error,
                "Unable to load operational resources."
            );

            return false;

        } finally {
            this.state.loading = false;
        }
    }

    // =====================================================
    // 05. REFRESH AND PERIOD CONTROLS
    // =====================================================

    async refreshResources() {
        if (this.state.loading || this.state.saving) {
            return;
        }

        const success = await this.loadResources();

        if (success) {
            this.notification.add(
                "Resource information refreshed.",
                { type: "success" }
            );
        }
    }

    async applyPeriod() {
        if (this.state.loading || this.state.saving) {
            return;
        }

        await this.loadResources();
    }

    async showToday() {
        if (this.state.loading || this.state.saving) {
            return;
        }

        const today = DateTime.local().toISODate();

        this.state.dateFrom = today;
        this.state.dateTo = today;

        await this.loadResources();
    }

    async showNextSevenDays() {
        if (this.state.loading || this.state.saving) {
            return;
        }

        const today = DateTime.local();

        this.state.dateFrom = today.toISODate();

        this.state.dateTo = today
            .plus({ days: 6 })
            .toISODate();

        await this.loadResources();
    }

    // =====================================================
    // 06. RESOURCE ASSIGNMENTS
    // =====================================================

    assignmentsFor(resource) {

        if (!resource) {
            return [];
        }

        return this.state.schedules.filter(schedule => {

            if (resource.kind === "driver") {
                return (
                    schedule.driver_id &&
                    schedule.driver_id[0] === resource.id
                );
            }

            if (resource.kind === "vehicle") {
                return (
                    schedule.vehicle_id &&
                    schedule.vehicle_id[0] === resource.id
                );
            }

            return false;
        });
    }

    isAssigned(resource) {
        return this.assignmentsFor(resource).length > 0;
    }

    resourceStatus(resource) {
        return this.isAssigned(resource)
            ? "assigned"
            : "available";
    }

    resourceStatusLabel(resource) {
        return this.isAssigned(resource)
            ? "Assigned"
            : "Available";
    }

    assignmentCount(resource) {
        return this.assignmentsFor(resource).length;
    }

    get assignedResources() {
        return this.state.resources.filter(
            resource => this.isAssigned(resource)
        );
    }

    get availableResources() {
        return this.state.resources.filter(
            resource => !this.isAssigned(resource)
        );
    }

    // =====================================================
    // 07. LIVE RESOURCE STATISTICS
    // =====================================================

    get statistics() {

        const resources = this.state.resources;

        const vehicles = resources.filter(
            resource => resource.kind === "vehicle"
        );

        const drivers = resources.filter(
            resource => resource.kind === "driver"
        );

        const assignedVehicles = vehicles.filter(
            resource => this.isAssigned(resource)
        ).length;

        const assignedDrivers = drivers.filter(
            resource => this.isAssigned(resource)
        ).length;

        const assigned =
            assignedVehicles + assignedDrivers;

        const total = resources.length;

        return {
            total,

            totalVehicles: vehicles.length,
            totalDrivers: drivers.length,

            assignedVehicles,
            assignedDrivers,

            availableVehicles:
                vehicles.length - assignedVehicles,

            availableDrivers:
                drivers.length - assignedDrivers,

            assigned,
            available: total - assigned,

            assignmentRate: total
                ? Math.round(assigned / total * 100)
                : 0,

            scheduledTours:
                this.state.schedules.length,
        };
    }

    // =====================================================
    // 08. SEARCH AND FILTERING
    // =====================================================

    get filteredResources() {

        const search = this.state.search
            .trim()
            .toLowerCase();

        return this.state.resources.filter(resource => {

            const name = (
                resource.name || ""
            ).toLowerCase();

            const company = resource.company_id
                ? resource.company_id[1].toLowerCase()
                : "";

            const searchMatches =
                !search ||
                name.includes(search) ||
                company.includes(search);

            const kindMatches =
                this.state.kindFilter === "all" ||
                resource.kind === this.state.kindFilter;

            const statusMatches =
                this.state.statusFilter === "all" ||
                this.resourceStatus(resource) ===
                    this.state.statusFilter;

            return (
                searchMatches &&
                kindMatches &&
                statusMatches
            );
        });
    }

    get filteredVehicles() {
        return this.filteredResources.filter(
            resource => resource.kind === "vehicle"
        );
    }

    get filteredDrivers() {
        return this.filteredResources.filter(
            resource => resource.kind === "driver"
        );
    }

    setKindFilter(kind) {
        this.state.kindFilter = kind;
    }

    setStatusFilter(status) {
        this.state.statusFilter = status;
    }

    resetFilters() {
        this.state.search = "";
        this.state.kindFilter = "all";
        this.state.statusFilter = "all";
    }

    // =====================================================
    // 09. SELECTED RESOURCE DETAILS
    // =====================================================

    selectResource(resourceId) {
        this.state.selectedResourceId = Number(
            resourceId
        );
    }

    get selectedResource() {
        return this.state.resources.find(
            resource =>
                resource.id ===
                this.state.selectedResourceId
        ) || null;
    }

    get selectedAssignments() {
        return this.assignmentsFor(
            this.selectedResource
        );
    }

    get hasResources() {
        return this.state.resources.length > 0;
    }

    get hasMatchingResources() {
        return this.filteredResources.length > 0;
    }

    // =====================================================
    // 10. RESOURCE CREATION FORM
    // =====================================================

    openNewResource(kind = "vehicle") {

        if (this.state.saving) {
            return;
        }

        this.state.editingResourceId = false;

        this.state.formName = "";

        this.state.formKind =
            kind === "driver"
                ? "driver"
                : "vehicle";

        this.state.formError = "";
        this.state.showResourceForm = true;
    }

    newVehicle() {
        this.openNewResource("vehicle");
    }

    newDriver() {
        this.openNewResource("driver");
    }

    newResource() {
        this.openNewResource("vehicle");
    }

    // =====================================================
    // 11. EDIT EXISTING RESOURCE
    // =====================================================

    editResource(resourceId) {

        if (this.state.saving) {
            return;
        }

        const resource = this.state.resources.find(
            item => item.id === Number(resourceId)
        );

        if (!resource) {
            return;
        }

        this.state.editingResourceId = resource.id;
        this.state.formName = resource.name;
        this.state.formKind = resource.kind;

        this.state.formError = "";
        this.state.showResourceForm = true;
    }

    editSelectedResource() {
        if (this.selectedResource) {
            this.editResource(
                this.selectedResource.id
            );
        }
    }

    closeResourceForm() {

        if (this.state.saving) {
            return;
        }

        this.state.showResourceForm = false;
        this.state.editingResourceId = false;

        this.state.formName = "";
        this.state.formKind = "vehicle";
        this.state.formError = "";
    }

    get isEditingResource() {
        return Boolean(
            this.state.editingResourceId
        );
    }

    get resourceFormTitle() {

        if (this.isEditingResource) {
            return "Edit Resource";
        }

        return this.state.formKind === "driver"
            ? "Add New Driver"
            : "Add New Vehicle";
    }

    get canSaveResource() {
        return (
            !this.state.saving &&
            Boolean(this.state.formName.trim()) &&
            ["vehicle", "driver"].includes(
                this.state.formKind
            )
        );
    }

    // =====================================================
    // 12. SAVE RESOURCE TO ODOO
    // =====================================================

    async saveResource(event) {

        if (event) {
            event.preventDefault();
        }

        if (this.state.saving) {
            return;
        }

        const name = this.state.formName.trim();
        const kind = this.state.formKind;

        if (!name) {
            this.state.formError =
                "Please enter a resource name.";
            return;
        }

        if (!["vehicle", "driver"].includes(kind)) {
            this.state.formError =
                "Please choose a valid resource type.";
            return;
        }

        if (this.invalidDateRange) {
            this.state.formError =
                "Please correct the selected date range.";
            return;
        }

        this.state.saving = true;
        this.state.formError = "";

        const editingId =
            this.state.editingResourceId;

        try {

            let resourceId;

            if (editingId) {

                // Existing resource types and companies
                // must not be changed.

                await this.orm.write(
                    RESOURCE_MODEL,
                    [editingId],
                    {
                        name: name,
                    }
                );

                resourceId = editingId;

            } else {

                // Odoo applies the active company
                // through the backend default.

                const ids = await this.orm.create(
                    RESOURCE_MODEL,
                    [
                        {
                            name: name,
                            kind: kind,
                        },
                    ]
                );

                resourceId = ids[0];
            }

            this.state.selectedResourceId =
                resourceId;

            this.state.showResourceForm = false;
            this.state.editingResourceId = false;
            this.state.formName = "";
            this.state.formError = "";

            this.resetFilters();

            this.notification.add(
                editingId
                    ? "Resource updated successfully."
                    : "Resource created successfully.",
                {
                    type: "success",
                }
            );

            await this.loadResources();

        } catch (error) {

            console.error(
                "Nexus resource save error:",
                error
            );

            this.state.formError =
                this.getErrorMessage(
                    error,
                    "Unable to save this resource."
                );

        } finally {
            this.state.saving = false;
        }
    }

    // =====================================================
    // 13. FORMATTING HELPERS
    // =====================================================

    getErrorMessage(error, fallback) {
        return (
            error?.data?.message ||
            error?.message ||
            fallback
        );
    }

    resourceInitials(name) {

        if (!name) {
            return "?";
        }

        return name
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(word => word.charAt(0).toUpperCase())
            .join("") || "?";
    }

    resourceKindLabel(kind) {

        if (kind === "vehicle") {
            return "Vehicle";
        }

        if (kind === "driver") {
            return "Driver";
        }

        return "Resource";
    }

    companyName(resource) {
        return resource?.company_id
            ? resource.company_id[1]
            : "—";
    }

    packageName(schedule) {
        return schedule?.package_id
            ? schedule.package_id[1]
            : "—";
    }

    formatDateTime(value) {

        if (!value) {
            return "—";
        }

        try {
            const date = deserializeDateTime(value);

            return date.isValid
                ? date.toFormat(
                    "dd LLL yyyy, hh:mm a"
                )
                : "—";

        } catch {
            return "—";
        }
    }

    formatTime(value) {

        if (!value) {
            return "—";
        }

        try {
            const date = deserializeDateTime(value);

            return date.isValid
                ? date.toFormat("hh:mm a")
                : "—";

        } catch {
            return "—";
        }
    }

    capacityPercentage(schedule) {

        const capacity = Number(
            schedule?.capacity || 0
        );

        const reserved = Number(
            schedule?.reserved_guests || 0
        );

        return capacity > 0
            ? Math.max(
                0,
                Math.min(
                    100,
                    Math.round(
                        reserved / capacity * 100
                    )
                )
            )
            : 0;
    }

    // =====================================================
    // 14. NEXUS SIDEBAR NAVIGATION
    // =====================================================

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

    openCreateBooking() {
        return this.action.doAction(
            "tour_operator_booking.action_create_booking_dashboard"
        );
    }

    openPackages() {
        return this.action.doAction(
            "tour_operator_booking.action_packages"
        );
    }

    openOperations() {
        return this.action.doAction(
            "tour_operator_booking.action_tour_scheduling_dashboard"
        );
    }

    openReports() {
        return this.action.doAction(
            "tour_operator_booking.action_booking_reports_dashboard"
        );
    }

    // =====================================================
    // 15. ORIGINAL ODOO MANAGEMENT VIEWS
    // =====================================================

    openManageResources() {
        return this.action.doAction(
            "tour_operator_booking.action_resources"
        );
    }

    openManageDepartures() {
        return this.action.doAction(
            "tour_operator_booking.action_schedules"
        );
    }

    openDeparture(scheduleId) {

        return this.action.doAction({
            type: "ir.actions.act_window",
            name: "Tour Departure",
            res_model: SCHEDULE_MODEL,
            res_id: Number(scheduleId),
            views: [[false, "form"]],
            target: "current",
        });
    }
}

// =========================================================
// REGISTER NEXUS RESOURCE MANAGEMENT CLIENT ACTION
// =========================================================

registry.category("actions").add(
    "tour_operator_booking.resource_management",
    ResourceManagement
);