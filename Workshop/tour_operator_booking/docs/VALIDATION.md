# Validation record

Build: Create Booking implementation, 2026-11-17.

| Check | Result | Evidence / limit |
| --- | --- | --- |
| Python syntax | Passed | ast.parse on all changed Python files |
| Manifest references | Passed | Every listed XML/CSV file exists |
| Loaded XML syntax | Passed | Parsed with lxml |
| XML reference ordering | Passed | Local referenced IDs defined before use; model IDs checked |
| View/model field consistency | Passed | Static comparison of direct view fields to model definitions |
| Access CSV shape | Passed | Five correctly shaped ACL rows |
| Odoo installation/upgrade | Not Run | No Odoo runtime or PostgreSQL database in this workspace |
| Odoo TransactionCase tests | Not Run | Test source supplied; execute with Odoo test runner |
| Browser workflow and contact creation | Not Run | Requires local Odoo server |
| PDF / QR rendering | Not Run | Requires local report engine and wkhtmltopdf |
| Concurrent confirmations | Not Run | Requires separate PostgreSQL sessions / requests |
| Company isolation and role UI | Not Run | Requires separate configured Odoo users/companies |

Static checks do not establish Odoo runtime compatibility. Record actual runtime
results and screenshots after local execution, following the supplied test
specification; do not treat this table as a complete Phase 3 testing report.
