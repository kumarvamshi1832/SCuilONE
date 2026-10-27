import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  getBuyerRequirements,
  createBuyerRequirement,
  updateBuyerRequirement,
  deleteBuyerRequirement,
} from "../../services/buyerRequirementService";
import {
  getMatchesForRequirement,
  autoMatchProperties,
  getPotentialMatches,
  createPropertyMatch,
} from "../../services/propertyMatchService";
import {
  getProperties,
  getProperty,
  getPropertyImages,
} from "../../services/propertyService";
import { getLeads } from "../../services/leadService";
import { getContacts } from "../../services/contactService";
import { getUsers } from "../../services/userService";
import type {
  BuyerRequirement,
  BuyerRequirementCreate,
  BuyerRequirementUpdate,
} from "../../types/buyerRequirement";
import {
  REQUIREMENT_TYPES,
  BUYER_REQUIREMENT_STATUSES,
} from "../../types/buyerRequirement";
import { PROPERTY_TYPES, AREA_UNITS } from "../../types/property";
import type { PropertyMatch, PropertyMatchCreate } from "../../types/propertyMatch";
import type { Property, PropertyImage } from "../../types/property";
import type { Lead } from "../../types/lead";
import type { Contact } from "../../types/contact";
import type { User } from "../../types/user";
import PropertyCard from "../../components/properties/PropertyCard";
import { resolveImageUrl, handleImageError } from "../../utils/imageUrl";
import "./BuyerRequirements.css";

