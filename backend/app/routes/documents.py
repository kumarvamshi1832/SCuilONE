
import io
import logging
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

import cloudinary.uploader
from app.services.image_storage import save_document_file, delete_document_file
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from PIL import Image, UnidentifiedImageError
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.account import Account
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.document import Document
from app.models.lead import Lead
from app.services.audit_service import log_audit


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/documents",
    tags=["Documents"],
)

MAX_FILE_SIZE = 5 * 1024 * 1024

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
}

ALLOWED_IMAGE_FORMATS = {
    "JPEG",
    "PNG",
    "WEBP",
}

ALLOWED_EXTENSIONS = {
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".csv",
    ".txt",
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def serialize_document(document: Document):
    return {
        "id": str(document.id),
        "tenant_id": str(document.tenant_id),
        "uploaded_by": str(document.uploaded_by),
        "updated_by": str(document.updated_by) if document.updated_by else None,
        "deleted_by": str(document.deleted_by) if document.deleted_by else None,
        "lead_id": str(document.lead_id) if document.lead_id else None,
        "contact_id": str(document.contact_id) if document.contact_id else None,
        "account_id": str(document.account_id) if document.account_id else None,
        "deal_id": str(document.deal_id) if document.deal_id else None,
        "title": document.title,
        "filename": document.filename,
        "document_type": document.document_type,
        "content_type": document.content_type,
        "file_size": document.file_size,
        "description": document.description,
        "version_number": document.version_number,
        "is_confidential": document.is_confidential,
        "expires_at": document.expires_at.isoformat() if document.expires_at else None,
        "is_deleted": document.is_deleted,
        "deleted_at": document.deleted_at.isoformat() if document.deleted_at else None,
        "created_at": document.created_at.isoformat() if document.created_at else None,
        "updated_at": document.updated_at.isoformat() if document.updated_at else None,
        "file_url": document.file_url,
        "download_url": document.file_url,
    }


def document_audit_data(document: Document):
    return {
        "title": document.title,
        "filename": document.filename,
        "document_type": document.document_type,
        "content_type": document.content_type,
        "file_size": document.file_size,
        "description": document.description,
        "version_number": document.version_number,
        "is_confidential": document.is_confidential,
        "expires_at": document.expires_at.isoformat() if document.expires_at else None,
        "lead_id": str(document.lead_id) if document.lead_id else None,
        "contact_id": str(document.contact_id) if document.contact_id else None,
        "account_id": str(document.account_id) if document.account_id else None,
        "deal_id": str(document.deal_id) if document.deal_id else None,
        "uploaded_by": str(document.uploaded_by) if document.uploaded_by else None,
        "updated_by": str(document.updated_by) if document.updated_by else None,
        "deleted_by": str(document.deleted_by) if document.deleted_by else None,
        "is_deleted": document.is_deleted,
        "deleted_at": document.deleted_at.isoformat() if document.deleted_at else None,
    }


def get_parent_record(
    db: Session,
    tenant_id: UUID,
    lead_id: UUID | None,
    contact_id: UUID | None,
    account_id: UUID | None,
    deal_id: UUID | None,
):
    parents = [
        ("lead", lead_id, Lead),
        ("contact", contact_id, Contact),
        ("account", account_id, Account),
        ("deal", deal_id, Deal),
    ]

    selected = [
        (name, record_id, model)
        for name, record_id, model in parents
        if record_id
    ]

    if len(selected) != 1:
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of lead_id, contact_id, account_id, or deal_id",
        )

    parent_name, parent_id, parent_model = selected[0]

    record = db.query(parent_model).filter(
        parent_model.id == parent_id,
        parent_model.tenant_id == tenant_id,
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail=f"{parent_name.capitalize()} not found in your tenant",
        )

    return parent_name, parent_id


