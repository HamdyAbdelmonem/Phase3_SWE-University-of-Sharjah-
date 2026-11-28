/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { deserializeDateTime } from "@web/core/l10n/dates";
import { user } from "@web/core/user";

const { DateTime } = luxon;

// =========================================================
// NEXUS - TOUR OPERATOR BOOKING SUITE
// Professional Tour Packages Workspace
// =========================================================

const PACKAGE_MODEL = "tour.operator.package";
const SCHEDULE_MODEL = "tour.operator.schedule";

const PACKAGE_FIELDS = [
    "id",
    "name",
    "description",
    "company_id",
    "currency_id",
    "price_per_guest",
];

const SCHEDULE_FIELDS = [
    "id",
    "name",
    "package_id",
    "company_id",
    "start_datetime",
    "end_datetime",
    "capacity",
    "reserved_guests",
    "available_seats",
    "state",
];

// =========================================================
// 01. DECORATIVE PACKAGE ARTWORK
// =========================================================

const PACKAGE_ARTWORK = [
    {
        theme: "gold",
        icon: "fa-sun-o",
    },
    {
        theme: "blue",
        icon: "fa-building",
    },
    {
        theme: "purple",
        icon: "fa-map-marker",
    },
    {
        theme: "teal",
        icon: "fa-globe",
    },
    {
        theme: "orange",
        icon: "fa-compass",
    },
    {
        theme: "green",
        icon: "fa-map",
    },
];

// =========================================================
// 02. TOUR PACKAGES COMPONENT
// =========================================================

export class TourPackages extends Component {

    static template = "tour_operator_booking.TourPackages";

    static props = ["*"];

    // =====================================================
    // 03. COMPONENT INITIALIZATION
    // =====================================================

    setup() {

        this.orm = useService("orm");

        this.action = useService("action");

        this.loadRequest = 0;

        this.state = useState({

            loading: true,

            error: "",

            statisticsWarning: "",

            packages: [],

            schedules: [],

            currencies: {},

            packageStatistics: {},

            scheduleStatsAvailable: false,

            search: "",

            companyFilter: "all",

            departureFilter: "all",

            sortBy: "name_asc",

            selectedPackageId: false,

            canAccessDashboard: false,

            canAccessBookings: false,

            canAccessOperations: false,

            canAccessReports: false,

        });

        onWillStart(async () => {

            await Promise.all([

                this.loadPermissions(),

                this.loadPackages(),

            ]);

        });

    }

    // =====================================================
    // 04. ROLE-BASED NAVIGATION PERMISSIONS
    // =====================================================

    async loadPermissions() {

        const [

            manager,

            bookingStaff,

            operationsStaff,

        ] = await Promise.all([

            user.hasGroup(
                "tour_operator_booking.group_tour_manager"
            ).catch(() => false),

            user.hasGroup(
                "tour_operator_booking.group_booking_staff"
            ).catch(() => false),

            user.hasGroup(
                "tour_operator_booking.group_operations_staff"
            ).catch(() => false),

        ]);

        this.state.canAccessDashboard = manager;

        this.state.canAccessReports = manager;

        this.state.canAccessBookings = bookingStaff;

        this.state.canAccessOperations = operationsStaff;

    }

    // =====================================================
    // 05. LOAD REAL ODOO PACKAGE RECORDS
    // =====================================================

