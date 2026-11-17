# Tour Operator Booking Suite — Create Booking

Odoo 19 addon for the University of Sharjah Phase 3 project.
This branch implements the Create Booking interface and booking workflow.
The selected project use cases are Create Booking, Schedule Tour, and View Booking Reports.
The original handoff's Cancel Booking selection was superseded in team discussion.

## Implemented in this branch

- Customer selection/full contact creation using Odoo Contacts (`res.partner`).
- Tour package and published departure selection; guest count and booking source.
- Saved per-guest price, computed booking value, unique sequence reference.
- Validation of positive guests, future/published departure, matching package,
  company consistency, and sufficient remaining capacity.
- Draft bookings do not reserve capacity. Confirmation checks again and reserves.
- Confirmation returns the printable voucher action; the voucher contains a QR
  encoding the booking reference. Reprinting is supported.
- Booking list/form/search, state filters, grouping, confirmations, and messages.
- Booking Staff and Manager groups with company isolation.
- Minimal package/departure setup for Managers, required to supply booking inputs.

Resource assignment/conflicts, the Operations Staff workflow, reporting wizard,
cancellation, payment integration, and scanning/check-in are NOT implemented.
Existing placeholder files for those future features are not loaded.
The voucher is not a receipt; totals are booking value, not collected revenue.
Confirmation and voucher generation remain a distinct action within the booking
workflow, matching the handoff's Phase 2 relationship.

## Install / upgrade on Windows

Commit or stash local changes before pulling. From your existing repository root:

```powershell
git fetch origin
git switch "Create-booking-+GUI"
git pull --ff-only origin "Create-booking-+GUI"
```

Keep the parent `Workshop` folder in Odoo's `addons_path`. Back up your development
database before upgrades. In Administrator PowerShell:

```powershell
cd "C:\Program Files\Odoo 19.0.20260714\server"
Stop-Service odoo-server-19.0
& "..\python\python.exe" ".\odoo-bin" -c ".\odoo.conf" -d admin -u tour_operator_booking --stop-after-init --no-http
```

Use `-i tour_operator_booking` instead of `-u` if not yet installed, or Activate
it through Apps. `admin` here is the DATABASE NAME, not a login/password.
Check `$LASTEXITCODE` and the current `odoo.log` before restarting:

```powershell
Start-Service odoo-server-19.0
```

In Settings > Users, grant your internal user **Tour Operator / Manager** for
initial setup. It implies **Booking Staff**. Grant Booking Staff to actual
booking users. No rights are automatically given to all internal users.
If group fields are not shown in the normal user form, enable developer mode
and use Settings > Technical > Security > Groups to assign users.

## Try the interface

1. Open Tour Operator > Tour Setup > Tour Packages. Create Safari at 100 in
   your company's currency. Set the company currency to AED if appropriate;
   do not hardcode or change it on a database already containing financial work.
2. Under Tour Departures, create a future departure with end after start,
   capacity 5, package Safari, and status Published.
3. Open Bookings > New. Select/create a customer, choose Safari and the departure,
   enter 2 guests, then save. Expected total: 200; remaining seats: 5 (still draft).
4. Check Availability, then Confirm Booking & Print Voucher. Seats become 3;
   booking becomes read-only. View/print the voucher and QR.
5. A booking for 4 more guests must be rejected. A draft for 3 can be confirmed.
6. Change the package price: existing bookings keep their saved unit price.

The QR is an identifier only. Do not claim secure ticket validation or attendance
tracking. PDF output requires a working wkhtmltopdf setup (usually bundled by the
Windows installer); PDF rendering and barcode output must be checked locally.
If PDF rendering fails, reopen the booking: confirmation may already have saved,
and Print Voucher can be retried after fixing PDF tooling.

## Learning guide and test status

Read `docs/CREATE_BOOKING_GUIDE.md` for the model/view flow, concurrency decisions,
permissions, and integration contract. `tests/test_booking.py` contains Odoo
TransactionCase tests; run them on a disposable database with the Odoo runtime.
Python/XML/CSV/static reference checks can run without Odoo. Runtime, browser,
PDF, permission, and simultaneous-request checks require a real Odoo database.
No runtime Passed/Failed result is claimed merely from adding test code.
