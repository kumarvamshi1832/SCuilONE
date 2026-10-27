import { apiClient } from "./authService";
import type { PropertyMatch, PropertyMatchCreate } from "../types/propertyMatch";
import type { Property } from "../types/property";

export const createPropertyMatch = async (
  data: PropertyMatchCreate
): Promise<PropertyMatch> => {
  const response = await apiClient.post<PropertyMatch>("/api/v1/property-matches/", data);
  return response.data;
};

export const getMatchesForRequirement = async (
  requirementId: string
): Promise<PropertyMatch[]> => {
  const response = await apiClient.get<PropertyMatch[]>(
    `/api/v1/property-matches/requirements/${requirementId}`
  );
  return response.data;
};

export const getMatchesForProperty = async (
  propertyId: string
): Promise<PropertyMatch[]> => {
  const response = await apiClient.get<PropertyMatch[]>(
    `/api/v1/property-matches/properties/${propertyId}`
  );
  return response.data;
};

export const autoMatchProperties = async (
  requirementId: string
): Promise<PropertyMatch[]> => {
  const response = await apiClient.post<PropertyMatch[]>(
    `/api/v1/property-matches/requirements/${requirementId}/auto-match`
  );
  return response.data;
};

export const getPotentialMatches = async (
  requirementId: string
): Promise<Property[]> => {
  const response = await apiClient.get<Property[]>(
    `/api/v1/property-matches/potential/${requirementId}`
  );
  return response.data;
};

