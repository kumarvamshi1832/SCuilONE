/**
 * Customer Portal Avatar Service
 * Handles avatar image validation, storage, retrieval, and real-time synchronization
 * across Customer Portal components (Header layout, Profile page, etc.)
 */

export const PORTAL_AVATAR_STORAGE_PREFIX = "scuilone_cp_avatar_";
export const PORTAL_AVATAR_EVENT = "portal:avatar-updated";

export const MAX_AVATAR_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export const ALLOWED_AVATAR_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export const ALLOWED_AVATAR_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

/**
 * Validates a profile photo file by size and format.
 */
export function validateAvatarFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: "Please select an image file to upload." };
  }

  // Validate format by MIME type or file extension
  const fileExt = `.${file.name.split(".").pop()?.toLowerCase()}`;
  const isTypeValid =
    ALLOWED_AVATAR_TYPES.includes(file.type.toLowerCase()) ||
    ALLOWED_AVATAR_EXTENSIONS.includes(fileExt);

  if (!isTypeValid) {
    return {
      valid: false,
      error: "Unsupported image format. Please upload a JPG, JPEG, PNG, or WEBP image.",
    };
  }

  // Validate file size
  if (file.size > MAX_AVATAR_FILE_SIZE) {
    const sizeInMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${sizeInMb}MB) exceeds the 5MB limit. Please choose a smaller photo.`,
    };
  }

  return { valid: true };
}

/**
 * Converts a File to a base64 Data URL.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to process image data"));
      }
    };
    reader.onerror = () => {
      reject(new Error("Unable to read the selected file"));
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Resolves a deterministic unique key for the current portal user.
 */
export function getPortalUserAvatarKey(userIdentifier?: string | null): string {
  const identifier = (userIdentifier || "default").trim().toLowerCase();
  return `${PORTAL_AVATAR_STORAGE_PREFIX}${identifier}`;
}

/**
 * Retrieves the stored avatar data URL for a given portal user.
 */
export function getPortalAvatar(userIdentifier?: string | null): string | null {
  try {
    const key = getPortalUserAvatarKey(userIdentifier);
    return localStorage.getItem(key);
  } catch (err) {
    console.warn("Unable to retrieve portal avatar:", err);
    return null;
  }
}

/**
 * Saves a portal avatar data URL and dispatches a synchronization event.
 */
export function savePortalAvatar(
  userIdentifier: string | null | undefined,
  dataUrl: string
): void {
  try {
    const key = getPortalUserAvatarKey(userIdentifier);
    localStorage.setItem(key, dataUrl);
    window.dispatchEvent(
      new CustomEvent(PORTAL_AVATAR_EVENT, {
        detail: { userIdentifier, avatarUrl: dataUrl },
      })
    );
  } catch (err) {
    console.error("Unable to save portal avatar:", err);
    throw new Error("Could not save profile image. Browser storage may be full.");
  }
}

/**
 * Removes a portal avatar and dispatches a synchronization event.
 */
export function removePortalAvatar(userIdentifier?: string | null): void {
  try {
    const key = getPortalUserAvatarKey(userIdentifier);
    localStorage.removeItem(key);
    window.dispatchEvent(
      new CustomEvent(PORTAL_AVATAR_EVENT, {
        detail: { userIdentifier, avatarUrl: null },
      })
    );
  } catch (err) {
    console.error("Unable to remove portal avatar:", err);
  }
}

