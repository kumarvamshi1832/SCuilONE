
import io
import logging
from uuid import UUID, uuid4
import app.core.cloudinary_config
import cloudinary.uploader
from app.services.image_storage import save_image_file, delete_image_file
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from PIL import Image
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.property import Property
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.property_image import PropertyImage
from app.models.user import User
from app.schemas.property_image import (
    PropertyImageResponse,
    PropertyImageReorderRequest,
    PropertyImageUpdate,
)
from app.services.audit_service import log_audit


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/properties",
    tags=["Property Images"],
)

MAX_IMAGE_SIZE = 5 * 1024 * 1024
MAX_IMAGES_PER_PROPERTY = 50

ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}

ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}

ALLOWED_IMAGE_CATEGORIES = {
    "Exterior",
    "Interior",
    "Floor Plan",
    "Amenities",
    "Other",
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_context(current_user: dict):
    try:
        tenant_id = UUID(str(current_user["tenant_id"]))
        user_id = UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user context.",
        )

    return tenant_id, user_id


def get_property_or_404(
    db: Session,
    tenant_id: UUID,
    property_id: UUID,
):
    property_record = (
        db.query(Property)
        .filter(
            Property.id == property_id,
            Property.tenant_id == tenant_id,
        )
        .first()
    )

    if not property_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found.",
        )

    return property_record


def get_image_or_404(
    db: Session,
    tenant_id: UUID,
    property_id: UUID,
    image_id: UUID,
):
    image = (
        db.query(PropertyImage)
        .filter(
            PropertyImage.id == image_id,
            PropertyImage.property_id == property_id,
            PropertyImage.tenant_id == tenant_id,
        )
        .first()
    )

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property image not found.",
        )

    return image


def image_snapshot(image: PropertyImage):
    return {
        "id": str(image.id),
        "property_id": str(image.property_id),
        "image_type": image.image_type,
        "is_primary": image.is_primary,
        "sort_order": image.sort_order,
        "image_url": image.image_url,
    }


def validate_image(contents: bytes, content_type: str | None):
    if not contents:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded image is empty.",
        )

    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPEG, PNG, and WebP images are allowed.",
        )

    try:
        with Image.open(io.BytesIO(contents)) as image:
            image.verify()

        with Image.open(io.BytesIO(contents)) as image:
            if image.format not in ALLOWED_IMAGE_FORMATS:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Unsupported image format.",
                )
            image_width, image_height = image.size

            if image_width <= 0 or image_height <= 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid image dimensions.",
                )

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is not a valid image.",
        )

    if ALLOWED_IMAGE_TYPES[content_type] != image.format:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image content does not match its declared type.",
        )


def set_primary_image(
    db: Session,
    tenant_id: UUID,
    property_id: UUID,
    image: PropertyImage,
):
    property_record = (
        db.query(Property)
        .filter(
            Property.id == property_id,
            Property.tenant_id == tenant_id,
        )
        .with_for_update()
        .first()
    )

    if property_record is None:
        raise HTTPException(
            status_code=404,
            detail="Property not found",
        )

    images = (
        db.query(PropertyImage)
        .filter(
            PropertyImage.tenant_id == tenant_id,
            PropertyImage.property_id == property_id,
        )
        .with_for_update()
        .all()
    )

    if not any(existing.id == image.id for existing in images):
        raise HTTPException(
            status_code=404,
            detail="Property image not found",
        )

    for existing in images:
        existing.is_primary = existing.id == image.id

