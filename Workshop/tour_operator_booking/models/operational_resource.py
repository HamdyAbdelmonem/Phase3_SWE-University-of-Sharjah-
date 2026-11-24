from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class OperationalResource(models.Model):
    _name = "tour.operator.resource"
    _description = "Tour Operational Resource"
    _order = "kind, name, id"
    _check_company_auto = True

    name = fields.Char(required=True)
    kind = fields.Selection(
        [
            ("driver", "Driver"),
            ("guide", "Tour Guide"),
            ("vehicle", "Vehicle"),
        ],
        required=True,
    )
    company_id = fields.Many2one(
        "res.company",
        required=True,
        default=lambda self: self.env.company,
    )
    vehicle_capacity = fields.Integer(
        string="Vehicle Capacity",
        default=0,
        help="Maximum number of guests this vehicle can carry. Used only for vehicle resources.",
    )
    assignment_revision = fields.Integer(default=0, readonly=True, copy=False)

    @api.constrains("vehicle_capacity", "kind")
    def _check_vehicle_capacity(self):
        for resource in self:
            if resource.vehicle_capacity < 0:
                raise ValidationError(_("Vehicle capacity cannot be negative."))
            if resource.kind == "vehicle" and resource.vehicle_capacity == 0:
                # Zero is allowed for compatibility with older resource records.
                # A positive value enables explicit capacity validation when scheduling.
                continue

    def _lock_assignments(self):
        # A row change forces a concurrent publisher with an old snapshot to retry.
        for resource_id in sorted(self.ids):
            self.env.cr.execute(
                "UPDATE tour_operator_resource "
                "SET assignment_revision = COALESCE(assignment_revision, 0) + 1 "
                "WHERE id = %s",
                [resource_id],
            )
        self.invalidate_recordset(["assignment_revision"], flush=False)

    def write(self, vals):
        for resource in self:
            if ("kind" in vals and vals["kind"] != resource.kind) or (
                "company_id" in vals and vals["company_id"] != resource.company_id.id
            ):
                raise ValidationError(
                    _("Create a new resource to use a different type or company.")
                )
        return super().write(vals)