export default function BuyerRequirements() {
  const [requirements, setRequirements] = useState<BuyerRequirement[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [reqTypeFilter, setReqTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [bhkFilter, setBhkFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRequirement, setEditingRequirement] = useState<BuyerRequirement | null>(null);
  const [viewingRequirement, setViewingRequirement] = useState<BuyerRequirement | null>(null);
  const [deletingRequirement, setDeletingRequirement] = useState<BuyerRequirement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");

  // Matches State
  const [activeMatches, setActiveMatches] = useState<PropertyMatch[]>([]);
  const [potentialMatches, setPotentialMatches] = useState<Property[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [resolvedProperties, setResolvedProperties] = useState<Record<string, Property>>({});
  const [propertyImagesMap, setPropertyImagesMap] = useState<Record<string, PropertyImage[]>>({});
  const [viewingPropertyDetail, setViewingPropertyDetail] = useState<Property | null>(null);
  const [viewTab, setViewTab] = useState<"overview" | "matches">("overview");

  // Manual Matching State & Filters
  const [manualSearch, setManualSearch] = useState("");
  const [manualTypeFilter, setManualTypeFilter] = useState("");
  const [manualBhkFilter, setManualBhkFilter] = useState("");
  const [manualOnlyUnmatched, setManualOnlyUnmatched] = useState(false);
  const [matchingActionLoading, setMatchingActionLoading] = useState<string | null>(null);

  // Stable refs to prevent re-render dependency cycles and visual blinking
  const resolvedPropertiesRef = useRef<Record<string, Property>>({});
  const propertyImagesMapRef = useRef<Record<string, PropertyImage[]>>({});
  const isAutoMatchingRef = useRef<boolean>(false);

  useEffect(() => {
    resolvedPropertiesRef.current = resolvedProperties;
  }, [resolvedProperties]);

  useEffect(() => {
    propertyImagesMapRef.current = propertyImagesMap;
  }, [propertyImagesMap]);


  // Toast
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  const formatApiError = (err: any, fallback: string): string => {
    const detail = err?.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0];
      if (typeof first === "string") return first;
      if (first && typeof first.msg === "string") {
        const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
        return field && field !== "body" && field !== "query" ? `${field}: ${first.msg}` : first.msg;
      }
    }
    if (detail && typeof detail === "object" && typeof detail.message === "string") {
      return detail.message;
    }
    return err?.message || fallback;
  };

  // Permissions
  const userPermissions = useMemo(() => {
    try {
      const stored = sessionStorage.getItem("user");
      if (!stored)
        return {
          canCreate: true,
          canUpdate: true,
          canDelete: true,
          canMatch: true,
          canViewMatches: true,
        };
      const parsed = JSON.parse(stored);
      const rawPerms = Array.isArray(parsed.permissions)
        ? parsed.permissions
        : Array.isArray(parsed.role?.permissions)
        ? parsed.role.permissions
        : Array.isArray(parsed.role_permissions)
        ? parsed.role_permissions
        : [];
      let roleName = "";
      if (typeof parsed.role === "string") {
        roleName = parsed.role.toUpperCase();
      } else if (parsed.role && typeof parsed.role.name === "string") {
        roleName = parsed.role.name.toUpperCase();
      } else if (typeof parsed.role_name === "string") {
        roleName = parsed.role_name.toUpperCase();
      }

      if (!roleName) {
        try {
          const token = sessionStorage.getItem("access_token");
          if (token) {
            const parts = token.split(".");
            if (parts.length === 3 && parts[1]) {
              const payload = JSON.parse(atob(parts[1]));
              if (payload.role) roleName = String(payload.role).toUpperCase();
            }
          }
        } catch {}
      }

      const isSuperOrAdmin =
        roleName.includes("ADMIN") ||
        roleName.includes("MANAGER") ||
        roleName.includes("OWNER") ||
        roleName.includes("SUPER") ||
        !roleName;

      const has = (p: string) =>
        isSuperOrAdmin ||
        rawPerms.some((x: any) => {
          const str = typeof x === "string" ? x : x?.name || "";
          return str.toLowerCase() === p.toLowerCase();
        });

      return {
        canCreate: has("buyer_requirement.create"),
        canUpdate: has("buyer_requirement.update"),
        canDelete: has("buyer_requirement.delete"),
        canViewMatches: has("property_match.view"),
        canMatch: has("property_match.create"),
      };
    } catch {
      return {
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canMatch: true,
        canViewMatches: true,
      };
    }
  }, []);


  // Fetch initial dropdown datasets
  useEffect(() => {
    Promise.all([
      getLeads().catch(() => []),
      getContacts().catch(() => []),
      getUsers().catch(() => []),
      getProperties({ status: "Available", limit: 100 }).catch(() => []),
    ]).then(([leadsData, contactsData, usersData, propsData]) => {
      setLeads(leadsData);
      setContacts(contactsData);
      setUsers(usersData);
      setProperties(propsData);
    });
  }, []);

  const leadMap = useMemo(() => {
    const map = new Map<string, string>();
    leads.forEach((l) => map.set(l.id, l.full_name || l.email || "Lead"));
    return map;
  }, [leads]);

  const contactMap = useMemo(() => {
    const map = new Map<string, string>();
    contacts.forEach((c) => map.set(c.id, c.full_name || c.email || "Contact"));
    return map;
  }, [contacts]);

  const userMap = useMemo(() => {
    const map = new Map<string, string>();
    users.forEach((u) => map.set(u.id, u.full_name || u.email));
    return map;
  }, [users]);

  // Fetch Requirements
  const fetchRequirementsList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getBuyerRequirements();
      setRequirements(data);
    } catch (err: any) {
      console.error("Failed to load buyer requirements:", err);
      setError(formatApiError(err, "Unable to load buyer requirements. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequirementsList();
  }, [fetchRequirementsList]);

  // Summary counts
  const summaryCounts = useMemo(() => {
    const total = requirements.length;
    const active = requirements.filter((r) => r.status !== "Closed").length;
    const matched = requirements.filter((r) => r.status === "Matched").length;
    const pending = requirements.filter(
      (r) => r.status === "New" || r.status === "Qualified"
    ).length;
    return { total, active, matched, pending };
  }, [requirements]);

  // Filtered requirements
  const filteredRequirements = useMemo(() => {
    return requirements.filter((r) => {
      if (typeFilter && r.property_type !== typeFilter) return false;
      if (reqTypeFilter && r.requirement_type !== reqTypeFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (bhkFilter && String(r.bedrooms) !== bhkFilter) return false;
      if (locationFilter) {
        const query = locationFilter.toLowerCase();
        const cityMatch = r.preferred_city?.toLowerCase().includes(query);
        const locMatch = r.preferred_location?.toLowerCase().includes(query);
        if (!cityMatch && !locMatch) return false;
      }
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const buyerName =
          (r.lead_id ? leadMap.get(r.lead_id) : null) ||
          (r.contact_id ? contactMap.get(r.contact_id) : null) ||
          "";
        const inName = buyerName.toLowerCase().includes(query);
        const inPropType = r.property_type.toLowerCase().includes(query);
        const inCity = r.preferred_city?.toLowerCase().includes(query);
        const inLoc = r.preferred_location?.toLowerCase().includes(query);
        if (!inName && !inPropType && !inCity && !inLoc) return false;
      }
      return true;
    });
  }, [requirements, typeFilter, reqTypeFilter, statusFilter, bhkFilter, locationFilter, searchTerm, leadMap, contactMap]);

  // Format price helper
  const formatPrice = (val: number | string, curr = "INR") => {
    const num = Number(val);
    if (isNaN(num)) return `${curr} ${val}`;
    if (curr === "INR") {
      if (num >= 10000000) return `₹ ${(num / 10000000).toFixed(2)} Cr`;
      if (num >= 100000) return `₹ ${(num / 100000).toFixed(2)} Lakh`;
      return `₹ ${num.toLocaleString("en-IN")}`;
    }
    return `${curr} ${num.toLocaleString()}`;
  };

  const formatMatchError = (err: any): string => {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 404 || (typeof detail === "string" && detail.toLowerCase().includes("not found"))) {
      return "This buyer requirement could not be found.";
    }
    if (status === 409 && typeof detail === "string" && detail.toLowerCase().includes("closed")) {
      return "Closed requirements cannot be matched.";
    }
    if (status === 403 || (typeof detail === "string" && detail.toLowerCase().includes("permission"))) {
      return "You don't have permission to match properties.";
    }
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
    return "Unable to find matching properties. Please try again.";
  };

  // Helper to fetch details and photos for property IDs
  const resolvePropertyDetailsAndImages = useCallback(
    async (matchesData: PropertyMatch[], potentialsData: Property[]) => {
      const propertyIds = new Set<string>();
      matchesData.forEach((m) => {
        if (m.property_id) propertyIds.add(m.property_id);
      });
      potentialsData.forEach((p) => {
        if (p.id) propertyIds.add(p.id);
      });

      const newResolved: Record<string, Property> = {};
      potentialsData.forEach((p) => {
        newResolved[p.id] = p;
      });
      properties.forEach((p) => {
        if (propertyIds.has(p.id)) {
          newResolved[p.id] = p;
        }
      });

      const currentResolved = resolvedPropertiesRef.current;
      const missingIds = Array.from(propertyIds).filter(
        (id) => !newResolved[id] && !currentResolved[id]
      );

      if (missingIds.length > 0) {
        try {
          const fetchedProps = await Promise.all(
            missingIds.map((id) => getProperty(id).catch(() => null))
          );
          fetchedProps.forEach((prop) => {
            if (prop) {
              newResolved[prop.id] = prop;
            }
          });
        } catch (fetchErr) {
          console.error("Error fetching property details:", fetchErr);
        }
      }

      if (Object.keys(newResolved).length > 0) {
        setResolvedProperties((prev) => {
          const merged = { ...prev, ...newResolved };
          resolvedPropertiesRef.current = merged;
          return merged;
        });
      }

      const currentImages = propertyImagesMapRef.current;
      const allTargetIds = Array.from(propertyIds);
      const imagesToFetch = allTargetIds.filter((id) => !currentImages[id]);

      if (imagesToFetch.length > 0) {
        imagesToFetch.forEach((propId) => {
          getPropertyImages(propId)
            .then((imgs) => {
              if (imgs && imgs.length > 0) {
                setPropertyImagesMap((prev) => {
                  const updated = { ...prev, [propId]: imgs };
                  propertyImagesMapRef.current = updated;
                  return updated;
                });
              }
            })
            .catch(() => {});
        });
      }
    },
    [properties]
  );

  // Load matches when view modal is open
  const loadMatches = useCallback(
    async (reqId: string) => {
      if (isAutoMatchingRef.current) return;
      setLoadingMatches(true);
      setMatchError(null);
      try {
        const [existingData, potentialData] = await Promise.all([
          getMatchesForRequirement(reqId).catch(() => []),
          getPotentialMatches(reqId).catch(() => []),
        ]);
        setActiveMatches(existingData);
        setPotentialMatches(potentialData);
        await resolvePropertyDetailsAndImages(existingData, potentialData);
      } catch (err: any) {
        console.error("Failed to load matches:", err);
      } finally {
        setLoadingMatches(false);
      }
    },
    [resolvePropertyDetailsAndImages]
  );

  const loadMatchesRef = useRef(loadMatches);
  useEffect(() => {
    loadMatchesRef.current = loadMatches;
  }, [loadMatches]);

  const viewingRequirementId = viewingRequirement?.id;
  useEffect(() => {
    if (viewingRequirementId) {
      loadMatchesRef.current(viewingRequirementId);
    } else {
      setActiveMatches([]);
      setPotentialMatches([]);
      setMatchError(null);
      setIsAutoMatching(false);
      setViewTab("overview");
      setViewingPropertyDetail(null);
      setManualSearch("");
      setManualTypeFilter("");
      setManualBhkFilter("");
      setManualOnlyUnmatched(false);
      setMatchingActionLoading(null);
    }
  }, [viewingRequirementId]);

  const handleAutoMatch = async (requirement: BuyerRequirement) => {
    if (!userPermissions.canMatch) {
      const permMsg = "You don't have permission to match properties.";
      setMatchError(permMsg);
      showToast(permMsg, "error");
      return;
    }

    if (requirement.status === "Closed") {
      const closedMsg = "Closed requirements cannot be matched.";
      setMatchError(closedMsg);
      showToast(closedMsg, "error");
      return;
    }

    isAutoMatchingRef.current = true;
    setIsAutoMatching(true);
    setMatchError(null);

    try {
      // 1. Call Auto-Match API
      const newMatches = await autoMatchProperties(requirement.id);

      // 2. Refresh existing matches
      const existingMatchesData = await getMatchesForRequirement(requirement.id);
      setActiveMatches(existingMatchesData);

      // 3. Refresh potential matches
      const potentialMatchesData = await getPotentialMatches(requirement.id);
      setPotentialMatches(potentialMatchesData);

      // 4. Update requirement status if matched
      if (newMatches.length > 0) {
        setRequirements((prev) =>
          prev.map((r) =>
            r.id === requirement.id && r.status !== "Closed"
              ? { ...r, status: "Matched" }
              : r
          )
        );
        if (viewingRequirement && viewingRequirement.id === requirement.id && viewingRequirement.status !== "Closed") {
          setViewingRequirement((prev) =>
            prev ? { ...prev, status: "Matched" } : prev
          );
        }
        showToast(
          `Found ${newMatches.length} matching propert${newMatches.length > 1 ? "ies" : "y"}!`,
          "success"
        );
      } else {
        showToast("No exact property matches found.", "success");
      }

      // 5. Resolve property details & images
      await resolvePropertyDetailsAndImages(existingMatchesData, potentialMatchesData);

      // Ensure tab is set to matches so user sees results
      setViewTab("matches");
    } catch (err: any) {
      console.error("Auto match failed:", err);
      const errMsg = formatMatchError(err);
      setMatchError(errMsg);
      showToast(errMsg, "error");
    } finally {
      isAutoMatchingRef.current = false;
      setIsAutoMatching(false);
    }
  };

  const handleCardAutoMatch = async (req: BuyerRequirement) => {
    isAutoMatchingRef.current = true;
    setViewingRequirement(req);
    setViewTab("matches");
    await handleAutoMatch(req);
  };

  // Available properties filtered for this requirement's listing type (Buy -> Sale, Rent -> Rent)
  const availablePropertiesForRequirement = useMemo(() => {
    if (!viewingRequirement) return [];
    const expectedListing =
      viewingRequirement.requirement_type === "Buy" ? "Sale" : "Rent";
    return properties.filter(
      (p) => p.status === "Available" && p.listing_type === expectedListing
    );
  }, [viewingRequirement, properties]);

  // Filtered available properties based on user manual search & filters
  const filteredAvailableProperties = useMemo(() => {
    if (!viewingRequirement) return [];
    return availablePropertiesForRequirement.filter((p) => {
      const isMatched = activeMatches.some((m) => m.property_id === p.id);
      if (manualOnlyUnmatched && isMatched) return false;

      if (manualTypeFilter && p.property_type !== manualTypeFilter) return false;
      if (manualBhkFilter) {
        if (manualBhkFilter === "4") {
          if (!p.bedrooms || p.bedrooms < 4) return false;
        } else if (String(p.bedrooms) !== manualBhkFilter) {
          return false;
        }
      }

      if (manualSearch) {
        const q = manualSearch.toLowerCase();
        const inName = p.name?.toLowerCase().includes(q);
        const inCity = p.city?.toLowerCase().includes(q);
        const inAddr = p.address?.toLowerCase().includes(q);
        const inUnit = p.unit_number?.toLowerCase().includes(q);
        const inType = p.property_type?.toLowerCase().includes(q);
        if (!inName && !inCity && !inAddr && !inUnit && !inType) return false;
      }
      return true;
    });
  }, [
    viewingRequirement,
    availablePropertiesForRequirement,
    activeMatches,
    manualOnlyUnmatched,
    manualTypeFilter,
    manualBhkFilter,
    manualSearch,
  ]);

  // Preload property images for candidate available properties
  useEffect(() => {
    if (viewTab === "matches" && viewingRequirement) {
      const candidateIds = filteredAvailableProperties.slice(0, 15).map((p) => p.id);
      candidateIds.forEach((propId) => {
        if (!propertyImagesMapRef.current[propId]) {
          getPropertyImages(propId)
            .then((imgs) => {
              if (imgs && imgs.length > 0) {
                setPropertyImagesMap((prev) => {
                  const updated = { ...prev, [propId]: imgs };
                  propertyImagesMapRef.current = updated;
                  return updated;
                });
              }
            })
            .catch(() => {});
        }
      });
    }
  }, [viewTab, viewingRequirement, filteredAvailableProperties]);

  // Manually match a property to the current buyer requirement
  const handleManualMatch = async (property: Property) => {
    if (!viewingRequirement) return;
    if (!userPermissions.canMatch) {
      const permMsg = "You don't have permission to match properties.";
      setMatchError(permMsg);
      showToast(permMsg, "error");
      return;
    }
    if (viewingRequirement.status === "Closed") {
      const closedMsg = "Closed requirements cannot be matched.";
      setMatchError(closedMsg);
      showToast(closedMsg, "error");
      return;
    }

    setMatchingActionLoading(property.id);
    setMatchError(null);

    try {
      const payload: PropertyMatchCreate = {
        buyer_requirement_id: viewingRequirement.id,
        property_id: property.id,
        assigned_to: viewingRequirement.assigned_to || property.assigned_to || null,
      };

      await createPropertyMatch(payload);

      // Re-fetch existing and potential matches
      const [existingData, potentialData] = await Promise.all([
        getMatchesForRequirement(viewingRequirement.id).catch(() => []),
        getPotentialMatches(viewingRequirement.id).catch(() => []),
      ]);

      setActiveMatches(existingData);
      setPotentialMatches(potentialData);

      // Resolve full property details and images
      await resolvePropertyDetailsAndImages(existingData, potentialData);

      // Update requirement status if it was New / Qualified
      if (viewingRequirement.status !== "Closed") {
        setRequirements((prev) =>
          prev.map((r) =>
            r.id === viewingRequirement.id && r.status !== "Closed"
              ? { ...r, status: "Matched" }
              : r
          )
        );
        setViewingRequirement((prev) =>
          prev && prev.status !== "Closed" ? { ...prev, status: "Matched" } : prev
        );
      }

      showToast(`Property "${property.name}" matched successfully!`, "success");
    } catch (err: any) {
      console.error("Manual match error:", err);
      const detail = err?.response?.data?.detail;
      const msg =
        typeof detail === "string"
          ? detail
          : "Failed to match property. It may already be matched or unavailable.";
      setMatchError(msg);
      showToast(msg, "error");
    } finally {
      setMatchingActionLoading(null);
    }
  };



  // Save Buyer Requirement
  const handleSaveRequirement = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    const formData = new FormData(e.currentTarget);
    const requirement_type = String(formData.get("requirement_type") || "Buy");
    const property_type = String(formData.get("property_type") || "Apartment");
    const preferred_city = String(formData.get("preferred_city") || "").trim() || null;
    const preferred_location = String(formData.get("preferred_location") || "").trim() || null;

    const minB = formData.get("min_budget");
    const min_budget = minB ? Number(minB) : null;
    const maxB = formData.get("max_budget");
    const max_budget = maxB ? Number(maxB) : null;

    const bedVal = formData.get("bedrooms");
    const bedrooms = bedVal !== "" && bedVal !== null ? Number(bedVal) : null;

    const minA = formData.get("min_area");
    const min_area = minA ? Number(minA) : null;
    const maxA = formData.get("max_area");
    const max_area = maxA ? Number(maxA) : null;

    const area_unit = String(formData.get("area_unit") || "sqft");
    const status = String(formData.get("status") || "New");
    const notes = String(formData.get("notes") || "").trim() || null;
    const assigned_to = String(formData.get("assigned_to") || "") || null;

    const lead_id = selectedCustomerId || (editingRequirement?.lead_id ?? null);
    const contact_id = !lead_id ? (editingRequirement?.contact_id || null) : null;

    if (!lead_id && !contact_id) {
      setFormError("Please select a Lead to associate with this requirement.");
      setSubmitting(false);
      return;
    }

    if (min_budget !== null && max_budget !== null && min_budget > max_budget) {
      setFormError("Minimum budget cannot exceed maximum budget.");
      setSubmitting(false);
      return;
    }

    if (min_area !== null && max_area !== null && min_area > max_area) {
      setFormError("Minimum area cannot exceed maximum area.");
      setSubmitting(false);
      return;
    }

    try {
      if (editingRequirement) {
        const payload: BuyerRequirementUpdate = {
          requirement_type,
          property_type,
          preferred_city,
          preferred_location,
          min_budget,
          max_budget,
          bedrooms,
          min_area,
          max_area,
          area_unit,
          status,
          notes,
          lead_id,
          contact_id,
          assigned_to,
        };
        const updated = await updateBuyerRequirement(editingRequirement.id, payload);
        setRequirements((prev) =>
          prev.map((item) => (item.id === updated.id ? updated : item))
        );
        showToast("Buyer requirement updated successfully!");
      } else {
        const payload: BuyerRequirementCreate = {
          requirement_type,
          property_type,
          preferred_city,
          preferred_location,
          min_budget,
          max_budget,
          bedrooms,
          min_area,
          max_area,
          area_unit,
          status,
          notes,
          lead_id,
          contact_id,
          assigned_to,
        };
        const created = await createBuyerRequirement(payload);
        setRequirements((prev) => [created, ...prev]);
        showToast("Buyer requirement created successfully!");
      }
      setIsFormOpen(false);
      setEditingRequirement(null);
    } catch (err: any) {
      console.error("Save buyer requirement error:", err);
      const detail = err?.response?.data?.detail;
      setFormError(
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
          ? detail.map((d: any) => d.msg).join(", ")
          : "Failed to save requirement. Please check inputs."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Delete Buyer Requirement
  const handleDeleteConfirm = async () => {
    if (!deletingRequirement) return;
    setSubmitting(true);
    try {
      await deleteBuyerRequirement(deletingRequirement.id);
      setRequirements((prev) => prev.filter((r) => r.id !== deletingRequirement.id));
      showToast("Buyer requirement deleted successfully!");
      setDeletingRequirement(null);
    } catch (err: any) {
      console.error("Delete requirement error:", err);
      showToast(err?.response?.data?.detail || "Failed to delete requirement.", "error");
    } finally {
      setSubmitting(false);
    }
  };


  // Format budget helper
  const formatBudget = (min?: number | string | null, max?: number | string | null) => {
    const minN = min !== null && min !== undefined ? Number(min) : null;
    const maxN = max !== null && max !== undefined ? Number(max) : null;

    const fmt = (n: number) => {
      if (n >= 10000000) return `₹ ${(n / 10000000).toFixed(2)} Cr`;
      if (n >= 100000) return `₹ ${(n / 100000).toFixed(2)} Lakh`;
      return `₹ ${n.toLocaleString("en-IN")}`;
    };

    if (minN !== null && maxN !== null) {
      return `${fmt(minN)} - ${fmt(maxN)}`;
    }
    if (minN !== null) return `Min ${fmt(minN)}`;
    if (maxN !== null) return `Up to ${fmt(maxN)}`;
    return "Budget Flexible";
  };

  // Format area helper
  const formatArea = (min?: number | string | null, max?: number | string | null, unit: string = "sqft") => {
    if (min && max) return `${min} - ${max} ${unit}`;
    if (min) return `Min ${min} ${unit}`;
    if (max) return `Up to ${max} ${unit}`;
    return "Any Area";
  };

  // Resolve buyer name
  const getBuyerName = (r: BuyerRequirement) => {
    if (r.lead_id) return leadMap.get(r.lead_id) || "Lead Buyer";
    if (r.contact_id) return contactMap.get(r.contact_id) || "Buyer";
    return "Unassigned Buyer";
  };

  return (
    <div className="requirements-page">
      {/* Toast Notification */}
      {toastMessage && (
        <div className={`crm-toast ${toastMessage.type}`}>
          {toastMessage.type === "success" ? "✓ " : "✕ "}
          {toastMessage.text}
        </div>
      )}

      {/* ─── 1. Header ─── */}
      <div className="requirements-header">
        <div className="header-titles">
          <div className="title-row">
            <h1>Buyer Requirements</h1>
            <span className="count-chip">{requirements.length} Total</span>
          </div>
          <p className="subtitle">
            Manage buyer preferences and property requirements.
          </p>
        </div>

        <div className="header-actions">
          {/* View Mode Toggle */}
          <div className="view-mode-toggle">
            <button
              className={`toggle-btn ${viewMode === "grid" ? "active" : ""}`}
              onClick={() => setViewMode("grid")}
              title="Grid View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
              Grid
            </button>
            <button
              className={`toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Table View"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <line x1="8" y1="6" x2="21" y2="6"></line>
                <line x1="8" y1="12" x2="21" y2="12"></line>
                <line x1="8" y1="18" x2="21" y2="18"></line>
                <line x1="3" y1="6" x2="3.01" y2="6"></line>
                <line x1="3" y1="12" x2="3.01" y2="12"></line>
                <line x1="3" y1="18" x2="3.01" y2="18"></line>
              </svg>
              Table
            </button>
          </div>

          {userPermissions.canCreate && (
            <button
              className="btn-add-requirement"
              onClick={() => {
                setEditingRequirement(null);
                setSelectedCustomerId(leads[0]?.id || "");
                setFormError(null);
                setIsFormOpen(true);
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              Add Requirement
            </button>
          )}
        </div>
      </div>

      {/* ─── 2. Summary Cards ─── */}
      <div className="requirements-summary-grid">
        <div className="kpi-card blue">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Total Requirements</span>
            <span className="kpi-value">{summaryCounts.total}</span>
          </div>
        </div>

        <div className="kpi-card green">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Active Requirements</span>
            <span className="kpi-value">{summaryCounts.active}</span>
          </div>
        </div>

        <div className="kpi-card purple">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Matched</span>
            <span className="kpi-value">{summaryCounts.matched}</span>
          </div>
        </div>

        <div className="kpi-card amber">
          <div className="kpi-icon-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div className="kpi-text-box">
            <span className="kpi-label">Pending</span>
            <span className="kpi-value">{summaryCounts.pending}</span>
          </div>
        </div>
      </div>

      {/* ─── 3. Filter Toolbar ─── */}
      <div className="requirements-filter-container">
        <div className="filter-search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="text"
            placeholder="Search requirements..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              className="clear-search-btn"
              onClick={() => setSearchTerm("")}
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <div className="filter-dropdowns-group">
          <select
            className="filter-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="">All Property Types</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={reqTypeFilter}
            onChange={(e) => setReqTypeFilter(e.target.value)}
          >
            <option value="">All Types (Buy/Rent)</option>
            {REQUIREMENT_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {rt}
              </option>
            ))}
          </select>

          <select
            className="filter-select"
            value={bhkFilter}
            onChange={(e) => setBhkFilter(e.target.value)}
          >
            <option value="">All BHK</option>
            <option value="1">1 BHK</option>
            <option value="2">2 BHK</option>
            <option value="3">3 BHK</option>
            <option value="4">4+ BHK</option>
          </select>

          <input
            type="text"
            className="filter-input"
            placeholder="Location..."
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          />

          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            {BUYER_REQUIREMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {(searchTerm || typeFilter || reqTypeFilter || bhkFilter || locationFilter || statusFilter) && (
            <button
              className="btn-clear-filters"
              onClick={() => {
                setSearchTerm("");
                setTypeFilter("");
                setReqTypeFilter("");
                setBhkFilter("");
                setLocationFilter("");
                setStatusFilter("");
              }}
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      {/* ─── 4. Main Content Area ─── */}
      {loading ? (
        <div className="requirements-loading-state">
          <div className="spinner"></div>
          <p style={{ margin: 0, color: "#64748b", fontWeight: 500 }}>
            Loading buyer requirements...
          </p>
        </div>
      ) : error ? (
        <div className="requirements-error-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" width="32" height="32" style={{ margin: "0 auto 12px" }}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h3 style={{ margin: "0 0 6px", color: "#dc2626" }}>Unable to load requirements</h3>
          <p style={{ margin: "0 0 16px", color: "#64748b" }}>{error}</p>
          <button className="btn-secondary" onClick={() => fetchRequirementsList()}>
            Retry
          </button>
        </div>
      ) : filteredRequirements.length === 0 ? (
        <div className="requirements-empty-card">
          <div className="empty-requirement-art">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </div>
          <h3>No requirements found</h3>
          <p>
            {searchTerm || typeFilter || reqTypeFilter || bhkFilter || locationFilter || statusFilter
              ? "No buyer requirements match your filter criteria. Try resetting filters."
              : "Create your first buyer requirement to start matching leads with properties."}
          </p>
          {userPermissions.canCreate && (
            <button
              className="btn-add-requirement"
              onClick={() => {
                setEditingRequirement(null);
                setSelectedCustomerId(leads[0]?.id || "");
                setFormError(null);
                setIsFormOpen(true);
              }}
            >
              + Add Requirement
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        /* ─── Grid View ─── */
        <div className="requirements-grid">
          {filteredRequirements.map((r) => {
            const buyerName = getBuyerName(r);
            const statusClass =
              r.status === "New"
                ? "badge-new"
                : r.status === "Qualified"
                ? "badge-qualified"
                : r.status === "Matched"
                ? "badge-matched"
                : "badge-closed";

            return (
              <div key={r.id} className="requirement-card">
                <div className="card-top-accent" />
                <div className="requirement-card-top">
                  <div className="buyer-pill">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                      <circle cx="12" cy="7" r="4"></circle>
                    </svg>
                    <span>Lead</span>
                  </div>
                  <span className={`badge ${statusClass}`}>{r.status}</span>
                </div>

                <div className="requirement-lead-info">
                  <h3 className="buyer-name-title" title={buyerName}>{buyerName}</h3>

                  <div className="requirement-meta-row">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                      <circle cx="12" cy="10" r="3"></circle>
                    </svg>
                    <span>
                      {r.preferred_city || "Any City"}
                      {r.preferred_location ? ` • ${r.preferred_location}` : ""}
                    </span>
                  </div>
                </div>

                <div className="requirement-budget-box">
                  <div className="budget-meta">
                    <span className="budget-badge-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
                        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
                        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path>
                      </svg>
                    </span>
                    <span className="budget-label">Budget</span>
                  </div>
                  <span className="budget-val">{formatBudget(r.min_budget, r.max_budget)}</span>
                </div>

                <div className="requirement-specs-grid">
                  <div className="req-spec-item spec-type">
                    <span className="label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                      </svg>
                      Type
                    </span>
                    <span className="val">
                      <span className={`type-tag type-${(r.requirement_type || "").toLowerCase()}`}>
                        {r.requirement_type}
                      </span>
                      <span className="type-sep">•</span>
                      <span className="prop-val">{r.property_type}</span>
                    </span>
                  </div>
                  <div className="req-spec-item spec-bhk">
                    <span className="label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                        <path d="M2 4v16"></path>
                        <path d="M2 8h18a2 2 0 0 1 2 2v10"></path>
                        <path d="M2 17h20"></path>
                        <path d="M6 8v9"></path>
                      </svg>
                      Bedrooms
                    </span>
                    <span className="val bhk-val">{r.bedrooms ? `${r.bedrooms} BHK` : "Any"}</span>
                  </div>
                  <div className="req-spec-item spec-area">
                    <span className="label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                        <path d="M21 3H3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"></path>
                        <polyline points="9 3 9 21"></polyline>
                      </svg>
                      Area
                    </span>
                    <span className="val">{formatArea(r.min_area, r.max_area, r.area_unit)}</span>
                  </div>
                  <div className="req-spec-item spec-agent">
                    <span className="label">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="11" height="11">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                      Agent
                    </span>
                    <span className="val agent-val" title={r.assigned_to ? userMap.get(r.assigned_to) || "Assigned" : "Unassigned"}>
                      {r.assigned_to ? userMap.get(r.assigned_to) || "Assigned" : "Unassigned"}
                    </span>
                  </div>
                </div>

                <div className="requirement-card-footer">
                  <div className="card-created-meta" title={`Created on ${new Date(r.created_at).toLocaleDateString()}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
                      <circle cx="12" cy="12" r="10"></circle>
                      <polyline points="12 6 12 12 16 14"></polyline>
                    </svg>
                    <span>Created: {new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>

                  <div className="action-buttons-group">
                    {userPermissions.canMatch && r.status !== "Closed" && (
                      <>
                        <button
                          type="button"
                          className="btn-auto-match-mini"
                          title="Find Matching Properties (Auto Match)"
                          onClick={() => handleCardAutoMatch(r)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                          </svg>
                          <span>Auto Match</span>
                        </button>

                        <button
                          type="button"
                          className="btn-manual-match-mini"
                          title="Manually Match Properties"
                          onClick={() => {
                            setViewingRequirement(r);
                            setViewTab("matches");
                            setTimeout(() => {
                              const el = document.getElementById("manual-matching-section");
                              if (el) el.scrollIntoView({ behavior: "smooth" });
                            }, 120);
                          }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                          </svg>
                          <span>Manual Match</span>
                        </button>
                      </>
                    )}

                    <button
                      className="btn-action-icon"
                      title="View Details & Matches"
                      onClick={() => setViewingRequirement(r)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    </button>

                    {userPermissions.canUpdate && (
                      <button
                        className="btn-action-icon"
                        title="Edit Requirement"
                        onClick={() => {
                          setEditingRequirement(r);
                          setSelectedCustomerId((r.lead_id || "") as string);
                          setFormError(null);
                          setIsFormOpen(true);
                        }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                    )}

                    {userPermissions.canDelete && (
                      <button
                        className="btn-action-icon delete"
                        title="Delete Requirement"
                        onClick={() => setDeletingRequirement(r)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ─── Table View ─── */
        <div className="requirements-table-container">
          <table className="requirements-table">
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Requirement</th>
                <th>Location</th>
                <th>Budget</th>
                <th>Specs</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequirements.map((r) => {
                const buyerName = getBuyerName(r);
                const statusClass =
                  r.status === "New"
                    ? "badge-new"
                    : r.status === "Qualified"
                    ? "badge-qualified"
                    : r.status === "Matched"
                    ? "badge-matched"
                    : "badge-closed";

                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{buyerName}</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        Lead
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>
                        {r.requirement_type} • {r.property_type}
                      </div>
                    </td>
                    <td>
                      <div>{r.preferred_city || "Any City"}</div>
                      {r.preferred_location && (
                        <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          {r.preferred_location}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: "#059669" }}>
                        {formatBudget(r.min_budget, r.max_budget)}
                      </div>
                    </td>
                    <td>
                      <div>{r.bedrooms ? `${r.bedrooms} BHK` : "Any BHK"}</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>
                        {formatArea(r.min_area, r.max_area, r.area_unit)}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${statusClass}`}>{r.status}</span>
                    </td>
                    <td>
                      <div className="action-buttons-group" style={{ justifyContent: "flex-end" }}>
                        {userPermissions.canMatch && r.status !== "Closed" && (
                          <>
                            <button
                              type="button"
                              className="btn-action-icon match"
                              title="Find Matching Properties (Auto Match)"
                              onClick={() => handleCardAutoMatch(r)}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                              </svg>
                            </button>

                            <button
                              type="button"
                              className="btn-action-icon manual-match"
                              title="Manually Match Properties"
                              onClick={() => {
                                setViewingRequirement(r);
                                setViewTab("matches");
                                setTimeout(() => {
                                  const el = document.getElementById("manual-matching-section");
                                  if (el) el.scrollIntoView({ behavior: "smooth" });
                                }, 120);
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="12" y1="5" x2="12" y2="19"></line>
                                <line x1="5" y1="12" x2="19" y2="12"></line>
                              </svg>
                            </button>
                          </>
                        )}

                        <button
                          className="btn-action-icon"
                          title="View Details & Matches"
                          onClick={() => setViewingRequirement(r)}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                          </svg>
                        </button>


                        {userPermissions.canUpdate && (
                          <button
                            className="btn-action-icon"
                            title="Edit Requirement"
                            onClick={() => {
                              setEditingRequirement(r);
                              setSelectedCustomerId((r.lead_id || "") as string);
                              setFormError(null);
                              setIsFormOpen(true);
                            }}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                        )}

                        {userPermissions.canDelete && (
                          <button
                            className="btn-action-icon delete"
                            title="Delete Requirement"
                            onClick={() => setDeletingRequirement(r)}
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── Add / Edit Modal ─── */}
      {isFormOpen && (
        <div className="modal-overlay" onClick={() => setIsFormOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingRequirement ? "Edit Requirement" : "Add Buyer Requirement"}</h2>
              <button className="modal-close-btn" onClick={() => setIsFormOpen(false)}>
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveRequirement} style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
              <div className="modal-body">
                {formError && (
                  <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "10px 14px", borderRadius: "8px", marginBottom: "16px", fontSize: "0.85rem", fontWeight: 500 }}>
                    {formError}
                  </div>
                )}

                {/* Associated Lead Selection */}
                <div className="form-group">
                  <label>Associated Lead *</label>
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Select a Lead
                    </option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.full_name} ({l.email || l.phone || "No contact info"})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Requirement Type *</label>
                    <select
                      name="requirement_type"
                      defaultValue={editingRequirement?.requirement_type || "Buy"}
                      required
                    >
                      {REQUIREMENT_TYPES.map((rt) => (
                        <option key={rt} value={rt}>
                          {rt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Property Type *</label>
                    <select
                      name="property_type"
                      defaultValue={editingRequirement?.property_type || "Apartment"}
                      required
                    >
                      {PROPERTY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Preferred City</label>
                    <input
                      type="text"
                      name="preferred_city"
                      defaultValue={editingRequirement?.preferred_city || ""}
                      placeholder="e.g. Mumbai, Bangalore..."
                    />
                  </div>
                  <div className="form-group">
                    <label>Preferred Location / Suburb</label>
                    <input
                      type="text"
                      name="preferred_location"
                      defaultValue={editingRequirement?.preferred_location || ""}
                      placeholder="e.g. Whitefield, Bandra West..."
                    />
                  </div>
                </div>

                <div className="form-grid-2">
                  <div className="form-group">
                    <label>Min Budget (INR)</label>
                    <input
                      type="number"
                      name="min_budget"
                      min="0"
                      step="any"
                      defaultValue={editingRequirement?.min_budget ?? ""}
                      placeholder="Min budget"
                    />
                  </div>
                  <div className="form-group">
                    <label>Max Budget (INR)</label>
                    <input
                      type="number"
                      name="max_budget"
                      min="0"
                      step="any"
                      defaultValue={editingRequirement?.max_budget ?? ""}
                      placeholder="Max budget"
                    />
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>Bedrooms (BHK)</label>
                    <input
                      type="number"
                      name="bedrooms"
                      min="0"
                      max="100"
                      defaultValue={editingRequirement?.bedrooms ?? ""}
                      placeholder="e.g. 3"
                    />
                  </div>
                  <div className="form-group">
                    <label>Min Area</label>
                    <input
                      type="number"
                      name="min_area"
                      min="0"
                      step="any"
                      defaultValue={editingRequirement?.min_area ?? ""}
                      placeholder="Min area"
                    />
                  </div>
                  <div className="form-group">
                    <label>Max Area</label>
                    <input
                      type="number"
                      name="max_area"
                      min="0"
                      step="any"
                      defaultValue={editingRequirement?.max_area ?? ""}
                      placeholder="Max area"
                    />
                  </div>
                </div>

                <div className="form-grid-3">
                  <div className="form-group">
                    <label>Area Unit</label>
                    <select
                      name="area_unit"
                      defaultValue={editingRequirement?.area_unit || "sqft"}
                    >
                      {AREA_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select
                      name="status"
                      defaultValue={editingRequirement?.status || "New"}
                    >
                      {BUYER_REQUIREMENT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Assigned Agent</label>
                    <select
                      name="assigned_to"
                      defaultValue={editingRequirement?.assigned_to || ""}
                    >
                      <option value="">Unassigned</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name || u.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes / Buyer Preferences</label>
                  <textarea
                    name="notes"
                    defaultValue={editingRequirement?.notes || ""}
                    placeholder="Enter special requirements: vastu compliant, high floor, park view..."
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsFormOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submitting}>
                  {submitting ? "Saving..." : editingRequirement ? "Save Changes" : "Create Requirement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── View Requirement & Matches Modal ─── */}
      {viewingRequirement && (
        <div className="modal-overlay" onClick={() => setViewingRequirement(null)}>
          <div
            className={`modal-card ${viewTab === "matches" ? "matches-view-modal" : ""}`}
            style={{ maxWidth: viewTab === "matches" ? "920px" : "780px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>{getBuyerName(viewingRequirement)}</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  Preference: For {viewingRequirement.requirement_type} • {viewingRequirement.property_type}
                </div>
              </div>
              <button className="modal-close-btn" onClick={() => setViewingRequirement(null)}>
                &times;
              </button>
            </div>

            <div className="modal-tabs" style={{ display: "flex", gap: "12px", padding: "0 24px", borderBottom: "1px solid #e2e8f0" }}>
              <button
                className={`modal-tab-btn ${viewTab === "overview" ? "active" : ""}`}
                onClick={() => setViewTab("overview")}
              >
                Requirement Specs
              </button>
              <button
                className={`modal-tab-btn ${viewTab === "matches" ? "active" : ""}`}
                onClick={() => setViewTab("matches")}
              >
                Property Matches ({activeMatches.length})
              </button>
            </div>

            <div className="modal-body">
              {viewTab === "overview" ? (
                <div>
                  <div className="details-spec-grid">
                    <div className="details-spec-item">
                      <div className="label">Budget Range</div>
                      <div className="value" style={{ color: "#059669", fontWeight: 700 }}>
                        {formatBudget(viewingRequirement.min_budget, viewingRequirement.max_budget)}
                      </div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Property Type</div>
                      <div className="value">{viewingRequirement.property_type}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Status</div>
                      <div className="value">{viewingRequirement.status}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Preferred City</div>
                      <div className="value">{viewingRequirement.preferred_city || "Any City"}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Location</div>
                      <div className="value">{viewingRequirement.preferred_location || "Flexible"}</div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Bedrooms</div>
                      <div className="value">
                        {viewingRequirement.bedrooms ? `${viewingRequirement.bedrooms} BHK` : "Flexible"}
                      </div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Area Requirement</div>
                      <div className="value">
                        {formatArea(viewingRequirement.min_area, viewingRequirement.max_area, viewingRequirement.area_unit)}
                      </div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Assigned Agent</div>
                      <div className="value">
                        {viewingRequirement.assigned_to ? userMap.get(viewingRequirement.assigned_to) || "Assigned" : "Unassigned"}
                      </div>
                    </div>
                    <div className="details-spec-item">
                      <div className="label">Created Date</div>
                      <div className="value">
                        {new Date(viewingRequirement.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {viewingRequirement.notes && (
                    <div style={{ marginTop: "16px" }}>
                      <h4 style={{ margin: "0 0 6px", fontSize: "0.825rem", textTransform: "uppercase", color: "#64748b" }}>
                        Buyer Notes
                      </h4>
                      <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.5", color: "inherit" }}>
                        {viewingRequirement.notes}
                      </p>
                    </div>
                  )}

                  {/* Auto-Matching Banner / CTA on Specs View */}
                  <div className="specs-matching-cta-card">
                    <div className="cta-content">
                      <div className="cta-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                        </svg>
                      </div>
                      <div className="cta-text">
                        <h4>Automated Property Matching</h4>
                        <p>
                          {activeMatches.length > 0
                            ? `${activeMatches.length} exact match${activeMatches.length > 1 ? "es" : ""} and ${potentialMatches.length} near-budget propert${potentialMatches.length > 1 ? "ies" : "y"} currently matched.`
                            : "Instantly scan inventory to find matching and near-budget properties for this buyer."}
                        </p>
                      </div>
                    </div>

                    <div className="cta-actions">
                      {userPermissions.canMatch && viewingRequirement.status !== "Closed" && (
                        <button
                          type="button"
                          className="btn-primary"
                          disabled={isAutoMatching}
                          onClick={() => handleAutoMatch(viewingRequirement)}
                        >
                          {isAutoMatching ? (
                            <>
                              <div className="spinner-sm"></div>
                              <span>Finding matching properties...</span>
                            </>
                          ) : (
                            <>
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                              </svg>
                              <span>Find Matching Properties</span>
                            </>
                          )}
                        </button>
                      )}

                      {activeMatches.length > 0 && (
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => setViewTab("matches")}
                        >
                          View Matches ({activeMatches.length})
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Matches Tab */
                <div>
                  {!userPermissions.canViewMatches ? (
                    <div className="match-error-banner">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      <span>You don't have permission to view property matches.</span>
                    </div>
                  ) : (
                    <>
                      {/* Top Action Header */}
                      <div className="matches-tab-header">
                        <div>
                          <h3>Property Matches ({activeMatches.length})</h3>
                          <p className="matches-tab-subtitle">
                            Auto-matched properties matching Buy/Rent type, property type, location, bedrooms, area, and budget.
                          </p>
                        </div>

                        <div className="matches-header-actions">
                          {userPermissions.canMatch && viewingRequirement.status !== "Closed" && (
                            <>
                              <button
                                type="button"
                                className="btn-manual-match-header"
                                onClick={() => {
                                  const el = document.getElementById("manual-matching-section");
                                  if (el) el.scrollIntoView({ behavior: "smooth" });
                                }}
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="15" height="15">
                                  <line x1="12" y1="5" x2="12" y2="19"></line>
                                  <line x1="5" y1="12" x2="19" y2="12"></line>
                                </svg>
                                <span>Manually Match Property</span>
                              </button>

                              <button
                                type="button"
                                className="btn-auto-match"
                                disabled={isAutoMatching}
                                onClick={() => handleAutoMatch(viewingRequirement)}
                              >
                                {isAutoMatching ? (
                                  <>
                                    <div className="spinner-sm"></div>
                                    <span>Finding matching properties...</span>
                                  </>
                                ) : (
                                  <>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                    </svg>
                                    <span>Find Matching Properties</span>
                                  </>
                                )}
                              </button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Match Error Banner */}
                      {matchError && (
                        <div className="match-error-banner">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                          </svg>
                          <span>{matchError}</span>
                        </div>
                      )}

                      {/* Loading State */}
                      {isAutoMatching || loadingMatches ? (
                        <div className="matching-loading-state">
                          <div className="spinner"></div>
                          <h4>
                            {isAutoMatching
                              ? "Finding matching properties..."
                              : "Loading matched properties..."}
                          </h4>
                          <p>
                            {isAutoMatching
                              ? "Scanning property inventory to find exact and near-budget matches..."
                              : "Retrieving matched properties and details..."}
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* ─── 1. Exact Matches Section ─── */}
                          <div className="matches-group-section">
                            <div className="matches-section-header">
                              <div className="matches-section-title-row">
                                <span className="match-group-tag exact">Exact Match</span>
                                <h4 className="matches-section-title">
                                  Property Matches ({activeMatches.length})
                                </h4>
                              </div>
                              <span className="matches-section-caption">
                                Properties meeting all requirement specifications (Type, City, Location, Budget & Specs)
                              </span>
                            </div>

                            {activeMatches.length === 0 ? (
                              <div className="no-matches-box">
                                <div className="no-matches-icon">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <circle cx="11" cy="11" r="8"></circle>
                                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                    <line x1="8" y1="11" x2="14" y2="11"></line>
                                  </svg>
                                </div>
                                <p className="no-matches-primary-text">No exact property matches found.</p>
                                <p className="no-matches-secondary-text">
                                  {viewingRequirement.status === "Closed"
                                    ? "Closed requirements cannot be matched."
                                    : "Click 'Find Matching Properties' above or manually select available properties below."}
                                </p>
                              </div>
                            ) : (
                              <div className="matched-properties-grid">
                                {activeMatches.map((m) => {
                                  const prop =
                                    resolvedProperties[m.property_id] ||
                                    properties.find((p) => p.id === m.property_id);
                                  if (!prop) {
                                    return (
                                      <div key={m.id} className="property-card-loading">
                                        <div className="spinner-sm"></div>
                                        <span>Loading property details...</span>
                                      </div>
                                    );
                                  }
                                  const cardImages = propertyImagesMap[prop.id] || [];
                                  return (
                                    <PropertyCard
                                      key={m.id}
                                      property={prop}
                                      images={cardImages}
                                      matchType="exact"
                                      matchLabel="Matched"
                                      formatPrice={formatPrice}
                                      onView={setViewingPropertyDetail}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* ─── 2. Potential Matches Section ─── */}
                          <div className="matches-group-section" style={{ marginTop: "32px" }}>
                            <div className="matches-section-header">
                              <div className="matches-section-title-row">
                                <span className="match-group-tag potential">Potential Match</span>
                                <h4 className="matches-section-title">
                                  Potential Matches ({potentialMatches.length})
                                </h4>
                              </div>
                              <span className="matches-section-caption">
                                Properties matching type and location with budget close to requirement (within ±10% range)
                              </span>
                            </div>

                            {potentialMatches.length === 0 ? (
                              <div className="no-matches-box potential-empty">
                                <p className="no-matches-primary-text">No potential matches found near budget.</p>
                                <p className="no-matches-secondary-text">
                                  Properties with budgets exceeding ±10% margin will not be listed.
                                </p>
                              </div>
                            ) : (
                              <div className="matched-properties-grid">
                                {potentialMatches.map((prop) => {
                                  const cardImages = propertyImagesMap[prop.id] || [];
                                  return (
                                    <PropertyCard
                                      key={prop.id}
                                      property={prop}
                                      images={cardImages}
                                      matchType="potential"
                                      matchLabel="Near Budget"
                                      formatPrice={formatPrice}
                                      onView={setViewingPropertyDetail}
                                      onMatch={
                                        userPermissions.canMatch && viewingRequirement.status !== "Closed"
                                          ? handleManualMatch
                                          : undefined
                                      }
                                      isMatching={matchingActionLoading === prop.id}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* ─── 3. Manually Match Available Properties Section ─── */}
                          <div id="manual-matching-section" className="matches-group-section manual-match-container" style={{ marginTop: "36px" }}>
                            <div className="matches-section-header">
                              <div className="matches-section-title-row">
                                <span className="match-group-tag manual">Manual Match</span>
                                <h4 className="matches-section-title">
                                  Manually Match Available Properties ({filteredAvailableProperties.length})
                                </h4>
                              </div>
                              <span className="matches-section-caption">
                                Select and manually link any available {viewingRequirement.requirement_type === "Buy" ? "sale" : "rental"} property in your inventory directly to this requirement.
                              </span>
                            </div>

                            {/* Manual match search & filters */}
                            <div className="manual-match-toolbar">
                              <div className="manual-search-box">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                                  <circle cx="11" cy="11" r="8"></circle>
                                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                </svg>
                                <input
                                  type="text"
                                  placeholder="Search by property name, code, location, city..."
                                  value={manualSearch}
                                  onChange={(e) => setManualSearch(e.target.value)}
                                />
                                {manualSearch && (
                                  <button
                                    type="button"
                                    className="btn-clear-search"
                                    onClick={() => setManualSearch("")}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>

                              <div className="manual-filter-row">
                                <select
                                  value={manualTypeFilter}
                                  onChange={(e) => setManualTypeFilter(e.target.value)}
                                  className="manual-filter-select"
                                >
                                  <option value="">All Property Types</option>
                                  {PROPERTY_TYPES.map((t) => (
                                    <option key={t} value={t}>
                                      {t}
                                    </option>
                                  ))}
                                </select>

                                <select
                                  value={manualBhkFilter}
                                  onChange={(e) => setManualBhkFilter(e.target.value)}
                                  className="manual-filter-select"
                                >
                                  <option value="">All Bedrooms</option>
                                  <option value="1">1 BHK</option>
                                  <option value="2">2 BHK</option>
                                  <option value="3">3 BHK</option>
                                  <option value="4">4+ BHK</option>
                                </select>

                                <label className="manual-unmatched-toggle">
                                  <input
                                    type="checkbox"
                                    checked={manualOnlyUnmatched}
                                    onChange={(e) => setManualOnlyUnmatched(e.target.checked)}
                                  />
                                  <span>Hide Already Matched</span>
                                </label>
                              </div>
                            </div>

                            {filteredAvailableProperties.length === 0 ? (
                              <div className="no-matches-box">
                                <p className="no-matches-primary-text">No available properties match your search.</p>
                                <p className="no-matches-secondary-text">
                                  {availablePropertiesForRequirement.length === 0
                                    ? `There are currently no available properties listed for ${viewingRequirement.requirement_type === "Buy" ? "Sale" : "Rent"}.`
                                    : "Try clearing search filters or uncheck 'Hide Already Matched'."}
                                </p>
                              </div>
                            ) : (
                              <div className="matched-properties-grid">
                                {filteredAvailableProperties.map((prop) => {
                                  const cardImages = propertyImagesMap[prop.id] || [];
                                  const isAlreadyMatched = activeMatches.some((m) => m.property_id === prop.id);
                                  return (
                                    <PropertyCard
                                      key={prop.id}
                                      property={prop}
                                      images={cardImages}
                                      matchType={isAlreadyMatched ? "exact" : "manual"}
                                      matchLabel={isAlreadyMatched ? "Matched" : "Available"}
                                      formatPrice={formatPrice}
                                      onView={setViewingPropertyDetail}
                                      onMatch={
                                        userPermissions.canMatch && viewingRequirement.status !== "Closed"
                                          ? handleManualMatch
                                          : undefined
                                      }
                                      isMatched={isAlreadyMatched}
                                      isMatching={matchingActionLoading === prop.id}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </div>


                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setViewingRequirement(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Property Detail Preview Modal ─── */}
      {viewingPropertyDetail && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1100 }}
          onClick={() => setViewingPropertyDetail(null)}
        >
          <div
            className="modal-card"
            style={{ maxWidth: "720px" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h2>{viewingPropertyDetail.name}</h2>
                <div style={{ fontSize: "0.85rem", color: "#64748b" }}>
                  {viewingPropertyDetail.unit_number ? `Unit ${viewingPropertyDetail.unit_number} • ` : ""}
                  {viewingPropertyDetail.city}, {viewingPropertyDetail.state}
                </div>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setViewingPropertyDetail(null)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              {/* Photo Gallery if images exist */}
              {(propertyImagesMap[viewingPropertyDetail.id]?.length ?? 0) > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                    gap: "10px",
                    marginBottom: "18px",
                  }}
                >
                  {(propertyImagesMap[viewingPropertyDetail.id] || []).map((img) => (
                      <div
                        key={img.id}
                        style={{
                          height: "90px",
                          borderRadius: "8px",
                          overflow: "hidden",
                          background: "#f1f5f9",
                        }}
                      >
                        <img
                          src={resolveImageUrl(img.image_url)}
                          alt="Property"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                          }}
                          onError={handleImageError}
                        />
                      </div>
                    ))}
                  </div>
                )}

              <div className="details-spec-grid">
                <div className="details-spec-item">
                  <div className="label">Price</div>
                  <div className="value" style={{ color: "#059669", fontWeight: 700 }}>
                    {formatPrice(viewingPropertyDetail.price, viewingPropertyDetail.currency)}
                  </div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Listing Type</div>
                  <div className="value">{viewingPropertyDetail.listing_type}</div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Property Type</div>
                  <div className="value">{viewingPropertyDetail.property_type}</div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Bedrooms</div>
                  <div className="value">
                    {viewingPropertyDetail.bedrooms ? `${viewingPropertyDetail.bedrooms} BHK` : "N/A"}
                  </div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Bathrooms</div>
                  <div className="value">
                    {viewingPropertyDetail.bathrooms ? `${viewingPropertyDetail.bathrooms} Baths` : "N/A"}
                  </div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Area</div>
                  <div className="value">
                    {viewingPropertyDetail.area
                      ? `${viewingPropertyDetail.area} ${viewingPropertyDetail.area_unit}`
                      : "N/A"}
                  </div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Status</div>
                  <div className="value">{viewingPropertyDetail.status}</div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Furnishing</div>
                  <div className="value">{viewingPropertyDetail.furnishing || "Unfurnished"}</div>
                </div>
                <div className="details-spec-item">
                  <div className="label">Address</div>
                  <div className="value">{viewingPropertyDetail.address}</div>
                </div>
              </div>

              {viewingPropertyDetail.description && (
                <div style={{ marginTop: "16px" }}>
                  <h4 style={{ margin: "0 0 6px", fontSize: "0.825rem", textTransform: "uppercase", color: "#64748b" }}>
                    Description
                  </h4>
                  <p style={{ margin: 0, fontSize: "0.925rem", lineHeight: "1.5" }}>
                    {viewingPropertyDetail.description}
                  </p>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setViewingPropertyDetail(null)}
              >
                Back to Matches
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Delete Confirmation Modal ─── */}
      {deletingRequirement && (
        <div className="modal-overlay" onClick={() => setDeletingRequirement(null)}>
          <div className="modal-card" style={{ maxWidth: "450px" }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Buyer Requirement</h2>
              <button className="modal-close-btn" onClick={() => setDeletingRequirement(null)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: "0.95rem", lineHeight: "1.5" }}>
                Are you sure you want to delete the requirement for{" "}
                <strong>{getBuyerName(deletingRequirement)}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setDeletingRequirement(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteConfirm}
                disabled={submitting}
              >
                {submitting ? "Deleting..." : "Delete Requirement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
