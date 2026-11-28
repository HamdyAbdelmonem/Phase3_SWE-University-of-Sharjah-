/** @odoo-module **/

import { Component, onWillStart, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import {
    deserializeDateTime,
    serializeDateTime,
} from "@web/core/l10n/dates";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";

const { DateTime } = luxon;

const BOOKING_MODEL = "tour.operator.booking";
const PACKAGE_MODEL = "tour.operator.package";
const SCHEDULE_MODEL = "tour.operator.schedule";

const SCHEDULE_FIELDS = [
    "id",
    "name",
    "package_id",
    "start_datetime",
    "end_datetime",
    "capacity",
    "reserved_guests",
    "available_seats",
    "state",
    "driver_id",
    "vehicle_id",
];

const BOOKING_FIELDS = [
    "id",
    "name",
    "customer_id",
    "package_id",
    "schedule_id",
    "number_of_guests",
    "booking_source",
    "unit_price",
    "total_price",
    "state",
    "confirmed_at",
];

export class CreateBooking extends Component {

    static template = "tour_operator_booking.CreateBooking";

    // =====================================================
    // COMPONENT INITIALIZATION
    // =====================================================

    setup() {

        this.orm = useService("orm");
        this.action = useService("action");
        this.notification = useService("notification");
        this.dialog = useService("dialog");

        this.customerSearchVersion = 0;

        this.state = useState({

            loading: true,
            busy: false,
            error: "",

            companyId: false,
            companyName: "",
            currencyCode: "",

            customers: [],
            packages: [],
            schedules: [],

            customerQuery: "",
            customerSearching: false,
            customer: null,

            showNewCustomer: false,

            newCustomer: {
                name: "",
                email: "",
                phone: "",
            },

            packageId: "",
            scheduleId: "",
            guests: 1,
            source: "direct",

            draft: null,

            availabilityChecked: false,
            availabilityMessage: "",

        });

        onWillStart(() => this.initialize());
    }

    // =====================================================
    // INITIAL DATA LOADING
    // =====================================================

    async initialize() {

        this.state.loading = true;
        this.state.error = "";

        try {

            const defaults = await this.orm.call(
                BOOKING_MODEL,
                "default_get",
                [["company_id"]]
            );

            this.state.companyId = defaults.company_id;

            if (!this.state.companyId) {
                throw new Error("No active booking company was found.");
            }

            const companies = await this.orm.read(
                "res.company",
                [this.state.companyId],
                ["name", "currency_id"]
            );

            const company = companies[0];

            if (!company) {
                throw new Error("Unable to load the active company.");
            }

            this.state.companyName = company.name;

            if (company.currency_id) {

                const currencies = await this.orm.read(
                    "res.currency",
                    [company.currency_id[0]],
                    ["name"]
                );

                this.state.currencyCode =
                    currencies[0]?.name || "";
            }

            await Promise.all([
                this.loadPackages(),
                this.searchCustomers(),
            ]);

        } catch (error) {

            this.handleError(error);

        } finally {

            this.state.loading = false;
        }
    }

    // =====================================================
    // CUSTOMER MANAGEMENT
    // =====================================================

    async searchCustomers() {

        const requestVersion = ++this.customerSearchVersion;

        this.state.customerSearching = true;

        try {

            const query = this.state.customerQuery.trim();

            const domain = [
                ["name", "!=", false],
                "|",
                ["company_id", "=", false],
                ["company_id", "=", this.state.companyId],
            ];

            if (query) {

                domain.push(
                    "|",
                    "|",
                    ["name", "ilike", query],
                    ["email", "ilike", query],
                    ["phone", "ilike", query]
                );
            }

            const customers = await this.orm.searchRead(
                "res.partner",
                domain,
                ["id", "name", "email", "phone"],
                {
                    limit: 30,
                    order: "name asc, id asc",
                }
            );

            if (requestVersion === this.customerSearchVersion) {
                this.state.customers = customers;
            }

        } catch (error) {

            if (requestVersion === this.customerSearchVersion) {
                this.handleError(error);
            }

        } finally {

            if (requestVersion === this.customerSearchVersion) {
                this.state.customerSearching = false;
            }
        }
    }

    onCustomerSearch(event) {

        this.state.customerQuery = event.target.value;

        return this.searchCustomers();
    }

    selectCustomer(customer) {

        if (this.isLocked || this.state.busy) {
            return;
        }

        this.state.customer = customer;
        this.state.customerQuery = customer.name;
        this.state.customers = [];

        this.customerSearchVersion++;
        this.state.customerSearching = false;

        this.invalidateAvailability();
    }

    clearCustomer() {

        if (this.isLocked || this.state.busy) {
            return;
        }

        this.state.customer = null;
        this.state.customerQuery = "";

        this.invalidateAvailability();

        return this.searchCustomers();
    }

    toggleNewCustomer() {

        if (this.isLocked || this.state.busy) {
            return;
        }

        this.state.showNewCustomer =
            !this.state.showNewCustomer;

        this.state.newCustomer = {
            name: "",
            email: "",
            phone: "",
        };
    }

    async createCustomer() {

        if (this.state.busy || this.isLocked) {
            return;
        }

        const name = this.state.newCustomer.name.trim();

        if (!name) {

            this.notify(
                "Please enter the customer's name.",
                "warning"
            );

            return;
        }

        this.state.busy = true;
        this.state.error = "";

        try {

            const ids = await this.orm.create(
                "res.partner",
                [{
                    name: name,
                    email: this.state.newCustomer.email.trim(),
                    phone: this.state.newCustomer.phone.trim(),
                    company_id: this.state.companyId,
                    is_company: false,
                }]
            );

            const records = await this.orm.read(
                "res.partner",
                ids,
                ["id", "name", "email", "phone"]
            );

            if (!records.length) {
                throw new Error(
                    "Customer created, but the record could not be loaded."
                );
            }

            this.state.customer = records[0];
            this.state.customerQuery = records[0].name;
            this.state.customers = [];
            this.state.showNewCustomer = false;

            this.customerSearchVersion++;
            this.state.customerSearching = false;

            this.state.newCustomer = {
                name: "",
                email: "",
                phone: "",
            };

            this.invalidateAvailability();

            this.notify(
                "Customer created successfully.",
                "success"
            );

        } catch (error) {

            this.handleError(error);

        } finally {

            this.state.busy = false;
        }
    }

    // =====================================================
    // TOUR PACKAGES
    // =====================================================

    async loadPackages() {

        this.state.packages = await this.orm.searchRead(
            PACKAGE_MODEL,
            [
                ["company_id", "=", this.state.companyId],
            ],
            [
                "id",
                "name",
                "description",
                "price_per_guest",
                "currency_id",
            ],
            {
                order: "name asc",
            }
        );
    }

    get selectedPackage() {

        return this.state.packages.find(
            pkg => pkg.id === Number(this.state.packageId)
        ) || null;
    }

    async onPackageChange(event) {

        if (this.state.busy || this.isLocked) {
            return;
        }

        this.state.packageId = event.target.value;
        this.state.scheduleId = "";
        this.state.schedules = [];

        this.invalidateAvailability();

        this.state.busy = true;
        this.state.error = "";

        try {

            await this.loadSchedules();

        } catch (error) {

            this.handleError(error);

        } finally {

            this.state.busy = false;
        }
    }

    // =====================================================
    // TOUR DEPARTURES
    // =====================================================

    async loadSchedules() {

        if (!this.state.packageId) {

            this.state.schedules = [];
            return;
        }

        const now = serializeDateTime(DateTime.now());

        this.state.schedules = await this.orm.searchRead(
            SCHEDULE_MODEL,
            [
                ["company_id", "=", this.state.companyId],
                ["package_id", "=", Number(this.state.packageId)],
                ["state", "=", "published"],
                ["start_datetime", ">", now],
            ],
            SCHEDULE_FIELDS,
            {
                order: "start_datetime asc, id asc",
            }
        );
    }

    get selectedSchedule() {

        return this.state.schedules.find(
            schedule => schedule.id === Number(this.state.scheduleId)
        ) || null;
    }

    onScheduleChange(event) {

        if (this.state.busy || this.isLocked) {
            return;
        }

        this.state.scheduleId = event.target.value;

        this.invalidateAvailability();
    }

    get availableSeats() {

        return this.selectedSchedule?.available_seats || 0;
    }

    get reservedGuests() {

        return this.selectedSchedule?.reserved_guests || 0;
    }

    get capacity() {

        return this.selectedSchedule?.capacity || 0;
    }

    get capacityUtilization() {

        if (!this.capacity) {
            return 0;
        }

        return Math.min(
            100,
            Math.max(
                0,
                Math.round(
                    this.reservedGuests / this.capacity * 100
                )
            )
        );
    }

    get remainingAfterBooking() {

        return Math.max(
            0,
            this.availableSeats - this.state.guests
        );
    }

    // =====================================================
    // GUEST COUNTER
    // =====================================================

    increaseGuests() {

        if (this.state.busy || this.isLocked) {
            return;
        }

        this.state.guests =
            Math.max(1, this.state.guests + 1);

        this.invalidateAvailability();
    }

    decreaseGuests() {

        if (this.state.busy || this.isLocked) {
            return;
        }

        this.state.guests =
            Math.max(1, this.state.guests - 1);

        this.invalidateAvailability();
    }

    onGuestChange(event) {

        if (this.state.busy || this.isLocked) {
            return;
        }

        const value = Number(event.target.value);

        this.state.guests =
            Number.isSafeInteger(value) && value > 0
                ? value
                : 0;

        this.invalidateAvailability();
    }

    onSourceChange(event) {

        if (this.state.busy || this.isLocked) {
            return;
        }

        this.state.source = event.target.value;
    }

    // =====================================================
    // LIVE PRICING SUMMARY
    // =====================================================

    get unitPrice() {

        if (!this.selectedSchedule) {

            return this.isLocked
                ? Number(this.state.draft?.unit_price || 0)
                : 0;
        }

        // Preserve the backend's stored quoted price when
        // editing a draft without changing its departure.

        if (
            this.state.draft &&
            this.state.draft.schedule_id?.[0] ===
                this.selectedSchedule.id
        ) {

            return Number(this.state.draft.unit_price || 0);
        }

        return Number(
            this.selectedPackage?.price_per_guest || 0
        );
    }

    get totalPrice() {

        if (this.isLocked) {
            return Number(this.state.draft?.total_price || 0);
        }

        return this.unitPrice * this.state.guests;
    }

    formatMoney(amount) {

        const value = Number(amount || 0);

        if (this.state.currencyCode) {

            try {

                return new Intl.NumberFormat(
                    undefined,
                    {
                        style: "currency",
                        currency: this.state.currencyCode,
                    }
                ).format(value);

            } catch (error) {

                // Fall back to a currency label.
            }
        }

        return `${this.state.currencyCode} ${value.toFixed(2)}`.trim();
    }

    // =====================================================
    // DATE AND TIME FORMATTING
    // =====================================================

    formatDate(value) {

        if (!value) {
            return "—";
        }

        try {

            return deserializeDateTime(value).toLocaleString({
                day: "numeric",
                month: "short",
                year: "numeric",
            });

        } catch (error) {

            return value;
        }
    }

    formatTime(value) {

        if (!value) {
            return "—";
        }

        try {

            return deserializeDateTime(value).toLocaleString({
                hour: "numeric",
                minute: "2-digit",
            });

        } catch (error) {

            return value;
        }
    }

    formatDateTime(value) {

        if (!value) {
            return "—";
        }

        return `${this.formatDate(value)}, ${this.formatTime(value)}`;
    }

    // =====================================================
    // AVAILABILITY ENGINE
    // =====================================================

    invalidateAvailability() {

        this.state.availabilityChecked = false;
        this.state.availabilityMessage = "";
        this.state.error = "";
    }

    get isAvailable() {

        const schedule = this.selectedSchedule;

        if (!schedule) {
            return false;
        }

        const start =
            deserializeDateTime(schedule.start_datetime);

        return (
            schedule.state === "published" &&
            start.isValid &&
            start.toMillis() > DateTime.now().toMillis() &&
            Number.isSafeInteger(this.state.guests) &&
            this.state.guests > 0 &&
            this.state.guests <= this.availableSeats
        );
    }

    get availabilityStatus() {

        if (this.state.draft?.state === "confirmed") {

            return {
                type: "success",
                icon: "fa fa-check-circle",
                title: "Booking Confirmed",
                message: "Your reservation has been confirmed.",
            };
        }

        if (this.state.draft?.state === "cancelled") {

            return {
                type: "danger",
                icon: "fa fa-times-circle",
                title: "Booking Cancelled",
                message: "This reservation is no longer active.",
            };
        }

        if (!this.selectedSchedule) {

            return {
                type: "neutral",
                icon: "fa fa-info-circle",
                title: "Select a Departure",
                message: "Choose a tour and departure to view availability.",
            };
        }

        if (this.isAvailable) {

            return {
                type: "success",
                icon: "fa fa-check-circle",

                title: this.state.availabilityChecked
                    ? "Availability Checked"
                    : "Tour is Available",

                message:
                    `${this.availableSeats} seats currently available. ` +
                    "Seats are reserved only on confirmation.",
            };
        }

        return {
            type: "danger",
            icon: "fa fa-exclamation-circle",
            title: "Departure Unavailable",
            message:
                "Check the departure date and requested guest count.",
        };
    }

    async refreshSelectedDeparture() {

        const selectedId = Number(this.state.scheduleId);

        await Promise.all([
            this.loadPackages(),
            this.loadSchedules(),
        ]);

        const schedule = this.state.schedules.find(
            item => item.id === selectedId
        );

        if (!schedule) {

            this.state.scheduleId = "";

            throw new Error(
                "This departure is no longer available for booking."
            );
        }

        return schedule;
    }

    async checkAvailability() {

        if (this.state.busy || this.isLocked) {
            return;
        }

        if (!this.state.scheduleId) {

            this.notify(
                "Please select a tour departure.",
                "warning"
            );

            return;
        }

        this.state.busy = true;
        this.state.error = "";
        this.state.availabilityChecked = false;
        this.state.availabilityMessage = "";

        try {

            await this.refreshSelectedDeparture();

            this.state.availabilityChecked = true;

            if (this.isAvailable) {

                this.state.availabilityMessage =
                    `${this.availableSeats} seats currently available. ` +
                    `${this.remainingAfterBooking} seats would remain ` +
                    "after confirmation.";

                this.notify(
                    "Availability checked successfully.",
                    "success"
                );

            } else {

                this.state.availabilityMessage =
                    "The requested reservation cannot currently be accommodated.";

                this.notify(
                    this.state.availabilityMessage,
                    "warning"
                );
            }

        } catch (error) {

            this.handleError(error);

        } finally {

            this.state.busy = false;
        }
    }

    // =====================================================
    // BOOKING VALIDATION
    // =====================================================

    get isLocked() {

        return (
            !!this.state.draft &&
            this.state.draft.state !== "draft"
        );
    }

    get canSave() {

        return (
            !this.state.loading &&
            !this.state.busy &&
            !this.isLocked &&
            !!this.state.customer &&
            !!this.selectedPackage &&
            !!this.selectedSchedule &&
            Number.isSafeInteger(this.state.guests) &&
            this.state.guests > 0 &&
            ["direct", "ota"].includes(this.state.source) &&
            this.isAvailable
        );
    }

    validateForm() {

        if (this.isLocked) {

            throw new Error(
                "This booking cannot be modified."
            );
        }

        if (!this.state.customer) {

            throw new Error(
                "Please select a customer."
            );
        }

        if (!this.selectedPackage) {

            throw new Error(
                "Please select a tour package."
            );
        }

        if (!this.selectedSchedule) {

            throw new Error(
                "Please select a tour departure."
            );
        }

        if (
            !Number.isSafeInteger(this.state.guests) ||
            this.state.guests <= 0
        ) {

            throw new Error(
                "Number of guests must be greater than zero."
            );
        }

        if (!["direct", "ota"].includes(this.state.source)) {

            throw new Error(
                "Please select a valid booking source."
            );
        }
    }

    get bookingValues() {

        return {

            customer_id: this.state.customer.id,

            package_id: Number(this.state.packageId),

            schedule_id: Number(this.state.scheduleId),

            number_of_guests: this.state.guests,

            booking_source: this.state.source,

        };
    }

    // =====================================================
    // DRAFT BOOKING MANAGEMENT
    // =====================================================

    async readBooking(bookingId) {

        const records = await this.orm.read(
            BOOKING_MODEL,
            [bookingId],
            BOOKING_FIELDS
        );

        if (!records.length) {

            throw new Error(
                "The booking record could not be loaded."
            );
        }

        this.state.draft = records[0];

        return records[0];
    }

    async persistDraft() {

        this.validateForm();

        const values = this.bookingValues;

        let bookingId;

        if (this.state.draft?.id) {

            bookingId = this.state.draft.id;

            const existing = await this.readBooking(bookingId);

            if (existing.state !== "draft") {

                throw new Error(
                    "Only draft bookings can be modified."
                );
            }

            await this.orm.write(
                BOOKING_MODEL,
                [bookingId],
                values
            );

        } else {

            const ids = await this.orm.create(
                BOOKING_MODEL,
                [{
                    ...values,
                    company_id: this.state.companyId,
                }]
            );

            bookingId = ids[0];

            // Retain the ID before reading the booking.
            // This prevents another draft being created if
            // the subsequent record read fails.

            this.state.draft = {
                id: bookingId,
                state: "draft",
                name: "",
            };
        }

        await this.readBooking(bookingId);

        return bookingId;
    }

    async saveDraft() {

        if (this.state.busy || this.isLocked) {
            return;
        }

        this.state.busy = true;
        this.state.error = "";

        try {

            await this.persistDraft();

            this.notify(
                `Draft ${this.state.draft.name} saved successfully.`,
                "success"
            );

        } catch (error) {

            this.handleError(error);

        } finally {

            this.state.busy = false;
        }
    }

    // =====================================================
    // BOOKING CONFIRMATION
    // =====================================================

    confirmBooking() {

        if (this.state.busy || this.isLocked) {
            return;
        }

        try {

            this.validateForm();

        } catch (error) {

            this.handleError(error);
            return;
        }

        this.dialog.add(
            ConfirmationDialog,
            {

                title: "Confirm Tour Booking",

                body:
                    `Confirm this reservation for ` +
                    `${this.state.guests} guest(s)? ` +
                    "The seats will be reserved and a booking " +
                    "voucher will be generated.",

                confirmLabel: "Confirm Booking",

                cancelLabel: "Go Back",

                confirm: () => this.executeConfirmation(),

            }
        );
    }

    async executeConfirmation() {

        if (this.state.busy || this.isLocked) {
            return;
        }

        this.state.busy = true;
        this.state.error = "";

        let bookingId = false;

        try {

            // Create or update the draft first.

            bookingId = await this.persistDraft();

            // Use the existing Python confirmation action.
            // The backend performs authoritative validation,
            // locks capacity and reserves the seats.

            const reportAction = await this.orm.call(
                BOOKING_MODEL,
                "action_confirm",
                [[bookingId]]
            );

            // Confirmation has succeeded independently
            // of whether the PDF opens successfully.

            this.state.draft.state = "confirmed";

            this.notify(
                `Booking ${this.state.draft.name} confirmed successfully.`,
                "success"
            );

            try {

                await this.readBooking(bookingId);

            } catch (error) {

                console.error(
                    "Unable to refresh confirmed booking.",
                    error
                );
            }

            try {

                await this.loadSchedules();

            } catch (error) {

                console.error(
                    "Unable to refresh departure capacity.",
                    error
                );
            }

            // Open the original Odoo voucher and QR report.

            if (reportAction) {

                try {

                    await this.action.doAction(reportAction);

                } catch (error) {

                    this.notify(
                        "Booking confirmed, but the voucher could not be opened. " +
                        "Use Print Voucher to try again.",
                        "warning"
                    );

                    console.error(error);
                }
            }

        } catch (error) {

            // Reconcile the status before allowing another
            // confirmation attempt.

            if (bookingId || this.state.draft?.id) {

                try {

                    await this.readBooking(
                        bookingId || this.state.draft.id
                    );

                } catch (refreshError) {

                    console.error(refreshError);
                }
            }

            if (this.state.draft?.state === "confirmed") {

                this.notify(
                    "The booking is confirmed. Open its voucher separately.",
                    "warning"
                );

            } else {

                this.handleError(error);
            }

        } finally {

            this.state.busy = false;
        }
    }

    // =====================================================
    // VOUCHER AND BOOKING DETAILS
    // =====================================================

    async printVoucher() {

        if (
            this.state.busy ||
            this.state.draft?.state !== "confirmed"
        ) {
            return;
        }

        this.state.busy = true;

        try {

            const reportAction = await this.orm.call(
                BOOKING_MODEL,
                "action_print_voucher",
                [[this.state.draft.id]]
            );

            if (reportAction) {

                await this.action.doAction(reportAction);
            }

        } catch (error) {

            this.handleError(error);

        } finally {

            this.state.busy = false;
        }
    }

    openBookingDetails() {

        if (!this.state.draft?.id || this.state.busy) {
            return;
        }

        return this.action.doAction({

            type: "ir.actions.act_window",

            name: "Booking Details",

            res_model: BOOKING_MODEL,

            res_id: this.state.draft.id,

            views: [[false, "form"]],

            target: "current",

        });
    }

    // =====================================================
    // RESET BOOKING FORM
    // =====================================================

    startNewBooking() {

        if (this.state.busy) {
            return;
        }

        if (!this.isLocked) {

            this.dialog.add(
                ConfirmationDialog,
                {

                    title: "Start a New Booking",

                    body:
                        "Any unsaved form changes will be discarded. " +
                        "Previously saved bookings will be kept.",

                    confirmLabel: "Start New Booking",

                    confirm: () => this.resetBooking(),

                }
            );

        } else {

            return this.resetBooking();
        }
    }

    async resetBooking() {

        this.state.customer = null;
        this.state.customerQuery = "";
        this.state.customers = [];

        this.state.showNewCustomer = false;

        this.state.newCustomer = {
            name: "",
            email: "",
            phone: "",
        };

        this.state.packageId = "";
        this.state.scheduleId = "";
        this.state.schedules = [];

        this.state.guests = 1;
        this.state.source = "direct";
        this.state.draft = null;

        this.invalidateAvailability();

        await this.searchCustomers();
    }

    // =====================================================
    // NEXUS SIDEBAR NAVIGATION
    // =====================================================

    openDashboard() {

        return this.navigateTo(
            "tour_operator_booking.action_tour_operator_dashboard"
        );
    }

    openBookings() {

        return this.navigateTo(
            "tour_operator_booking.action_bookings"
        );
    }

    openPackages() {

        return this.navigateTo(
            "tour_operator_booking.action_packages"
        );
    }

    openResources() {

        return this.navigateTo(
            "tour_operator_booking.action_resource_management_dashboard"
        );
    }

    openOperations() {

        return this.navigateTo(
            "tour_operator_booking.action_tour_scheduling_dashboard"
        );
    }

    openReports() {

        return this.navigateTo(
            "tour_operator_booking.action_booking_reports_dashboard"
        );
    }

    navigateTo(actionId) {

        if (this.state.busy) {
            return;
        }

        if (
            !this.isLocked &&
            (
                this.state.customer ||
                this.state.packageId ||
                this.state.showNewCustomer
            )
        ) {

            this.dialog.add(
                ConfirmationDialog,
                {

                    title: "Leave Create Booking?",

                    body:
                        "Unsaved changes may be lost. " +
                        "Any previously saved draft will remain in the system.",

                    confirmLabel: "Leave Page",

                    confirm: () => this.action.doAction(actionId),

                }
            );

            return;
        }

        return this.action.doAction(actionId);
    }

    // =====================================================
    // NOTIFICATIONS AND ERROR HANDLING
    // =====================================================

    notify(message, type = "info") {

        this.notification.add(
            message,
            {
                title: "Nexus",
                type: type,
            }
        );
    }

    handleError(error) {

        const message =
            error?.data?.message ||
            error?.message ||
            "An unexpected error occurred.";

        this.state.error = message;

        this.notify(message, "danger");

        console.error("Nexus Create Booking:", error);
    }
}

// =========================================================
// REGISTER NEXUS CREATE BOOKING CLIENT ACTION
// =========================================================

registry.category("actions").add(
    "tour_operator_booking.create_booking",
    CreateBooking
);