    async loadPackages() {

        const requestId = ++this.loadRequest;

        this.state.loading = true;

        this.state.error = "";

        this.state.statisticsWarning = "";

        try {

            const packages = await this.orm.searchRead(

                PACKAGE_MODEL,

                [],

                PACKAGE_FIELDS,

                {
                    order: "name asc, id asc",
                }

            );

            if (requestId !== this.loadRequest) {

                return;

            }

            const packageIds = packages.map(
                (item) => item.id
            );

            const currencyIds = [

                ...new Set(

                    packages

                        .map(
                            (item) =>
                                this.relationId(item.currency_id)
                        )

                        .filter(Boolean)

                ),

            ];

            const scheduleRequest = packageIds.length

                ? this.orm.searchRead(

                    SCHEDULE_MODEL,

                    [
                        ["package_id", "in", packageIds],
                    ],

                    SCHEDULE_FIELDS,

                    {
                        order: "start_datetime asc, id asc",
                    }

                )

                : Promise.resolve([]);

            const currencyRequest = currencyIds.length

                ? this.orm.searchRead(

                    "res.currency",

                    [
                        ["id", "in", currencyIds],
                    ],

                    [
                        "id",
                        "name",
                    ],

                    {
                        context: {
                            active_test: false,
                        },
                    }

                )

                : Promise.resolve([]);

            const [

                scheduleResult,

                currencyResult,

            ] = await Promise.allSettled([

                scheduleRequest,

                currencyRequest,

            ]);

            if (requestId !== this.loadRequest) {

                return;

            }

            const currencies = {};

            if (currencyResult.status === "fulfilled") {

                for (const currency of currencyResult.value) {

                    currencies[currency.id] = currency.name;

                }

            }

            const schedulesAvailable =

                scheduleResult.status === "fulfilled";

            const schedules = schedulesAvailable

                ? scheduleResult.value

                : [];

            this.state.packages = packages;

            this.state.schedules = schedules;

            this.state.currencies = currencies;

            this.state.scheduleStatsAvailable =
                schedulesAvailable;

            this.state.packageStatistics =
                this.buildPackageStatistics(schedules);

            if (!schedulesAvailable) {

                this.state.statisticsWarning =

                    "Departure statistics are currently unavailable. " +

                    "Package management remains accessible.";

                this.state.departureFilter = "all";

                console.warn(

                    "Nexus package schedule statistics:",

                    scheduleResult.reason

                );

            }

            const selectedExists = packages.some(

                (item) =>

                    item.id === this.state.selectedPackageId

            );

            if (!selectedExists) {

                this.state.selectedPackageId =

                    packages.length

                        ? packages[0].id

                        : false;

            }

        } catch (error) {

            if (requestId !== this.loadRequest) {

                return;

            }

            console.error(

                "Nexus tour packages loading error:",

                error

            );

            this.state.packages = [];

            this.state.schedules = [];

            this.state.packageStatistics = {};

            this.state.scheduleStatsAvailable = false;

            this.state.selectedPackageId = false;

            this.state.error =

                error?.data?.message ||

                error?.message ||

                "Unable to load tour packages. Please try again.";

        } finally {

            if (requestId === this.loadRequest) {

                this.state.loading = false;

            }

        }

    }

    // =====================================================
    // 06. REFRESH WORKSPACE
    // =====================================================

    async refresh() {

        if (this.state.loading) {

            return;

        }

        await this.loadPackages();

    }

    // =====================================================
    // 07. MANY2ONE FIELD HELPERS
    // =====================================================

    relationId(value) {

        if (Array.isArray(value)) {

            return value[0] || false;

        }

        return false;

    }

    relationName(value) {

        if (Array.isArray(value)) {

            return value[1] || "";

        }

        return "";

    }

    companyName(item) {

        return this.relationName(item.company_id)

            || "Unknown company";

    }

    // =====================================================
    // 08. CURRENCY AND PRICE FORMATTING
    // =====================================================

    currencyCode(item) {

        const currencyId = this.relationId(

            item.currency_id

        );

        return (

            this.state.currencies[currencyId] ||

            this.relationName(item.currency_id) ||

            ""

        );

    }

    formatMoney(amount, currencyCode) {

        const value = Number(amount);

        if (!Number.isFinite(value)) {

            return "—";

        }

        const code = String(

            currencyCode || ""

        ).trim().toUpperCase();

        if (/^[A-Z]{3}$/.test(code)) {

            try {

                return new Intl.NumberFormat(

                    undefined,

                    {

                        style: "currency",

                        currency: code,

                        currencyDisplay: "symbol",

                    }

                ).format(value);

            } catch (error) {

                console.warn(

                    "Nexus currency formatting:",

                    error

                );

            }

        }

        const formatted = new Intl.NumberFormat(

            undefined,

            {

                minimumFractionDigits: 2,

                maximumFractionDigits: 2,

            }

        ).format(value);

        return code

            ? `${formatted} ${code}`

            : formatted;

    }

    packagePrice(item) {

        return this.formatMoney(

            item.price_per_guest,

            this.currencyCode(item)

        );

    }

    // =====================================================
    // 09. DATE FORMATTING
    // =====================================================

    formatDateTime(value) {

        if (!value) {

            return "—";

        }

        try {

            const date = deserializeDateTime(value);

            if (!date.isValid) {

                return "—";

            }

            return date.toLocaleString(

                DateTime.DATETIME_MED

            );

        } catch {

            return "—";

        }

    }

    dateTimestamp(value) {

        if (!value) {

            return null;

        }

        try {

            const date = deserializeDateTime(value);

            return date.isValid

                ? date.toMillis()

                : null;

        } catch {

            return null;

        }

    }

    // =====================================================
    // 10. LIVE DEPARTURE STATISTICS
    // =====================================================

