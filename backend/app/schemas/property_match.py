from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PropertyMatchCreate(BaseModel):
    buyer_requirement_id: UUID
    property_id: UUID
    assigned_to: UUID | None = None


class PropertyMatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    buyer_requirement_id: UUID
    property_id: UUID
    assigned_to: UUID | None
    created_by: UUID | None
    status: str
    created_at: datetime
    updated_at: datetime
