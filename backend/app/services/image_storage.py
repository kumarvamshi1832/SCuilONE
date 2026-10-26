import io
import logging
from pathlib import Path
from uuid import uuid4

import cloudinary.uploader
from app.database.connection import settings

logger = logging.getLogger(__name__)

# Base upload directory: backend/uploads
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def is_cloudinary_configured() -> bool:
    """Check if Cloudinary has real credentials configured (not dummy CRM)."""
    cloud_name = (settings.CLOUDINARY_CLOUD_NAME or "").strip()
    api_key = (settings.CLOUDINARY_API_KEY or "").strip()
    api_secret = (settings.CLOUDINARY_API_SECRET or "").strip()

    if not cloud_name or not api_key or not api_secret:
        return False

    # "CRM" is known placeholder
    if cloud_name.upper() == "CRM":
        return False

    return True


def save_image_file(
    contents: bytes,
    folder: str,
    tenant_id: str,
    entity_id: str,
    content_type: str = "image/jpeg",
    tags: list[str] | None = None,
) -> tuple[str, str]:
    """
    Saves an image file:
    1. Attempts Cloudinary upload if valid credentials exist.
    2. Falls back to local disk storage if Cloudinary fails or is unconfigured.
    Returns:
        (image_url, public_id)
    """
    unique_id = uuid4().hex

    # 1. Try Cloudinary if configured
    if is_cloudinary_configured():
        try:
            cloudinary_public_id = f"scuilone/{folder}/{tenant_id}/{entity_id}/{unique_id}"
            result = cloudinary.uploader.upload(
                io.BytesIO(contents),
                resource_type="image",
                public_id=cloudinary_public_id,
                overwrite=False,
                unique_filename=False,
                tags=tags or ["scuilone", folder, str(tenant_id)],
            )
            image_url = result.get("secure_url")
            public_id = result.get("public_id")
            if image_url and public_id:
                return image_url, public_id
        except Exception as cloud_err:
            logger.warning(
                "Cloudinary upload failed (%s). Falling back to local storage.",
                cloud_err,
            )

    # 2. Local disk storage fallback
    ext_map = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    ext = ext_map.get(content_type.lower(), ".jpg")

    rel_folder = Path(folder) / str(tenant_id) / str(entity_id)
    dest_dir = UPLOAD_DIR / rel_folder
    dest_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{unique_id}{ext}"
    target_path = dest_dir / filename
    target_path.write_bytes(contents)

    rel_url = f"/uploads/{folder}/{tenant_id}/{entity_id}/{filename}"
    public_id = f"local_{folder}_{unique_id}"

    return rel_url, public_id


def delete_image_file(public_id: str, image_url: str | None = None) -> bool:
    """
    Deletes an image file from local storage or Cloudinary.
    """
    if not public_id:
        return True

    # 1. Local storage cleanup
    if public_id.startswith("local_") or (image_url and image_url.startswith("/uploads/")):
        try:
            if image_url and image_url.startswith("/uploads/"):
                clean_rel = image_url[len("/uploads/"):].lstrip("/\\")
                file_path = (UPLOAD_DIR / clean_rel).resolve()
                if file_path.is_file():
                    file_path.unlink(missing_ok=True)
                    return True

            # If no image_url, search by file ID pattern
            parts = public_id.split("_")
            if len(parts) >= 3:
                search_id = parts[-1]
                for match in UPLOAD_DIR.glob(f"**/*{search_id}*"):
                    if match.is_file():
                        match.unlink(missing_ok=True)
            return True
        except Exception as err:
            logger.warning("Failed to delete local file for public_id %s: %s", public_id, err)
            return False

    # 2. Cloudinary deletion
    try:
        cloudinary.uploader.destroy(
            public_id,
            resource_type="image",
            invalidate=True,
        )
        return True
    except Exception as err:
        logger.warning("Cloudinary destroy failed for public_id %s: %s", public_id, err)
        return False


def save_document_file(
    contents: bytes,
    tenant_id: str,
    filename: str,
    content_type: str,
    resource_type: str = "raw",
    tags: list[str] | None = None,
) -> tuple[str, str]:
    """
    Saves a document file:
    1. Attempts Cloudinary upload if valid credentials exist.
    2. Falls back to local disk storage (backend/uploads/documents/...) if Cloudinary fails or is unconfigured.
    Returns:
        (file_url, public_id)
    """
    unique_id = uuid4().hex
    storage_public_id = f"scuilone/documents/{tenant_id}/{unique_id}"

    # 1. Try Cloudinary if configured
    if is_cloudinary_configured():
        try:
            result = cloudinary.uploader.upload(
                io.BytesIO(contents),
                resource_type=resource_type,
                type="authenticated",
                public_id=storage_public_id,
                overwrite=False,
                use_filename=False,
                unique_filename=False,
                tags=tags or ["scuilone", "document", str(tenant_id)],
            )
            file_url = result.get("secure_url")
            public_id = result.get("public_id")
            if file_url and public_id:
                return file_url, public_id
        except Exception as cloud_err:
            logger.warning(
                "Cloudinary document upload failed (%s). Falling back to local storage.",
                cloud_err,
            )

    # 2. Local disk storage fallback
    ext = Path(filename).suffix.lower() or ".bin"
    safe_name = "".join(c for c in filename if c.isalnum() or c in "._- ")
    if not safe_name:
        safe_name = f"document{ext}"

    rel_folder = Path("documents") / str(tenant_id)
    dest_dir = UPLOAD_DIR / rel_folder
    dest_dir.mkdir(parents=True, exist_ok=True)

    stored_filename = f"{unique_id}_{safe_name}"
    target_path = dest_dir / stored_filename
    target_path.write_bytes(contents)

    rel_url = f"/uploads/documents/{tenant_id}/{stored_filename}"
    public_id = f"local_documents_{unique_id}"

    return rel_url, public_id


def delete_document_file(
    public_id: str,
    file_url: str | None = None,
    resource_type: str = "raw",
) -> bool:
    """
    Deletes a document file from local storage or Cloudinary.
    """
    if not public_id:
        return True

    # 1. Local storage cleanup
    if public_id.startswith("local_") or (file_url and file_url.startswith("/uploads/")):
        try:
            if file_url and file_url.startswith("/uploads/"):
                clean_rel = file_url[len("/uploads/"):].lstrip("/\\")
                file_path = (UPLOAD_DIR / clean_rel).resolve()
                if file_path.is_file():
                    file_path.unlink(missing_ok=True)
                    return True

            parts = public_id.split("_")
            if len(parts) >= 3:
                search_id = parts[-1]
                for match in (UPLOAD_DIR / "documents").glob(f"**/*{search_id}*"):
                    if match.is_file():
                        match.unlink(missing_ok=True)
            return True
        except Exception as err:
            logger.warning("Failed to delete local document file for public_id %s: %s", public_id, err)
            return False

    # 2. Cloudinary deletion
    try:
        cloudinary.uploader.destroy(
            public_id,
            resource_type=resource_type,
            invalidate=True,
        )
        return True
    except Exception as err:
        logger.warning("Cloudinary document destroy failed for public_id %s: %s", public_id, err)
        return False