    buildPackageStatistics(schedules) {

        const result = {};

        const now = DateTime.now().toMillis();

        for (const schedule of schedules) {

            const packageId = this.relationId(

                schedule.package_id

            );

            if (!packageId) {

                continue;

            }

            if (!result[packageId]) {

                result[packageId] = {

                    totalDepartures: 0,

                    publishedDepartures: 0,

                    draftDepartures: 0,

                    upcomingDepartures: 0,

                    confirmedGuests: 0,

                    upcomingCapacity: 0,

                    upcomingReserved: 0,

                    upcomingAvailable: 0,

                    nextDeparture: false,

                    nextDepartureTimestamp: null,

                };

            }

            const stats = result[packageId];

            stats.totalDepartures += 1;

            stats.confirmedGuests +=

                Number(schedule.reserved_guests) || 0;

            if (schedule.state === "draft") {

                stats.draftDepartures += 1;

            }

            if (schedule.state !== "published") {

                continue;

            }

            stats.publishedDepartures += 1;

            const start = this.dateTimestamp(

                schedule.start_datetime

            );

            if (start === null || start < now) {

                continue;

            }

            stats.upcomingDepartures += 1;

            stats.upcomingCapacity +=

                Number(schedule.capacity) || 0;

            stats.upcomingReserved +=

                Number(schedule.reserved_guests) || 0;

            stats.upcomingAvailable +=

                Number(schedule.available_seats) || 0;

            if (

                stats.nextDepartureTimestamp === null ||

                start < stats.nextDepartureTimestamp

            ) {

                stats.nextDeparture = schedule;

                stats.nextDepartureTimestamp = start;

            }

        }

        return result;

    }

    packageStats(packageId) {

        return this.state.packageStatistics[packageId] || {

            totalDepartures: 0,

            publishedDepartures: 0,

            draftDepartures: 0,

            upcomingDepartures: 0,

            confirmedGuests: 0,

            upcomingCapacity: 0,

            upcomingReserved: 0,

            upcomingAvailable: 0,

            nextDeparture: false,

            nextDepartureTimestamp: null,

        };

    }

    displayStatistic(value) {

        if (!this.state.scheduleStatsAvailable) {

            return "—";

        }

        return value;

    }

    // =====================================================
    // 11. GLOBAL WORKSPACE KPI STATISTICS
    // =====================================================

    get statistics() {

        const result = {

            totalPackages: this.state.packages.length,

            totalDepartures: 0,

            upcomingDepartures: 0,

            confirmedGuests: 0,

        };

        for (const item of this.state.packages) {

            const stats = this.packageStats(item.id);

            result.totalDepartures +=

                stats.totalDepartures;

            result.upcomingDepartures +=

                stats.upcomingDepartures;

            result.confirmedGuests +=

                stats.confirmedGuests;

        }

        return result;

    }

    get averagePriceLabel() {

        const packages = this.state.packages;

        if (!packages.length) {

            return "—";

        }

        const currencies = new Set(

            packages.map(

                (item) =>

                    this.relationId(item.currency_id)

            )

        );

        if (currencies.size > 1) {

            return "Multiple currencies";

        }

        if (currencies.has(false)) {

            return "—";

        }

        const total = packages.reduce(

            (sum, item) =>

                sum + (Number(item.price_per_guest) || 0),

            0

        );

        return this.formatMoney(

            total / packages.length,

            this.currencyCode(packages[0])

        );

    }

    get packagesWithUpcomingDepartures() {

        if (!this.state.scheduleStatsAvailable) {

            return "—";

        }

        return this.state.packages.filter(

            (item) =>

                this.packageStats(item.id)

                    .upcomingDepartures > 0

        ).length;

    }

    // =====================================================
    // 12. COMPANY FILTER OPTIONS
    // =====================================================

    get companyOptions() {

        const companies = new Map();

        for (const item of this.state.packages) {

            const id = this.relationId(

                item.company_id

            );

            if (id) {

                companies.set(

                    id,

                    this.companyName(item)

                );

            }

        }

        return Array.from(

            companies,

            ([id, name]) => ({

                id,

                name,

            })

        ).sort(

            (a, b) => a.name.localeCompare(b.name)

        );

    }

    // =====================================================
    // 13. SEARCH, FILTERING AND SORTING
    // =====================================================

