
import logging
import uuid
from io import BytesIO
from uuid import uuid4

import cloudinary.uploader
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

import app.core.cloudinary_config
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.building import Building
from app.models.building_image import BuildingImage
from app.schemas.building_image import (
    BuildingImageResponse,
    BuildingImageUpdate,
    BuildingImageReorder,
)
from app.services.audit_service import log_audit


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/buildings",
    tags=["Building Images"],
)

MAX_IMAGE_SIZE = 5 * 1024 * 1024
MAX_IMAGES_PER_BUILDING = 50

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
        tenant_id = uuid.UUID(str(current_user["tenant_id"]))
        user_id = uuid.UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user context.",
        )

    return tenant_id, user_id



def get_building_or_404(
    db: Session,
    tenant_id: uuid.UUID,
    building_id: uuid.UUID,
):
    building = (
        db.query(Building)
        .filter(
            Building.id == building_id,
            Building.tenant_id == tenant_id,
        )
        .first()
    )

    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Building not found.",
        )

    return building


def get_image_or_404(
    db: Session,
    tenant_id: uuid.UUID,
    building_id: uuid.UUID,
    image_id: uuid.UUID,
):
    image = (
        db.query(BuildingImage)
        .filter(
            BuildingImage.id == image_id,
            BuildingImage.tenant_id == tenant_id,
            BuildingImage.building_id == building_id,
        )
        .first()
    )

    if not image:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Building image not found.",
        )

    return image


def image_snapshot(image: BuildingImage):
    return {
        "id": str(image.id),
        "building_id": str(image.building_id),
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
        with Image.open(BytesIO(contents)) as image:
            image_format = image.format
            image.verify()

        with Image.open(BytesIO(contents)) as image:
            image_width, image_height = image.size

    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is not a valid image.",
        )

    if image_format not in ALLOWED_IMAGE_FORMATS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported image format.",
        )

    if ALLOWED_IMAGE_TYPES[content_type] != image_format:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image content does not match its declared type.",
        )

    if image_width <= 0 or image_height <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid image dimensions.",
        )


def set_primary_image(
    db: Session,
    tenant_id: uuid.UUID,
    building_id: uuid.UUID,
    image: BuildingImage,
):
    building = (
        db.query(Building)
        .filter(
            Building.id == building_id,
            Building.tenant_id == tenant_id,
        )
        .with_for_update()
        .first()
    )

    if not building:
        raise HTTPException(status_code=404, detail="Building not found.")

    images = (
        db.query(BuildingImage)
        .filter(
            BuildingImage.tenant_id == tenant_id,
            BuildingImage.building_id == building_id,
        )
        .with_for_update()
        .all()
    )

    if not any(existing.id == image.id for existing in images):
        raise HTTPException(status_code=404, detail="Building image not found.")

    for existing in images:
        if existing.is_primary and existing.id != image.id:
            existing.is_primary = False

    db.flush()

    image.is_primary = True


@router.post(
    "/{building_id}/images",
    response_model=list[BuildingImageResponse],
    status_code=status.HTTP_201_CREATED,
)
async def upload_building_images(
    building_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    image_type: str = Form("Exterior"),
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _permission=Depends(require_permission("building.update")),
):
    tenant_id, user_id = get_context(current_user)

    uploaded_assets = []
    created_images = []

    try:
        building = (
            db.query(Building)
            .filter(
                Building.id == building_id,
                Building.tenant_id == tenant_id,
            )
            .with_for_update()
            .first()
        )

        if not building:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Building not found.",
            )

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
            db.query(BuildingImage)
            .filter(
                BuildingImage.tenant_id == tenant_id,
                BuildingImage.building_id == building.id,
            )
            .count()
        )

        if existing_count + len(files) > MAX_IMAGES_PER_BUILDING:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"A building can have at most "
                    f"{MAX_IMAGES_PER_BUILDING} images."
                ),
            )

        for file in files:
            contents = await file.read(MAX_IMAGE_SIZE + 1)

            if len(contents) > MAX_IMAGE_SIZE:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Each image must be 5 MB or smaller.",
                )

            validate_image(contents, file.content_type)

            result = cloudinary.uploader.upload(
                BytesIO(contents),
                resource_type="image",
                public_id=(
                    f"scuilone/buildings/{tenant_id}/"
                    f"{building.id}/{uuid4().hex}"
                ),
                overwrite=False,
                unique_filename=False,
                tags=[
                    "scuilone",
                    "building-image",
                    str(tenant_id),
                    str(building.id),
                ],
            )

            public_id = result.get("public_id")
            image_url = result.get("secure_url")

            if not public_id or not image_url:
                if public_id:
                    uploaded_assets.append(public_id)

                raise RuntimeError(
                    "Cloudinary did not return the required image details."
                )

            uploaded_assets.append(public_id)

            image = BuildingImage(
                tenant_id=tenant_id,
                building_id=building.id,
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
                building.id,
                created_images[0],
            )

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="create",
            module="building_image",
            record_id=building.id,
            description=f"Uploaded {len(created_images)} building image(s).",
            after_data={
                "building_id": str(building.id),
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

        for public_id in uploaded_assets:
            try:
                cloudinary.uploader.destroy(
                    public_id,
                    resource_type="image",
                    invalidate=True,
                )
            except Exception:
                logger.exception(
                    "Failed to clean up Cloudinary image %s",
                    public_id,
                )

        raise

    except Exception:
        db.rollback()

        for public_id in uploaded_assets:
            try:
                cloudinary.uploader.destroy(
                    public_id,
                    resource_type="image",
                    invalidate=True,
                )
            except Exception:
                logger.exception(
                    "Failed to clean up Cloudinary image %s",
                    public_id,
                )

        logger.exception("Building image upload failed")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Building image upload failed. Please try again.",
        )

    finally:
        for file in files:
            await file.close()