def get_document_or_404(
    db: Session,
    document_id: UUID,
    tenant_id: UUID,
):
    document = db.query(Document).filter(
        Document.id == document_id,
        Document.tenant_id == tenant_id,
        Document.is_deleted.is_(False),
    ).first()

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    return document


@router.post(
    "/",
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(..., max_length=200),
    document_type: str = Form("Other", max_length=50),
    description: str | None = Form(None),
    is_confidential: bool = Form(False),
    lead_id: UUID | None = Form(None),
    contact_id: UUID | None = Form(None),
    account_id: UUID | None = Form(None),
    deal_id: UUID | None = Form(None),
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("document.create")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])
    user_id = UUID(current_user["user_id"])
    returned_public_id = None

    filename = Path(file.filename or "").name

    if not filename or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="A valid filename is required")

    extension = Path(filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Unsupported file extension",
        )

    parent_name, parent_id = get_parent_record(
        db, tenant_id, lead_id, contact_id, account_id, deal_id
    )

    contents = await file.read(MAX_FILE_SIZE + 1)

    if not contents:
        raise HTTPException(status_code=400, detail="Please select a file")

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="File must be 5 MB or smaller",
        )

    content_type = file.content_type or "application/octet-stream"

    if extension in {".jpg", ".jpeg", ".png", ".webp"}:
        if content_type not in ALLOWED_IMAGE_TYPES:
            raise HTTPException(status_code=400, detail="Invalid image content type")

        try:
            image = Image.open(io.BytesIO(contents))
            image.verify()
            image = Image.open(io.BytesIO(contents))

            if image.format not in ALLOWED_IMAGE_FORMATS:
                raise HTTPException(status_code=400, detail="Invalid image format")

        except (UnidentifiedImageError, OSError):
            raise HTTPException(
                status_code=400,
                detail="The uploaded file is not a valid image",
            )

    elif extension == ".pdf":
        if not contents.startswith(b"%PDF-"):
            raise HTTPException(status_code=400, detail="Invalid PDF file")

        content_type = "application/pdf"

    elif extension in {".doc", ".docx", ".xls", ".xlsx"}:
        if contents.startswith(b"PK"):
            content_type = (
                "application/vnd.openxmlformats-officedocument"
                if extension in {".docx", ".xlsx"}
                else "application/zip"
            )
        elif extension in {".doc", ".xls"}:
            if not contents.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
                raise HTTPException(
                    status_code=400,
                    detail="Invalid Office document",
                )
        else:
            raise HTTPException(
                status_code=400,
                detail="Invalid Office document",
            )

    elif extension == ".csv":
        content_type = "text/csv"

    elif extension == ".txt":
        content_type = "text/plain"
        try:
            contents.decode("utf-8")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Invalid text file encoding")

    storage_public_id = f"scuilone/documents/{tenant_id}/{uuid4().hex}"
    resource_type = (
        "image"
        if extension in {".jpg", ".jpeg", ".png", ".webp"}
        else "raw"
    )

    try:
        file_url, returned_public_id = save_document_file(
            contents=contents,
            tenant_id=str(tenant_id),
            filename=filename,
            content_type=content_type,
            resource_type=resource_type,
            tags=["scuilone", "document", str(tenant_id)],
        )

        if not file_url or not returned_public_id:
            raise RuntimeError("Failed to store document metadata")

        document = Document(
            tenant_id=tenant_id,
            uploaded_by=user_id,
            lead_id=parent_id if parent_name == "lead" else None,
            contact_id=parent_id if parent_name == "contact" else None,
            account_id=parent_id if parent_name == "account" else None,
            deal_id=parent_id if parent_name == "deal" else None,
            title=title.strip(),
            filename=filename,
            document_type=document_type.strip() or "Other",
            storage_public_id=returned_public_id,
            file_url=file_url,
            content_type=content_type,
            file_size=len(contents),
            description=description,
            version_number=1,
            is_confidential=is_confidential,
            is_deleted=False,
        )

        db.add(document)
        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="create",
            module="documents",
            record_id=document.id,
            description=f"Uploaded document '{document.title}'",
            after_data=document_audit_data(document),
        )

        db.commit()
        db.refresh(document)

        return {
            "message": "Document uploaded successfully",
            "document": serialize_document(document),
        }

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception("Document upload failed")

        if returned_public_id:
            try:
                delete_document_file(
                    returned_public_id,
                    file_url=file_url if "file_url" in locals() else None,
                    resource_type=resource_type,
                )
            except Exception:
                logger.exception("Document cleanup failed after database error")

        raise HTTPException(
            status_code=502,
            detail="Document upload failed. Please try again.",
        )

    finally:
        await file.close()