@router.post(
    "/{property_id}/images",
    response_model=list[PropertyImageResponse],
    status_code=status.HTTP_201_CREATED,
)
async def upload_property_images(
    property_id: UUID,
    files: list[UploadFile] = File(...),
    image_type: str = Form("Exterior"),
    current_user: dict = Depends(require_active_user),
    _: None = Depends(require_permission("property.update")),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_context(current_user)
    get_property_or_404(db, tenant_id, property_id)

    if image_type not in ALLOWED_IMAGE_CATEGORIES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image category.",
        )

    if not files:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Select at least one image.",
        )

    existing_count = (
        db.query(PropertyImage)
        .filter(
            PropertyImage.tenant_id == tenant_id,
            PropertyImage.property_id == property_id,
        )
        .count()
    )

    if existing_count + len(files) > MAX_IMAGES_PER_PROPERTY:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"A property can have at most {MAX_IMAGES_PER_PROPERTY} images.",
        )

    uploaded_assets = []
    created_images = []

    try:
        for file in files:
            contents = await file.read(MAX_IMAGE_SIZE + 1)

            if len(contents) > MAX_IMAGE_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Each image must be 5 MB or smaller.",
                )

            validate_image(contents, file.content_type)

            image_url, public_id = save_image_file(
                contents=contents,
                folder="properties",
                tenant_id=str(tenant_id),
                entity_id=str(property_id),
                content_type=file.content_type or "image/jpeg",
                tags=["scuilone", "property-image", str(tenant_id)],
            )

            if not public_id or not image_url:
                raise RuntimeError("Failed to store image.")

            uploaded_assets.append((public_id, image_url))

            image = PropertyImage(
                tenant_id=tenant_id,
                property_id=property_id,
                uploaded_by=user_id,
                image_url=image_url,
                public_id=public_id,
                image_type=image_type,
                is_primary=False,
                sort_order=existing_count + len(created_images),
            )

            db.add(image)
            created_images.append(image)

        db.flush()

        if existing_count == 0 and created_images:
            set_primary_image(
                db,
                tenant_id,
                property_id,
                created_images[0],
            )

        log_audit(
            db,
            tenant_id,
            user_id,
            action="create",
            module="property_image",
            record_id=property_id,
            description=f"Uploaded {len(created_images)} property image(s).",
            after_data={
                "property_id": str(property_id),
                "image_ids": [str(image.id) for image in created_images],
                "count": len(created_images),
            },
        )

        db.commit()

        for image in created_images:
            db.refresh(image)

        return created_images

    except HTTPException:
        db.rollback()
        for item in uploaded_assets:
            pid = item[0] if isinstance(item, tuple) else item
            url = item[1] if isinstance(item, tuple) else None
            try:
                delete_image_file(pid, url)
            except Exception:
                logger.exception("Failed to clean up image %s", pid)
        raise

    except Exception:
        db.rollback()
        for item in uploaded_assets:
            pid = item[0] if isinstance(item, tuple) else item
            url = item[1] if isinstance(item, tuple) else None
            try:
                delete_image_file(pid, url)
            except Exception:
                logger.exception("Failed to clean up image %s", pid)

        logger.exception("Property image upload failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Property image upload failed. Please try again.",
        )

    finally:
        for file in files:
            await file.close()


@router.get(
    "/{property_id}/images",
    response_model=list[PropertyImageResponse],
)
def list_property_images(
    property_id: UUID,
    current_user: dict = Depends(require_active_user),
    _: None = Depends(require_permission("property.view")),
    db: Session = Depends(get_db),
):
    tenant_id, _user_id = get_context(current_user)
    get_property_or_404(db, tenant_id, property_id)

    return (
        db.query(PropertyImage)
        .filter(
            PropertyImage.tenant_id == tenant_id,
            PropertyImage.property_id == property_id,
        )
        .order_by(
            PropertyImage.sort_order.asc(),
            PropertyImage.created_at.asc(),
        )
        .all()
    )