    get filteredPackages() {

        const search = this.state.search

            .trim()

            .toLowerCase();

        const companyFilter = this.state.companyFilter;

        const departureFilter = this.state.departureFilter;

        const sortBy = this.state.sortBy;

        const result = this.state.packages.filter(

            (item) => {

                const searchableText = [

                    item.name || "",

                    item.description || "",

                    this.companyName(item),

                ].join(" ").toLowerCase();

                if (

                    search &&

                    !searchableText.includes(search)

                ) {

                    return false;

                }

                if (

                    companyFilter !== "all" &&

                    String(

                        this.relationId(item.company_id)

                    ) !== companyFilter

                ) {

                    return false;

                }

                if (this.state.scheduleStatsAvailable) {

                    const stats = this.packageStats(

                        item.id

                    );

                    if (

                        departureFilter === "upcoming" &&

                        !stats.upcomingDepartures

                    ) {

                        return false;

                    }

                    if (

                        departureFilter === "no_upcoming" &&

                        stats.upcomingDepartures

                    ) {

                        return false;

                    }

                }

                return true;

            }

        );

        result.sort((a, b) => {

            const nameOrder =

                (a.name || "").localeCompare(

                    b.name || ""

                );

            switch (sortBy) {

                case "name_desc":

                    return -nameOrder;

                case "price_asc":

                    return this.comparePrices(

                        a,

                        b,

                        1

                    ) || nameOrder;

                case "price_desc":

                    return this.comparePrices(

                        a,

                        b,

                        -1

                    ) || nameOrder;

                case "departures_desc":

                    return (

                        this.packageStats(b.id)

                            .upcomingDepartures -

                        this.packageStats(a.id)

                            .upcomingDepartures

                    ) || nameOrder;

                case "guests_desc":

                    return (

                        this.packageStats(b.id)

                            .confirmedGuests -

                        this.packageStats(a.id)

                            .confirmedGuests

                    ) || nameOrder;

                default:

                    return nameOrder;

            }

        });

        return result;

    }

    comparePrices(a, b, direction) {

        const currencyA = this.relationId(

            a.currency_id

        );

        const currencyB = this.relationId(

            b.currency_id

        );

        if (currencyA !== currencyB) {

            return (

                this.currencyCode(a).localeCompare(

                    this.currencyCode(b)

                ) ||

                (currencyA || 0) - (currencyB || 0)

            );

        }

        return direction * (

            (Number(a.price_per_guest) || 0) -

            (Number(b.price_per_guest) || 0)

        );

    }

    onSearchChange(event) {

        this.state.search = event.target.value;

    }

    onCompanyChange(event) {

        this.state.companyFilter = event.target.value;

    }

    onDepartureChange(event) {

        this.state.departureFilter = event.target.value;

    }

    onSortChange(event) {

        this.state.sortBy = event.target.value;

    }

    resetFilters() {

        this.state.search = "";

        this.state.companyFilter = "all";

        this.state.departureFilter = "all";

        this.state.sortBy = "name_asc";

    }

    get hasActiveFilters() {

        return Boolean(

            this.state.search ||

            this.state.companyFilter !== "all" ||

            this.state.departureFilter !== "all" ||

            this.state.sortBy !== "name_asc"

        );

    }

    // =====================================================
    // 14. PACKAGE ARTWORK AND DESCRIPTION
    // =====================================================

    packageArtwork(item) {

        const name = (item.name || "").toLowerCase();

        if (

            name.includes("evening") ||

            name.includes("sunset")

        ) {

            return {

                theme: "orange",

                icon: "fa-sun-o",

            };

        }

        if (

            name.includes("desert") ||

            name.includes("safari")

        ) {

            return {

                theme: "gold",

                icon: "fa-sun-o",

            };

        }

        if (name.includes("city")) {

            return {

                theme: "blue",

                icon: "fa-building",

            };

        }

        if (

            name.includes("heritage") ||

            name.includes("museum") ||

            name.includes("culture")

        ) {

            return {

                theme: "teal",

                icon: "fa-university",

            };

        }

        if (

            name.includes("boat") ||

            name.includes("cruise") ||

            name.includes("marine")

        ) {

            return {

                theme: "blue",

                icon: "fa-ship",

            };

        }

        if (

            name.includes("mountain") ||

            name.includes("hiking") ||

            name.includes("adventure")

        ) {

            return {

                theme: "green",

                icon: "fa-compass",

            };

        }

        return PACKAGE_ARTWORK[

            item.id % PACKAGE_ARTWORK.length

        ];

    }

    shortDescription(item) {

        const description = String(

            item.description || ""

        ).trim();

        if (!description) {

            return "No description has been added yet.";

        }

        if (description.length <= 145) {

            return description;

        }

        return description.slice(0, 142).trimEnd()

            + "...";

    }

