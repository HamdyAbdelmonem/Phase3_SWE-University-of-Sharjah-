from odoo import fields, models, _
from odoo.exceptions import ValidationError


class OperationalResource(models.Model):
    _name = "tour.operator.resource"
    _description = "Tour Driver or Vehicle"
    _order = "kind, name, id"

    name = fields.Char(required=True)
    kind = fields.Selection([("driver", "Driver"), ("vehicle", "Vehicle")], required=True)
    company_id = fields.Many2one("res.company", required=True, default=lambda self: self.env.company)
    assignment_revision = fields.Integer(default=0, readonly=True, copy=False)

    def _lock_assignments(self):
        # A row change forces a concurrent publisher with an old snapshot to retry.
        for resource_id in sorted(self.ids):
            self.env.cr.execute(
                "UPDATE tour_operator_resource SET assignment_revision = COALESCE(assignment_revision, 0) + 1 WHERE id = %s",
                [resource_id],
            )
        self.invalidate_recordset(["assignment_revision"], flush=False)

    def write(self, vals):
        for resource in self:
            if ("kind" in vals and vals["kind"] != resource.kind) or (
                "company_id" in vals and vals["company_id"] != resource.company_id.id
            ):
                raise ValidationError(_("Create a new resource to use a different type or company."))
        return super().write(vals)
