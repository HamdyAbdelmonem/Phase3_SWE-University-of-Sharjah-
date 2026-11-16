from odoo import api , models, fields

class EstateProperty(models.Model):
    _name = "estate.property"
    _description = "Real Estate Properties"

    name = fields.Char(required =True)
    description = fields.Text()
    bedrooms = fields.Integer()
    expected_price = fields.Float()
    selling_price = fields.Float(readonly=True)
    living_area = fields.Integer()
    has_garden = fields.Boolean()
    garden_area = fields.Integer()
    total_area= fields.Integer(computer ="_compute_total_area")
    property_type_id = fields.Many2one("estate.property.type")

    @api.depends("living_area", "garden_area")
    def _compute_total_area(self):
        for record in self:
            record.total_area = record.living_area + record.garden_area