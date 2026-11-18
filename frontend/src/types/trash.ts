/**
 * Trash (soft-deleted records).
 * Mirrors backend/app/routes/trash.py - the backend supports exactly these entities.
 */

export const TRASH_ENTITIES = ["lead", "contact", "account", "deal"] as const;
export type TrashEntity = (typeof TRASH_ENTITIES)[number];

/** Item of GET /api/v1/trash/{entity}. */
export interface TrashRecord {
  id: string;
  entity: TrashEntity;
  label: string;
  deleted_at: string;
  deleted_by: string | null;
  deleted_by_name: string | null;
}

/** Response of POST /api/v1/trash/{entity}/{record_id}/restore. */
export interface TrashRestoreResult {
  id: string;
  entity: TrashEntity;
  restored: boolean;
}
