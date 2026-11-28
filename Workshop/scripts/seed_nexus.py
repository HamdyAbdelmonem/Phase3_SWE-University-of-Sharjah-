# =========================================================
# NEXUS - TOUR OPERATOR BOOKING SUITE
# Automated Demonstration Dataset Generator
# =========================================================

from datetime import datetime, timedelta, time, timezone
from collections import Counter
import random

rng = random.Random(42)

DATABASE = "tour_booking_suite"

UAE = timezone(timedelta(hours=4))

# =========================================================
# TOUR PACKAGE CATALOG
# =========================================================

PACKAGE_DATA = [
    (
        "Morning Desert Safari",
        250,
        "Dune bashing, camel riding and sandboarding."
    ),
    (
        "Evening Desert Safari",
        320,
        "Sunset dunes, camel riding, BBQ dinner and entertainment."
    ),
    (
        "Dubai City Tour",
        180,
        "Explore Dubai landmarks, traditional souks and modern attractions."
    ),
    (
        "Abu Dhabi Heritage Tour",
        150,
        "Discover cultural landmarks and Emirati heritage."
    ),
    (
        "Sharjah Cultural Tour",
        95,
        "Explore museums, heritage districts and traditional markets."
    ),
    (
        "Dubai Marina Dhow Cruise",
        120,
        "Traditional dhow cruise with waterfront views."
    ),
    (
        "Hatta Mountain Adventure",
        210,
        "Mountain scenery, kayaking and outdoor exploration."
    ),
    (
        "Jebel Jais Adventure",
        280,
        "Scenic mountain roads and adventure experiences."
    ),
    (
        "Fujairah Snorkeling Experience",
        190,
        "Discover marine life and the eastern coastline."
    ),
    (
        "Dubai Luxury Yacht Tour",
        450,
        "Premium yacht experience along the Dubai coastline."
    ),
    (
        "Al Ain Oasis Tour",
        140,
        "Explore gardens, historic forts and traditional oases."
    ),
    (
        "Overnight Desert Camping",
        380,
        "Desert camping, stargazing and traditional hospitality."
    ),
]

DRIVER_NAMES = [
    "Ahmed Hassan",
    "Omar Khalid",
    "Mohammed Ali",
    "Youssef Ibrahim",
    "Khaled Mahmoud",
    "Abdullah Salem",
    "Hassan Nasser",
    "Bilal Ahmed",
    "Mustafa Hamid",
    "Tariq Mansour",
]

VEHICLE_NAMES = [
    "Toyota Land Cruiser - 01",
    "Toyota Land Cruiser - 02",
    "Toyota Land Cruiser - 03",
    "Nissan Patrol - 01",
    "Nissan Patrol - 02",
    "Nissan Patrol - 03",
    "Toyota Hiace - 01",
    "Toyota Hiace - 02",
    "Mercedes Sprinter - 01",
    "Mercedes Sprinter - 02",
    "Coaster Tour Bus - 01",
    "Coaster Tour Bus - 02",
]

FIRST_NAMES = [
    "Adam",
    "Sarah",
    "Omar",
    "Mariam",
    "Daniel",
    "Layla",
    "James",
    "Noor",
    "Sofia",
    "Youssef",
]

LAST_NAMES = [
    "Hassan",
    "Morgan",
    "Khalid",
    "Wilson",
    "Rahman",
    "Martin",
]

CITIES = [
    "Dubai",
    "Sharjah",
    "Abu Dhabi",
    "Ajman",
    "Al Ain",
    "Ras Al Khaimah",
    "Fujairah",
]

CANCELLATION_REASONS = [
    "Demo: Customer requested a different travel date.",
    "Demo: Change in travel plans.",
    "Demo: Customer unavailable on departure date.",
    "Demo: Personal scheduling conflict.",
    "Demo: Customer requested cancellation.",
]


# =========================================================
# DATASET GENERATION
# =========================================================

