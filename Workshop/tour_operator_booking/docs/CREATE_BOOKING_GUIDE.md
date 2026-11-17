# How Create Booking works

## The files, in execution order

1. `__manifest__.py` lists dependencies and loads groups, permissions, company
   rules, reference sequence, views/actions, voucher, and menus in that order.
2. Root `__init__.py` imports `models`; its `__init__.py` imports all three model
   files. Python imports register models before Odoo processes their XML records.
3. Package and schedule models provide records for the booking's Many2one fields.
4. `booking.py` owns validation and transitions. XML describes presentation; it
   does not replace server-side checks.
5. `booking_views.xml` defines list, search, form, and a window action.
   `menu_views.xml` points the Tour Operator menu to that window action.
6. Confirmation returns `action_booking_voucher`, defined in report XML. Odoo's
   QWeb renderer builds a PDF containing the booking reference as a QR barcode.

## Model contract for the other teams

- Package `_name`: `tour.operator.package`; `name`, `company_id`,
  `currency_id`, `price_per_guest`, `description`.
- Schedule `_name`: `tour.operator.schedule`; `name`, `package_id`, `company_id`,
  `start_datetime`, `end_datetime`, `capacity`, `state` (`draft`/`published`),
  `booking_ids`, `reserved_guests`, `available_seats`, `reservation_revision`.
- Booking `_name`: `tour.operator.booking`; `customer_id`, `package_id`,
  `schedule_id`, `number_of_guests`, `booking_source`, `unit_price`, `total_price`,
  `state` (`draft`/`confirmed`), `name`, `company_id`, `currency_id`,
  `confirmed_at`, `confirmed_by_id`.

Do not rename these independently. Schedule Tour can extend this schedule model
with resource assignment; reporting should read confirmed bookings, use the
schedule departure date with agreed timezone boundaries, and call totals booking
value unless payments are actually tracked. Currency grouping is essential for
reports spanning companies. No payment status is fabricated in this branch.

## Example: two guests at 100

1. Selecting a package uses `@api.onchange` to clear a mismatched departure.
   Selecting a departure previews its package price in the form.
2. `create()` independently reads the departure and captures its current price.
   It ignores a caller's supplied price, reference, and confirmation metadata.
   This matters because imports and RPC do not necessarily run form onchanges.
3. `@api.depends` recomputes `total_price` from guests and saved unit price.
   `store=True` persists the total for later queries. Currency rounding follows
   Odoo's currency rules. Changing the package later does not change that price.
4. `@api.constrains` rejects invalid guests, tour/departure mismatches, unpublished
   or past departures, and insufficient capacity. Required fields are enforced
   by Odoo; company relations use `check_company` plus company record rules.
5. Saving a draft does not reserve. Therefore multiple drafts can compete for
   the same remaining places. The message in the form makes this clear.
6. `action_confirm()` checks role and record access, locks booking and departure,
   revalidates availability, writes confirmation metadata, and returns the report
   action. Confirmation includes voucher generation, as in Phase 2.
7. Confirmed bookings reject edits/deletion to protect seats and saved prices.
   Update/cancel/refund are separate workflows, not hidden additions here.

## Why the database lock exists

A Python `if guests <= available` check alone is unsafe. Two workers can both
read five remaining places, both accept four, and overbook.

`_lock_capacity()` locks the departure row in PostgreSQL. It also increments
`reservation_revision`: Odoo uses repeatable-read transactions, so a competing
transaction with a stale snapshot must fail serialization and be retried by
Odoo's normal request handling. On retry it sees the first booking's reservation.
The same lock guards schedule capacity changes. Booking writes also lock the
booking so draft edits cannot race confirmation.

Raw SQL is limited to parameterized row locks/revision updates; ordinary data
access uses the ORM. The methods performing these operations check access first.
Private methods cannot be invoked as public Odoo RPC actions. Internal `sudo()`
is limited to aggregate capacity/integrity checks, not broad user-data access.
Concurrency protection is designed here but needs a real multi-session test on
PostgreSQL before being reported as verified.

## Security and GUI

Booking Staff can manage draft bookings and read packages/departures. Managers
inherit those permissions and can configure packages/departures. Unassigned
internal users receive no addon model access. Global company rules restrict all
three models to allowed companies. Button visibility is only a UI convenience;
confirmation/printing enforce the role and access in Python too.

Odoo 19 XML uses `<list>` and direct expressions such as
`readonly="state == 'confirmed'"`. A `type="object"` button calls a Python method
on the saved booking; Odoo normally saves new form records before calling it.
`domain` filters the schedule dropdown, while backend validation rejects an
invalid relation even if a caller bypasses that dropdown.

## Test plan and local execution

Automated cases cover pricing, snapshots, invalid guests, departure mismatch,
invalid dates/status, direct confirmation bypass, exact capacity, repeated
confirmation, confirmed-edit prevention, capacity reduction, and permissions.
They are declared `post_install`, so use a disposable test database with:

```powershell
& "..\python\python.exe" ".\odoo-bin" -c ".\odoo.conf" -d tour_booking_test -i tour_operator_booking --test-enable --test-tags /tour_operator_booking --stop-after-init --no-http
```

Never point this example at a production database. A test database must be
available/creatable by the configured database account. These are Odoo tests,
not standalone Python scripts or pytest tests.

Manual cases: create contact, search bookings, display validation errors,
confirm and render PDF/QR, role restrictions, multi-company isolation, and two
browser users simultaneously confirming four guests on capacity five.
For that last case exactly one confirmation should succeed; the other must
report insufficient availability after transaction retry. Verify reserved=4.

Use the supplied Test Specification sections (Introduction, Test Plan, Test
Procedure). Record build SHA, inputs, expected result, actual result, evidence,
and Not Run/Pass/Fail. Actual runtime results remain Not Run until executed.
