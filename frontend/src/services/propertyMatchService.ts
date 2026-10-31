function getCurrentTenantId(): string {
  try {
    const raw = sessionStorage.getItem('tenant') || localStorage.getItem('tenant');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.id) return String(parsed.id);
    }
  } catch {}
  return '';
}

import { apiClient } from "./authService";
import type { PropertyMatch, PropertyMatchCreate } from "../types/propertyMatch";
import type { Property } from "../types/property";
import { getProperties } from "./propertyService";

let isPropertyMatchesApiSupported = false;
const MATCHES_STORAGE_KEY = "scuilone_property_matches_v1";

const getLocalMatches = (): PropertyMatch[] => {
  try {
    const raw = localStorage.getItem(MATCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveLocalMatches = (items: PropertyMatch[]) => {
  try {
    localStorage.setItem(MATCHES_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("Failed to save property matches", err);
  }
};

export const createPropertyMatch = async (
  data: PropertyMatchCreate
): Promise<PropertyMatch> => {
  if (!isPropertyMatchesApiSupported) {
    const items = getLocalMatches();
    const existing = items.find(
      (m) =>
        m.buyer_requirement_id === data.buyer_requirement_id &&
        m.property_id === data.property_id
    );
    if (existing) return existing;

    const newMatch: PropertyMatch = {
      id: `match-${Date.now()}`,
      tenant_id: getCurrentTenantId() || "5d382613-ee83-42f0-b1ac-66a0af4506a5",
      buyer_requirement_id: data.buyer_requirement_id,
      property_id: data.property_id,
      assigned_to: data.assigned_to || null,
      status: "Matched",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    items.unshift(newMatch);
    saveLocalMatches(items);
    return newMatch;
  }
  try {
    const response = await apiClient.post<PropertyMatch>("/api/v1/property-matches/", data);
    return response.data;
  } catch {
    isPropertyMatchesApiSupported = false;
    return createPropertyMatch(data);
  }
};

export const getMatchesForRequirement = async (
  requirementId: string
): Promise<PropertyMatch[]> => {
  if (!isPropertyMatchesApiSupported) {
    return getLocalMatches().filter((m) => m.buyer_requirement_id === requirementId);
  }
  try {
    const response = await apiClient.get<PropertyMatch[]>(
      `/api/v1/property-matches/requirements/${requirementId}`
    );
    return response.data;
  } catch {
    isPropertyMatchesApiSupported = false;
    return getLocalMatches().filter((m) => m.buyer_requirement_id === requirementId);
  }
};

export const getMatchesForProperty = async (
  propertyId: string
): Promise<PropertyMatch[]> => {
  if (!isPropertyMatchesApiSupported) {
    return getLocalMatches().filter((m) => m.property_id === propertyId);
  }
  try {
    const response = await apiClient.get<PropertyMatch[]>(
      `/api/v1/property-matches/properties/${propertyId}`
    );
    return response.data;
  } catch {
    isPropertyMatchesApiSupported = false;
    return getLocalMatches().filter((m) => m.property_id === propertyId);
  }
};

export const autoMatchProperties = async (
  requirementId: string
): Promise<PropertyMatch[]> => {
  if (!isPropertyMatchesApiSupported) {
    const properties = await getProperties();
    const matches: PropertyMatch[] = [];
    for (const prop of properties) {
      if (prop.status === "Available") {
        const m = await createPropertyMatch({
          buyer_requirement_id: requirementId,
          property_id: prop.id,
        });
        matches.push(m);
      }
    }
    return matches;
  }
  try {
    const response = await apiClient.post<PropertyMatch[]>(
      `/api/v1/property-matches/requirements/${requirementId}/auto-match`
    );
    return response.data;
  } catch {
    isPropertyMatchesApiSupported = false;
    return autoMatchProperties(requirementId);
  }
};

export const getPotentialMatches = async (
  _requirementId: string
): Promise<Property[]> => {
  if (!isPropertyMatchesApiSupported) {
    const properties = await getProperties();
    return properties.filter((p) => p.status === "Available");
  }
  try {
    const response = await apiClient.get<Property[]>(
      `/api/v1/property-matches/potential/${_requirementId}`
    );
    return response.data;
  } catch {
    isPropertyMatchesApiSupported = false;
    const properties = await getProperties();
    return properties.filter((p) => p.status === "Available");
  }
};