@router.patch(
    "/{property_id}/images/{image_id}",
    response_model=PropertyImageResponse,
)
def update_property_image(
    property_id: UUID,
    image_id: UUID,
    data: PropertyImageUpdate,
    current_user: dict = Depends(require_active_user),
    _: None = Depends(require_permission("property.update")),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_context(current_user)
    get_property_or_404(db, tenant_id, property_id)

    image = get_image_or_404(
        db,
        tenant_id,
        property_id,
        image_id,
    )

    changes = data.model_dump(exclude_unset=True)

    if not changes:
        return image

    if (
        "image_type" in changes
        and changes["image_type"] is not None
        and changes["image_type"] not in ALLOWED_IMAGE_CATEGORIES
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image category.",
        )

    if (
        changes.get("is_primary") is False
        and image.is_primary
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose another primary image before unsetting this one.",
        )

    before_data = image_snapshot(image)

    try:
        if changes.get("is_primary") is True:
            set_primary_image(
                db,
                tenant_id,
                property_id,
                image,
            )

        if (
            "image_type" in changes
            and changes["image_type"] is not None
        ):
            image.image_type = changes["image_type"]

        if (
            "sort_order" in changes
            and changes["sort_order"] is not None
        ):
            image.sort_order = changes["sort_order"]

        db.flush()

        after_data = image_snapshot(image)

        log_audit(
            db,
            tenant_id,
            user_id,
            action="update",
            module="property_image",
            record_id=image.id,
            description="Updated property image details.",
            before_data=before_data,
            after_data=after_data,
        )

        db.commit()
        db.refresh(image)
        return image

    except Exception:
        db.rollback()
        raise


@router.put(
    "/{property_id}/images/reorder",
    response_model=list[PropertyImageResponse],
)
def reorder_property_images(
    property_id: UUID,
    data: PropertyImageReorderRequest,
    current_user: dict = Depends(require_active_user),
    _: None = Depends(require_permission("property.update")),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_context(current_user)
    get_property_or_404(db, tenant_id, property_id)

    submitted_ids = [item.id for item in data.images]

    if len(submitted_ids) != len(set(submitted_ids)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Duplicate image IDs are not allowed.",
        )

    images = (
        db.query(PropertyImage)
        .filter(
            PropertyImage.tenant_id == tenant_id,
            PropertyImage.property_id == property_id,
            PropertyImage.id.in_(submitted_ids),
        )
        .with_for_update()
        .all()
    )

    if len(images) != len(submitted_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Every image must belong to this property.",
        )

    before_data = [
        {
            "id": str(image.id),
            "sort_order": image.sort_order,
        }
        for image in images
    ]

    order_map = {item.id: item.sort_order for item in data.images}

    for image in images:
        image.sort_order = order_map[image.id]

    log_audit(
        db,
        tenant_id,
        user_id,
        action="update",
        module="property_image",
        record_id=property_id,
        description="Reordered property images.",
        before_data=before_data,
        after_data=[
            {
                "id": str(image.id),
                "sort_order": image.sort_order,
            }
            for image in images
        ],
    )

    db.commit()

    return (
        db.query(PropertyImage)
        .filter(
            PropertyImage.tenant_id == tenant_id,
            PropertyImage.property_id == property_id,
        )
        .order_by(
            PropertyImage.sort_order.asc(),
            PropertyImage.created_at.asc(),
        )
        .all()
    )


@router.delete(
    "/{property_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_property_image(
    property_id: UUID,
    image_id: UUID,
    current_user: dict = Depends(require_active_user),
    _: None = Depends(require_permission("property.delete")),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_context(current_user)
    get_property_or_404(db, tenant_id, property_id)

    image = get_image_or_404(
        db,
        tenant_id,
        property_id,
        image_id,
    )

    before_data = image_snapshot(image)

    try:
        delete_image_file(image.public_id, image.image_url)

        db.delete(image)
        db.flush()

        remaining = (
            db.query(PropertyImage)
            .filter(
                PropertyImage.tenant_id == tenant_id,
                PropertyImage.property_id == property_id,
            )
            .with_for_update()
            .order_by(
                PropertyImage.sort_order.asc(),
                PropertyImage.created_at.asc(),
            )
            .all()
        )

        if before_data["is_primary"] and remaining:
            remaining[0].is_primary = True

        log_audit(
            db,
            tenant_id,
            user_id,
            action="delete",
            module="property_image",
            record_id=image_id,
            description="Deleted a property image.",
            before_data=before_data,
        )

        db.commit()

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logger.exception("Property image deletion failed")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Property image deletion failed. Please try again.",
        )
