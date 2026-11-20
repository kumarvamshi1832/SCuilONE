"""Correct offer ownership semantics for customer/staff negotiation.

Revision ID: d9a7c2e51b30
Revises: c8f2a6d91b40
"""
from alembic import op
import sqlalchemy as sa

revision = "d9a7c2e51b30"
down_revision = "c8f2a6d91b40"
branch_labels = None
depends_on = None


def upgrade():
    # Before the customer negotiation endpoints existed, all offer rows were
    # created by authenticated staff users. Preserve those records as staff
    # (Seller) offers so customers can respond to them after deployment.
    op.execute("UPDATE property_offers SET offer_type = 'Seller' WHERE created_by IS NOT NULL")
    op.execute("UPDATE property_offers SET offer_type = 'Buyer' WHERE created_by IS NULL")
    op.create_check_constraint(
        "ck_property_offers_offer_type",
        "property_offers",
        "offer_type IN ('Buyer', 'Seller')",
    )


def downgrade():
    op.drop_constraint("ck_property_offers_offer_type", "property_offers", type_="check")