    fullDescription(item) {

        return String(

            item.description || ""

        ).trim()

            || "No description has been added yet.";

    }

    // =====================================================
    // 15. PACKAGE SELECTION
    // =====================================================

    selectPackage(packageId) {

        this.state.selectedPackageId = packageId;

    }

    get selectedPackage() {

        const packages = this.filteredPackages;

        return packages.find(

            (item) =>

                item.id === this.state.selectedPackageId

        ) || packages[0] || false;

    }

    isSelected(packageId) {

        return this.selectedPackage?.id === packageId;

    }

    get selectedPackageStats() {

        if (!this.selectedPackage) {

            return this.packageStats(false);

        }

        return this.packageStats(

            this.selectedPackage.id

        );

    }

    get selectedDepartures() {

        const item = this.selectedPackage;

        if (!item) {

            return [];

        }

        return this.state.schedules.filter(

            (schedule) =>

                this.relationId(schedule.package_id)

                === item.id

        );

    }

    get selectedUpcomingDepartures() {

        const now = DateTime.now().toMillis();

        return this.selectedDepartures.filter(

            (schedule) => {

                const start = this.dateTimestamp(

                    schedule.start_datetime

                );

                return (

                    schedule.state === "published" &&

                    start !== null &&

                    start >= now

                );

            }

        );

    }

    departureStateLabel(schedule) {

        if (schedule.state === "published") {

            return "Published";

        }

        if (schedule.state === "draft") {

            return "Draft";

        }

        return schedule.state || "Unknown";

    }

    capacityPercentage(schedule) {

        const capacity = Number(schedule.capacity) || 0;

        const reserved =

            Number(schedule.reserved_guests) || 0;

        if (capacity <= 0) {

            return 0;

        }

        return Math.max(

            0,

            Math.min(

                100,

                Math.round(reserved / capacity * 100)

            )

        );

    }

    get selectedUtilization() {

        if (!this.state.scheduleStatsAvailable) {

            return 0;

        }

        const stats = this.selectedPackageStats;

        if (!stats.upcomingCapacity) {

            return 0;

        }

        return Math.max(

            0,

            Math.min(

                100,

                Math.round(

                    stats.upcomingReserved /

                    stats.upcomingCapacity *

                    100

                )

            )

        );

    }

    // =====================================================
    // 16. CREATE AND EDIT TOUR PACKAGES
    // =====================================================

    openNewPackage() {

        return this.openPackageForm(false);

    }

    editPackage(packageId) {

        return this.openPackageForm(packageId);

    }

    async openPackageForm(packageId) {

        if (!this.state.canAccessDashboard) {
    return;
}

        const action = {

            type: "ir.actions.act_window",

            name: packageId

                ? "Edit Tour Package"

                : "Create Tour Package",

            res_model: PACKAGE_MODEL,

            views: [

                [false, "form"],

            ],

            view_mode: "form",

            target: "new",

        };

        if (packageId) {

            action.res_id = packageId;

        }

        return this.action.doAction(

            action,

            {

                onClose: () => this.loadPackages(),

            }

        );

    }

    // =====================================================
    // 17. NATIVE ODOO RECORD MANAGEMENT
    // =====================================================

    openManagePackages() {

        return this.action.doAction(

            "tour_operator_booking.action_packages"

        );

    }

    openDeparture(scheduleId) {

        if (!this.state.canAccessOperations) {

            return;

        }

        return this.action.doAction({

            type: "ir.actions.act_window",

            name: "Tour Departure",

            res_model: SCHEDULE_MODEL,

            res_id: scheduleId,

            views: [

                [false, "form"],

            ],

            view_mode: "form",

            target: "new",

        }, {

            onClose: () => this.loadPackages(),

        });

    }

    openPackageDepartures(packageId) {

        if (!this.state.canAccessOperations) {

            return;

        }

        return this.action.doAction({

            type: "ir.actions.act_window",

            name: "Package Departures",

            res_model: SCHEDULE_MODEL,

            views: [

                [false, "list"],

                [false, "form"],

            ],

            view_mode: "list,form",

            domain: [

                ["package_id", "=", packageId],

            ],

            context: {

                default_package_id: packageId,

            },

            target: "current",

        });

    }

    // =====================================================
    // 18. NEXUS SIDEBAR NAVIGATION
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

    openReports() {

        return this.action.doAction(

            "tour_operator_booking.action_booking_reports_dashboard"

        );

    }

}

// =========================================================
// 19. REGISTER THE OWL CLIENT ACTION
// =========================================================

registry.category("actions").add(

    "tour_operator_booking.tour_packages",

    TourPackages

);