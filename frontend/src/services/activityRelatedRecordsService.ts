import type { ActivityLinkModule } from "../types/activity";
import { getSoftwareProjects } from "./softwareProjectService";
import { getSoftwareSprints } from "./softwareSprintService";
import { getProperties } from "./propertyService";
import { getBuildings } from "./buildingService";
import { getProjects } from "./projectService";
import { getBuyerRequirements } from "./buyerRequirementService";
import { getSiteVisits } from "./siteVisitService";
import { getBookings } from "./bookingService";

export interface SelectableRelatedRecord {
  id: string;
  name: string;
  secondaryText?: string;
  parentId?: string; // e.g. software_project_id for sprints
  raw?: any;
}

// Module human readable label mapping
export const MODULE_DISPLAY_NAMES: Record<ActivityLinkModule, string> = {
  software_project: "Software Project",
  software_sprint: "Sprint",
  property: "Property",
  building: "Building",
  real_estate_project: "Real Estate Project",
  buyer_requirement: "Buyer Requirement",
  property_match: "Property Match",
  site_visit: "Site Visit",
  booking: "Booking",
};

// Global cache for resolved record labels
const resolvedLabelsCache = new Map<string, string>();

export const getCacheKey = (module: ActivityLinkModule, id: string): string =>
  `${module}:${id.toLowerCase()}`;

export const getCachedRecordLabel = (
  module: ActivityLinkModule,
  recordId: string
): string | null => {
  return resolvedLabelsCache.get(getCacheKey(module, recordId)) || null;
};

export const setCachedRecordLabel = (
  module: ActivityLinkModule,
  recordId: string,
  label: string
): void => {
  resolvedLabelsCache.set(getCacheKey(module, recordId), label);
};

export const fetchRecordsForModule = async (
  module: ActivityLinkModule
): Promise<SelectableRelatedRecord[]> => {
  switch (module) {
    case "software_project": {
      const projects = await getSoftwareProjects();
      const list = Array.isArray(projects) ? projects : [];
      return list.map((p) => {
        const name = p.name || `Project ${p.project_number || p.id.slice(0, 8)}`;
        const secondaryText = p.project_number ? `(${p.project_number})` : "";
        const label = secondaryText ? `${name} ${secondaryText}` : name;
        setCachedRecordLabel(module, p.id, label);
        return {
          id: p.id,
          name,
          secondaryText,
          raw: p,
        };
      });
    }

    case "software_sprint": {
      const sprints = await getSoftwareSprints();
      const list = Array.isArray(sprints) ? sprints : [];
      return list.map((s) => {
        const name = s.name || `Sprint #${s.id.slice(0, 8)}`;
        const secondaryText = s.status ? `[${s.status}]` : "";
        const label = secondaryText ? `${name} ${secondaryText}` : name;
        setCachedRecordLabel(module, s.id, label);
        return {
          id: s.id,
          name,
          secondaryText,
          parentId: s.software_project_id,
          raw: s,
        };
      });
    }

    case "property": {
      const properties = await getProperties();
      const list = Array.isArray(properties) ? properties : [];
      return list.map((prop) => {
        const name = prop.name || `Property #${prop.id.slice(0, 8)}`;
        const secondary = prop.unit_number
          ? `Unit ${prop.unit_number}${prop.city ? `, ${prop.city}` : ""}`
          : prop.city || "";
        const label = secondary ? `${name} (${secondary})` : name;
        setCachedRecordLabel(module, prop.id, label);
        return {
          id: prop.id,
          name,
          secondaryText: secondary ? `(${secondary})` : "",
          raw: prop,
        };
      });
    }

    case "building": {
      const buildings = await getBuildings();
      const list = Array.isArray(buildings) ? buildings : [];
      return list.map((b) => {
        const name = b.name || `Building #${b.id.slice(0, 8)}`;
        const secondary = b.building_code ? `(${b.building_code})` : "";
        const label = secondary ? `${name} ${secondary}` : name;
        setCachedRecordLabel(module, b.id, label);
        return {
          id: b.id,
          name,
          secondaryText: secondary,
          raw: b,
        };
      });
    }

    case "real_estate_project": {
      const projects = await getProjects();
      const list = Array.isArray(projects) ? projects : [];
      return list.map((proj) => {
        const name = proj.name || `Project #${proj.id.slice(0, 8)}`;
        const secondary = proj.city ? `(${proj.city})` : "";
        const label = secondary ? `${name} ${secondary}` : name;
        setCachedRecordLabel(module, proj.id, label);
        return {
          id: proj.id,
          name,
          secondaryText: secondary,
          raw: proj,
        };
      });
    }

    case "buyer_requirement": {
      const reqs = await getBuyerRequirements();
      const list = Array.isArray(reqs) ? reqs : [];
      return list.map((r) => {
        const name = r.lead_name ? `Req: ${r.lead_name}` : r.preferred_city ? `Req in ${r.preferred_city}` : `Requirement #${r.id.slice(0, 8)}`;
        const secondary = r.requirement_type ? `(${r.requirement_type})` : "";
        const label = secondary ? `${name} ${secondary}` : name;
        setCachedRecordLabel(module, r.id, label);
        return {
          id: r.id,
          name,
          secondaryText: secondary,
          raw: r,
        };
      });
    }

    case "site_visit": {
      const visits = await getSiteVisits();
      const list = Array.isArray(visits) ? visits : [];
      return list.map((v) => {
        const name = v.property_name ? `Visit: ${v.property_name}` : `Site Visit #${v.id.slice(0, 8)}`;
        const secondary = v.scheduled_start
          ? `(${new Date(v.scheduled_start).toLocaleDateString()})`
          : "";
        const label = secondary ? `${name} ${secondary}` : name;
        setCachedRecordLabel(module, v.id, label);
        return {
          id: v.id,
          name,
          secondaryText: secondary,
          raw: v,
        };
      });
    }

    case "booking": {
      const bookings = await getBookings();
      const list = Array.isArray(bookings) ? bookings : [];
      return list.map((bk) => {
        const name = bk.buyer_name
          ? `Booking: ${bk.buyer_name}`
          : bk.property_name
          ? `Booking: ${bk.property_name}`
          : `Booking #${bk.id.slice(0, 8)}`;
        const secondary = bk.status ? `(${bk.status})` : "";
        const label = secondary ? `${name} ${secondary}` : name;
        setCachedRecordLabel(module, bk.id, label);
        return {
          id: bk.id,
          name,
          secondaryText: secondary,
          raw: bk,
        };
      });
    }

    case "property_match": {
      // Local fallback matches or placeholders
      try {
        const raw = localStorage.getItem("scuilone_property_matches_v1");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed.map((m: any) => {
              const name = `Property Match #${(m.id || "").slice(0, 8)}`;
              setCachedRecordLabel(module, m.id, name);
              return { id: m.id, name, raw: m };
            });
          }
        }
      } catch { }
      return [];
    }

    default:
      return [];
  }
};
