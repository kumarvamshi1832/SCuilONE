from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    uploaded_by: UUID
    updated_by: UUID | None = None
    deleted_by: UUID | None = None

    lead_id: UUID | None = None
    contact_id: UUID | None = None
    account_id: UUID | None = None
    deal_id: UUID | None = None

    title: str
    filename: str
    document_type: str
    content_type: str
    file_size: int
    description: str | None = None

    version_number: int
    is_confidential: bool
    expires_at: datetime | None = None

    is_deleted: bool
    deleted_at: datetime | None = None

    created_at: datetime
    updated_at: datetime


class DocumentListResponse(BaseModel):
    count: int
    documents: list[DocumentResponse]


class DocumentUploadResponse(BaseModel):
    message: str
    document: DocumentResponse


class DocumentDownloadResponse(BaseModel):
    filename: str
    content_type: str
    download_url: str