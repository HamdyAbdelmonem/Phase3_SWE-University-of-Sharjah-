# Tour Operator Booking Suite — Odoo 19 scaffold

## Current status

Folder structure and loading skeleton only. The three use cases, models,
permissions, menus, voucher, reports, and tests are NOT implemented.
No Odoo installation or runtime tests have been performed for this scaffold.
The manifest enables installation, but successful installation must be checked
on the team's Odoo 19 server. Installing this skeleton will not create a
functional Tour Operator menu.

## Scope

1. Create Booking — Booking Staff.
2. Schedule Tour — Operations Staff.
3. View Booking Reports — Manager.

This is a local Odoo addon, not a separate website or CRM lead integration.
Customers will reuse Odoo Contacts (`res.partner`).
Do not add dependencies on the practice estate or freelance modules.

## Structure and loading

- `__manifest__.py`: Odoo metadata, dependencies, and ordered data-file list.
- Root `__init__.py`: imports the models and wizard Python packages.
- `models/`: persistent business records and server-side business rules.
- `wizard/`: future temporary date-range form, using models.TransientModel.
- `views/`: future forms, lists, calendar, search, actions, and menus.
- `security/`: role groups and model access permissions.
- `data/`: configuration records such as the booking reference sequence.
- `report/`: future QWeb document templates and report actions.
- `tests/`: reserved test files; no executable cases currently exist.

Python files currently contain only explanatory placeholders. Package imports
are ready, but they register no models yet. XML files are valid empty Odoo
documents. The access CSV contains only its header.

The manifest deliberately has `"data": []`. Add each XML/CSV path as its feature
is implemented. Load groups before access CSV, and actions before menus that
reference them. Never add access rows for model IDs that do not exist.

Git tracks files rather than empty folders, so named placeholder files preserve
the proposed structure. Files beginning with a dot may be hidden in Explorer.
The local .gitignore prevents generated Python caches from being committed.

## Team ownership

| Member | Primary implementation | Testing and documentation |
| --- | --- | --- |
| Hamdy | Foundation, booking backend, booking sequence, integration coordination | Pricing/capacity tests; setup instructions |
| Hassan | Booking views, confirmation interface, voucher and QR | Booking workflow tests; booking manual |
| Abdulrahman | Package and schedule backend; capacity and conflict validation | Schedule backend tests |
| Zayed | Driver/vehicle records; schedule/resource views and calendar | Operations workflow tests; operations manual |
| Ameer | Report wizard; date filtering and aggregation | Report calculation tests |
| Nasser | Report UI and QWeb summary; role configuration | Report workflow tests; assemble test specification |

Hamdy coordinates shared imports, manifest, menus, and access-file changes.
Abdulrahman reviews booking availability/concurrency with Hamdy.
All members provide actual execution evidence and review permissions.

## Proposed shared rules — settle before feature work

- Schedule fields: package, start/end datetime, guest capacity, driver, vehicle,
  and publication status.
- Booking fields: reference, customer, schedule, guest count, saved unit price,
  currency, total, and booking status.
- Confirmed bookings consume capacity; drafts do not.
- Confirmation must recheck availability with concurrency protection.
- Confirmed prices must not change when a package's current price changes.
- Driver/vehicle assignments must not overlap; adjacent intervals are allowed
  initially. Resource capacity and publication rules need server-side checks.
- Reports use departure dates with explicit timezone boundaries.
- Sum of confirmed prices is booking value, not collected payment revenue.
- Voucher and QR belong to confirmation, consistent with Phase 2. QR generation
  alone does not implement a scanner or ticket-validation service.
- No payments, refunds, OTA integration, or cancellation workflow in this scaffold.

## Local setup after pulling

From your EXISTING local repository root:

```powershell
git status
git pull --ff-only origin main
```

If you have uncommitted edits or divergent history, resolve that before pulling;
do not delete files or force-push to make the pull work.

The addon should appear at `Workshop/tour_operator_booking` relative to the
repository root. Odoo's `addons_path` must contain the absolute path to the
parent `Workshop` folder, preserving all existing addon paths.
For the previously shown installation this parent is:
`C:\Program Files\Odoo 19.0.20260714\server\workshop\Workshop`.

Restart the Odoo service/server, enable developer mode, update the Apps list,
and search for "Tour Operator Booking Suite". This is a skeleton only.
Do not run individual model files directly with Python.

## Implementation and evidence

Merge shared models/field agreements first, then scheduling, booking, and reports.
Use feature/create-booking, feature/schedule-tour, and feature/booking-reports.
Coordinate edits to shared files before merging.

Follow the supplied Test Specification structure:
1. Introduction (goals, scope, constraints).
2. Test Plan (strategy, resources, metrics, tools, schedule).
3. Test Procedure (steps, inputs, expected outcomes, logs).

Record actual results only after execution. Include permission checks,
capacity boundaries, resource overlap, concurrent bookings, independently
calculated report totals, invalid ranges, and end-to-end integration.
No Passed/Failed results or screenshots are supplied by this scaffold.
