/**
 * SCuilONE CRM — Global Search Types
 * Maps exactly to the backend API contract in `app.routes.search.py`
 */

export type SearchModule =
  | "leads"
  | "contacts"
  | "accounts"
  | "deals"
  | "projects"
  | "buildings"
  | "properties"
  | "bookings"
  | "payments"
  | "tasks"
  | string;

export interface SearchResultItem {
  id: string;
  module: SearchModule;
  name: string;
  email?: string | null;
  phone?: string | null;
  // Optional secondary fields for forward compatibility
  subtitle?: string | null;
  status?: string | null;
}

export interface GlobalSearchResponse {
  query: string;
  count: number;
  results: SearchResultItem[];
}