def generate_dataset():

    print("\n" + "=" * 60)
    print("NEXUS AUTOMATED DATASET GENERATOR")
    print("=" * 60)

    # -----------------------------------------------------
    # 01. SAFETY AND PERMISSIONS
    # -----------------------------------------------------

    if env.cr.dbname != DATABASE:
        raise RuntimeError(
            "Incorrect database. Generation stopped."
        )

    admin = env.ref("base.user_admin")

    company = admin.company_id

    Package = (
        env["tour.operator.package"]
        .with_user(admin)
        .with_company(company)
        .with_context(allowed_company_ids=[company.id])
    )

    work_env = Package.env

    for group in [
        "group_tour_manager",
        "group_booking_staff",
        "group_operations_staff",
    ]:
        if not work_env.user.has_group(
            "tour_operator_booking." + group
        ):
            raise RuntimeError(
                "Administrator is missing group: " + group
            )

    Schedule = work_env["tour.operator.schedule"]
    Resource = work_env["tour.operator.resource"]
    Booking = work_env["tour.operator.booking"]
    Partner = work_env["res.partner"]

    Parameters = env["ir.config_parameter"].sudo()

    marker = "nexus.demo.dataset.v1.company.%s" % company.id

    if Parameters.get_param(marker):
        raise RuntimeError(
            "Nexus demo dataset already generated. "
            "Duplicate generation prevented."
        )

    if company.currency_id.name != "USD":
        raise RuntimeError(
            "Expected USD company currency. "
            "Review the demo prices before continuing."
        )

    company_domain = [
        ("company_id", "=", company.id)
    ]

    print("Database:", env.cr.dbname)
    print("Company:", company.name)
    print("Currency:", company.currency_id.name)
    print("Executing user:", work_env.user.name)

    # -----------------------------------------------------
    # 02. CREATE OR REUSE TOUR PACKAGES
    # -----------------------------------------------------

    print("\n[1/6] Preparing tour packages...")

    packages = []
    created_packages = 0
    reused_packages = 0

    for name, price, description in PACKAGE_DATA:

        existing = Package.search(
            company_domain + [("name", "=", name)],
            limit=2,
        )

        if len(existing) > 1:
            raise RuntimeError(
                "Duplicate existing package: " + name
            )

        if existing:
            package = existing
            reused_packages += 1
            print("  Reused:", name)

        else:
            package = Package.create({
                "name": name,
                "description": description,
                "price_per_guest": price,
                "company_id": company.id,
            })

            created_packages += 1
            print("  Created:", name)

        packages.append(package)

    # -----------------------------------------------------
    # 03. CREATE DRIVERS
    # -----------------------------------------------------

    print("\n[2/6] Creating drivers...")

    drivers = []

    for name in DRIVER_NAMES:

        demo_name = name + " (Demo)"

        if Resource.search_count(
            company_domain + [
                ("name", "=", demo_name),
                ("kind", "=", "driver"),
            ]
        ):
            raise RuntimeError(
                "Demo driver already exists: " + demo_name
            )

        driver = Resource.create({
            "name": demo_name,
            "kind": "driver",
            "company_id": company.id,
        })

        drivers.append(driver)

        print("  Created:", driver.name)

    # -----------------------------------------------------
    # 04. CREATE VEHICLES
    # -----------------------------------------------------

    print("\n[3/6] Creating vehicles...")

    vehicles = []

    for name in VEHICLE_NAMES:

        demo_name = name + " (Demo)"

        if Resource.search_count(
            company_domain + [
                ("name", "=", demo_name),
                ("kind", "=", "vehicle"),
            ]
        ):
            raise RuntimeError(
                "Demo vehicle already exists: " + demo_name
            )

        vehicle = Resource.create({
            "name": demo_name,
            "kind": "vehicle",
            "company_id": company.id,
        })

        vehicles.append(vehicle)

        print("  Created:", vehicle.name)

    # -----------------------------------------------------
    # 05. CREATE FICTIONAL CUSTOMERS
    # -----------------------------------------------------

    print("\n[4/6] Creating fictional customers...")

    customers = []

    customer_number = 0

    for first_name in FIRST_NAMES:

        for last_name in LAST_NAMES:

            customer_number += 1

            name = first_name + " " + last_name

            email = (
                "nexus.demo.%03d@example.invalid"
                % customer_number
            )

            if Partner.with_context(
                active_test=False
            ).search_count([
                ("email", "=", email)
            ]):
                raise RuntimeError(
                    "Demo customer already exists: " + email
                )

            customer = Partner.create({
                "name": name,
                "email": email,
                "city": rng.choice(CITIES),
                "company_id": company.id,
                "ref": "NEXUS-DEMO-%03d" % customer_number,
                "is_company": False,
            })

            customers.append(customer)

    print("  Customers created:", len(customers))

    # -----------------------------------------------------
    # 06. CREATE TOUR DEPARTURES
    # -----------------------------------------------------

    print("\n[5/6] Creating tour departures...")

    now_local = datetime.now(UAE)
    today = now_local.date()

    departures = []
    future_departures = []

    def create_departure(
        package,
        day_offset,
        hour,
        capacity,
        state,
        index,
        assigned=True,
    ):

        local_date = today + timedelta(days=day_offset)

        local_start = datetime.combine(
            local_date,
            time(hour, 0),
            tzinfo=UAE,
        )

        local_end = local_start + timedelta(hours=4)

        start_utc = local_start.astimezone(
            timezone.utc
        ).replace(tzinfo=None)

        end_utc = local_end.astimezone(
            timezone.utc
        ).replace(tzinfo=None)

        name = "%s - %s %s (Demo)" % (
            package.name,
            local_start.strftime("%d %b"),
            local_start.strftime("%H:%M"),
        )

        if Schedule.search_count(
            company_domain + [("name", "=", name)]
        ):
            raise RuntimeError(
                "Demo departure already exists: " + name
            )

        values = {
            "name": name,
            "package_id": package.id,
            "company_id": company.id,
            "start_datetime": start_utc,
            "end_datetime": end_utc,
            "capacity": capacity,
            "state": state,
        }

        if assigned:
            values["driver_id"] = drivers[
                index % len(drivers)
            ].id

            values["vehicle_id"] = vehicles[
                index % len(vehicles)
            ].id

        departure = Schedule.create(values)

        departures.append(departure)

        return departure

    # Four historical published departures.
    # No new bookings are attached to these.

    for index, offset in enumerate([-10, -7, -4, -2]):

        create_departure(
            package=packages[index],
            day_offset=offset,
            hour=9,
            capacity=20,
            state="published",
            index=index,
        )

    # Thirty-two future published departures.

    for index in range(32):

        package = packages[index % len(packages)]

        day_offset = 1 + index // 2

        hour = 9 if index % 2 == 0 else 15

        # Include a departure today when enough time remains.

        if index == 2 and now_local.hour < 17:
            day_offset = 0
            hour = 18

        if index == 0:
            capacity = 6

        elif index == 1:
            capacity = 8

        else:
            capacity = rng.choice([14, 16, 20, 24, 30])

        departure = create_departure(
            package=package,
            day_offset=day_offset,
            hour=hour,
            capacity=capacity,
            state="published",
            index=index + 4,
            assigned=index < 29,
        )

        future_departures.append(departure)

    # Four draft departures.

    for index in range(4):

        create_departure(
            package=packages[(index + 5) % len(packages)],
            day_offset=20 + index * 2,
            hour=10,
            capacity=20,
            state="draft",
            index=index + 36,
            assigned=False,
        )

    print("  Total new departures:", len(departures))
    print("  Historical published: 4")
    print("  Future published: 32")
    print("  Draft departures: 4")

    # -----------------------------------------------------
    # 07. CREATE BOOKINGS THROUGH BUSINESS ACTIONS
    # -----------------------------------------------------

    print("\n[6/6] Creating bookings...")

    bookings = []

    def make_booking(departure, guests, status):

        customer = customers[
            len(bookings) % len(customers)
        ]

        source = rng.choices(
            ["direct", "ota"],
            weights=[65, 35],
            k=1,
        )[0]

        booking = Booking.create({
            "customer_id": customer.id,
            "package_id": departure.package_id.id,
            "schedule_id": departure.id,
            "company_id": company.id,
            "number_of_guests": guests,
            "booking_source": source,
        })

        if status in ("confirmed", "cancelled"):

            # Use the actual backend confirmation workflow.
            booking.action_confirm()

        if status == "cancelled":

            # Use the actual backend cancellation workflow.
            booking.action_cancel(
                rng.choice(CANCELLATION_REASONS)
            )

        bookings.append(booking)

        return booking

    # Create two fully booked departures.

    for guests in [2, 2, 2]:

        make_booking(
            future_departures[0],
            guests,
            "confirmed",
        )

    for guests in [2, 3, 3]:

        make_booking(
            future_departures[1],
            guests,
            "confirmed",
        )

    # Twenty-seven regular departures.
    # Last three remain empty for demonstration.

    regular_departures = future_departures[2:29]

    # Sixty-four additional confirmed bookings.

    for index in range(64):

        departure = regular_departures[
            index % len(regular_departures)
        ]

        guests = rng.randint(1, 4)

        make_booking(
            departure,
            guests,
            "confirmed",
        )

    print("  Confirmed bookings created: 70")

    # Ten cancelled bookings.
    # Confirmation and cancellation return the reserved seats.

    for index in range(10):

        available = [
            departure
            for departure in regular_departures
            if departure.available_seats > 0
        ]

        if not available:
            raise RuntimeError(
                "No departures available for cancellation demo."
            )

        departure = rng.choice(available)

        guests = rng.randint(
            1,
            min(3, departure.available_seats),
        )

        make_booking(
            departure,
            guests,
            "cancelled",
        )

    print("  Cancelled bookings created: 10")

    # Twenty draft bookings.

    for index in range(20):

        available = [
            departure
            for departure in regular_departures
            if departure.available_seats > 0
        ]

        if not available:
            raise RuntimeError(
                "No departures available for draft demo."
            )

        departure = rng.choice(available)

        guests = rng.randint(
            1,
            min(4, departure.available_seats),
        )

        make_booking(
            departure,
            guests,
            "draft",
        )

    print("  Draft bookings created: 20")

    # -----------------------------------------------------
    # 08. VALIDATE GENERATED RECORDS
    # -----------------------------------------------------

    work_env.flush_all()

    work_env.invalidate_all()

    status_counts = Counter(
        booking.state for booking in bookings
    )

    source_counts = Counter(
        booking.booking_source for booking in bookings
    )

    confirmed_guests = sum(
        booking.number_of_guests
        for booking in bookings
        if booking.state == "confirmed"
    )

    confirmed_value = sum(
        booking.total_price
        for booking in bookings
        if booking.state == "confirmed"
    )

    overbooked = [
        departure
        for departure in departures
        if departure.reserved_guests > departure.capacity
    ]

    fully_booked = [
        departure
        for departure in future_departures
        if departure.available_seats == 0
    ]

    if len(packages) != 12:
        raise RuntimeError("Package count mismatch.")

    if len(departures) != 40:
        raise RuntimeError("Departure count mismatch.")

    if len(customers) != 60:
        raise RuntimeError("Customer count mismatch.")

    if len(drivers) != 10:
        raise RuntimeError("Driver count mismatch.")

    if len(vehicles) != 12:
        raise RuntimeError("Vehicle count mismatch.")

    if len(bookings) != 100:
        raise RuntimeError("Booking count mismatch.")

    if status_counts != Counter({
        "confirmed": 70,
        "draft": 20,
        "cancelled": 10,
    }):
        raise RuntimeError("Booking state mismatch.")

    if overbooked:
        raise RuntimeError("Overbooking detected.")

    if len(fully_booked) < 2:
        raise RuntimeError("Fully booked demo tours missing.")

    # Prevent accidental repeated generation.

    Parameters.set_param(marker, "completed")

    # -----------------------------------------------------
    # 09. PRINT DATASET SUMMARY
    # -----------------------------------------------------

    print("\n" + "=" * 60)
    print("NEXUS DATASET VALIDATION PASSED")
    print("=" * 60)

    print("Packages created:     ", created_packages)
    print("Packages reused:      ", reused_packages)
    print("Package catalog:      ", len(packages))
    print("New departures:       ", len(departures))
    print("New customers:        ", len(customers))
    print("New drivers:          ", len(drivers))
    print("New vehicles:         ", len(vehicles))
    print("New bookings:         ", len(bookings))

    print("\nBOOKING DISTRIBUTION")

    print("Confirmed:            ", status_counts["confirmed"])
    print("Draft:                ", status_counts["draft"])
    print("Cancelled:            ", status_counts["cancelled"])

    print("\nBOOKING CHANNELS")

    print("Direct:               ", source_counts["direct"])
    print("OTA:                  ", source_counts["ota"])

    print("\nPERFORMANCE")

    print("Confirmed guests:     ", confirmed_guests)
    print("Confirmed value:       USD %.2f" % confirmed_value)
    print("Fully booked tours:   ", len(fully_booked))
    print("Overbooked tours:     ", len(overbooked))

    print("=" * 60)

    # -----------------------------------------------------
    # 10. REQUIRE CONFIRMATION BEFORE SAVING
    # -----------------------------------------------------

    answer = input(
        "\nType COMMIT to save the dataset, "
        "or anything else to roll back: "
    ).strip()

    if answer == "COMMIT":

        env.cr.commit()

        print("\n" + "=" * 60)
        print("NEXUS DATASET SAVED SUCCESSFULLY")
        print("=" * 60)

    else:

        env.cr.rollback()

        print("\nGeneration rolled back. Dataset not saved.")


# =========================================================
# EXECUTION AND ROLLBACK PROTECTION
# =========================================================

try:

    generate_dataset()

except BaseException:

    env.cr.rollback()

    print("\n" + "=" * 60)
    print("DATASET GENERATION STOPPED")
    print("Uncommitted database changes rolled back.")
    print("=" * 60)

    raise