@router.get("/")
def list_documents(
    lead_id: UUID | None = Query(None),
    contact_id: UUID | None = Query(None),
    account_id: UUID | None = Query(None),
    deal_id: UUID | None = Query(None),
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("document.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])

    query = db.query(Document).filter(
        Document.tenant_id == tenant_id,
        Document.is_deleted.is_(False),
    )

    filters = [
        ("lead_id", lead_id, Document.lead_id),
        ("contact_id", contact_id, Document.contact_id),
        ("account_id", account_id, Document.account_id),
        ("deal_id", deal_id, Document.deal_id),
    ]

    selected = [(name, value, column) for name, value, column in filters if value]

    if len(selected) > 1:
        raise HTTPException(
            status_code=400,
            detail="Filter by only one CRM record at a time",
        )

    if selected:
        name, value, column = selected[0]

        parent_models = {
            "lead_id": Lead,
            "contact_id": Contact,
            "account_id": Account,
            "deal_id": Deal,
        }

        parent = db.query(parent_models[name]).filter(
            parent_models[name].id == value,
            parent_models[name].tenant_id == tenant_id,
        ).first()

        if not parent:
            raise HTTPException(status_code=404, detail="CRM record not found")

        query = query.filter(column == value)

    documents = query.order_by(Document.created_at.desc()).all()

    return {
        "count": len(documents),
        "documents": [serialize_document(document) for document in documents],
    }


@router.get("/{document_id}")
def get_document(
    document_id: UUID,
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("document.view")),
    db: Session = Depends(get_db),
):
    document = get_document_or_404(
        db, document_id, UUID(current_user["tenant_id"])
    )

    return {
        "document": serialize_document(document),
        "download_url": document.file_url,
    }


@router.get("/{document_id}/download")
def download_document(
    document_id: UUID,
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("document.view")),
    db: Session = Depends(get_db),
):
    document = get_document_or_404(
        db, document_id, UUID(current_user["tenant_id"])
    )

    return {
        "filename": document.filename,
        "content_type": document.content_type,
        "download_url": document.file_url,
    }


@router.delete("/{document_id}")
def delete_document(
    document_id: UUID,
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("document.delete")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])
    user_id = UUID(current_user["user_id"])

    document = get_document_or_404(db, document_id, tenant_id)

    before_data = document_audit_data(document)

    resource_type = (
        "image"
        if Path(document.filename).suffix.lower()
        in {".jpg", ".jpeg", ".png", ".webp"}
        else "raw"
    )

    try:
        delete_document_file(
            document.storage_public_id,
            file_url=document.file_url,
            resource_type=resource_type,
        )

        document.is_deleted = True
        document.deleted_at = datetime.now(timezone.utc)
        document.deleted_by = user_id

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="delete",
            module="documents",
            record_id=document.id,
            description=f"Deleted document '{document.title}'",
            before_data=before_data,
            after_data={
                **before_data,
                "is_deleted": True,
                "deleted_by": str(user_id),
                "deleted_at": document.deleted_at.isoformat(),
            },
        )

        db.commit()

        return {"message": "Document deleted successfully"}

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception("Document deletion failed")
        raise HTTPException(
            status_code=502,
            detail="Document deletion failed. Please try again.",
        )