@router.get(
    "/{building_id}/images",
    response_model=list[BuildingImageResponse],
)
def list_building_images(
    building_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _permission=Depends(require_permission("building.view")),
):
    tenant_id, _user_id = get_context(current_user)

    building = get_building_or_404(
        db,
        tenant_id,
        building_id,
    )

    return (
        db.query(BuildingImage)
        .filter(
            BuildingImage.tenant_id == tenant_id,
            BuildingImage.building_id == building.id,
        )
        .order_by(
            BuildingImage.sort_order.asc(),
            BuildingImage.created_at.asc(),
        )
        .all()
    )


@router.patch(
    "/{building_id}/images/{image_id}",
    response_model=BuildingImageResponse,
)
def update_building_image(
    building_id: uuid.UUID,
    image_id: uuid.UUID,
    payload: BuildingImageUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _permission=Depends(require_permission("building.update")),
):
    tenant_id, user_id = get_context(current_user)

    building = get_building_or_404(
        db,
        tenant_id,
        building_id,
    )

    image = get_image_or_404(
        db,
        tenant_id,
        building.id,
        image_id,
    )

    changes = payload.model_dump(exclude_unset=True)

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
        "sort_order" in changes
        and changes["sort_order"] is not None
        and changes["sort_order"] < 0
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sort order cannot be negative.",
        )

    if (
        changes.get("is_primary") is False
        and image.is_primary
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Choose another primary image before unsetting "
                "this one."
            ),
        )

    before_data = image_snapshot(image)

    try:
        if changes.get("is_primary") is True:
            set_primary_image(
                db,
                tenant_id,
                building.id,
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
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="update",
            module="building_image",
            record_id=image.id,
            description="Updated building image.",
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
    "/{building_id}/images/reorder",
    response_model=list[BuildingImageResponse],
)
def reorder_building_images(
    building_id: uuid.UUID,
    payload: BuildingImageReorder,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _permission=Depends(require_permission("building.update")),
):
    tenant_id, user_id = get_context(current_user)

    building = get_building_or_404(
        db,
        tenant_id,
        building_id,
    )

    try:
        locked_building = (
            db.query(Building)
            .filter(
                Building.id == building.id,
                Building.tenant_id == tenant_id,
            )
            .with_for_update()
            .first()
        )

        if not locked_building:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Building not found.",
            )

        images = (
            db.query(BuildingImage)
            .filter(
                BuildingImage.tenant_id == tenant_id,
                BuildingImage.building_id == building.id,
            )
            .with_for_update()
            .all()
        )

        by_id = {image.id: image for image in images}
        image_ids = payload.image_ids

        if (
            len(image_ids) != len(set(image_ids))
            or set(image_ids) != set(by_id)
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Provide every building image ID exactly once.",
            )

        before_data = [
            {
                "id": str(image.id),
                "sort_order": image.sort_order,
            }
            for image in images
        ]

        for position, image_id in enumerate(image_ids):
            by_id[image_id].sort_order = position

        after_data = [
            {
                "id": str(image_id),
                "sort_order": position,
            }
            for position, image_id in enumerate(image_ids)
        ]

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="update",
            module="building_image",
            record_id=building.id,
            description=f"Reordered {len(image_ids)} building image(s).",
            before_data=before_data,
            after_data=after_data,
        )

        db.commit()

        return (
            db.query(BuildingImage)
            .filter(
                BuildingImage.tenant_id == tenant_id,
                BuildingImage.building_id == building.id,
            )
            .order_by(
                BuildingImage.sort_order.asc(),
                BuildingImage.created_at.asc(),
            )
            .all()
        )

    except Exception:
        db.rollback()
        raise


@router.delete(
    "/{building_id}/images/{image_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_building_image(
    building_id: uuid.UUID,
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _permission=Depends(require_permission("building.delete")),
):
    tenant_id, user_id = get_context(current_user)

    building = get_building_or_404(
        db,
        tenant_id,
        building_id,
    )

    try:
        locked_building = (
            db.query(Building)
            .filter(
                Building.id == building.id,
                Building.tenant_id == tenant_id,
            )
            .with_for_update()
            .first()
        )

        if not locked_building:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Building not found.",
            )

        image = (
            db.query(BuildingImage)
            .filter(
                BuildingImage.id == image_id,
                BuildingImage.tenant_id == tenant_id,
                BuildingImage.building_id == building.id,
            )
            .with_for_update()
            .first()
        )

        if not image:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Building image not found.",
            )

        before_data = image_snapshot(image)
        public_id = image.public_id
        was_primary = image.is_primary

        result = cloudinary.uploader.destroy(
            public_id,
            resource_type="image",
            invalidate=True,
        )

        if result.get("result") not in {"ok", "not found"}:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Cloudinary could not confirm image deletion.",
            )

        db.delete(image)
        db.flush()

        remaining = (
            db.query(BuildingImage)
            .filter(
                BuildingImage.tenant_id == tenant_id,
                BuildingImage.building_id == building.id,
            )
            .with_for_update()
            .order_by(
                BuildingImage.sort_order.asc(),
                BuildingImage.created_at.asc(),
            )
            .all()
        )

        if was_primary and remaining:
            for remaining_image in remaining:
                remaining_image.is_primary = (
                    remaining_image.id == remaining[0].id
                )

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="delete",
            module="building_image",
            record_id=image_id,
            description="Deleted building image.",
            before_data=before_data,
            after_data={"public_id": public_id},
        )
        db.commit()

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        logger.exception("Building image deletion failed")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Building image deletion failed. Please try again.",
        )
