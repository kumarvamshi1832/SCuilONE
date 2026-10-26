import { apiClient } from "./authService";
import type { GlobalSearchResponse } from "../types/search";

/**
 * Searches CRM records across entities using the backend Global Search API.
 * 
 * Contract:
 * - GET /api/v1/search/?q={query}&limit={limit}
 * - q: string (min 2, max 150 chars)
 * - limit: number (1..25)
 */
export const searchGlobal = async (
  query: string,
  limit: number = 10,
  signal?: AbortSignal
): Promise<GlobalSearchResponse> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { query: trimmed, count: 0, results: [] };
  }

  const safeLimit = Math.min(Math.max(1, limit), 25);
  const response = await apiClient.get<GlobalSearchResponse>("/api/v1/search/", {
    params: {
      q: trimmed,
      limit: safeLimit,
    },
    signal,
  });

  return response.data;
};
