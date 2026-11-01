import { apiClient } from "./authService";
import type { GlobalSearchResponse, SearchResultItem } from "../types/search";
import { getLeads } from "./leadService";
import { getContacts } from "./contactService";
import { getDeals } from "./dealService";
import { getAccounts } from "./accountService";
import { getProperties } from "./propertyService";

let isSearchApiSupported = false;

export const searchGlobal = async (
  query: string,
  limit: number = 10,
  signal?: AbortSignal
): Promise<GlobalSearchResponse> => {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length < 2) {
    return { query: query.trim(), count: 0, results: [] };
  }

  const safeLimit = Math.min(Math.max(1, limit), 25);

  if (!isSearchApiSupported) {
    const results: SearchResultItem[] = [];

    try {
      const [leadsRes, contactsRes, dealsRes, accountsRes, propsRes] =
        await Promise.allSettled([
          getLeads(),
          getContacts(),
          getDeals(),
          getAccounts(),
          getProperties(),
        ]);

      if (leadsRes.status === "fulfilled" && Array.isArray(leadsRes.value)) {
        for (const l of leadsRes.value) {
          const match =
            (l.full_name && l.full_name.toLowerCase().includes(trimmed)) ||
            (l.email && l.email.toLowerCase().includes(trimmed)) ||
            (l.phone && l.phone.toLowerCase().includes(trimmed));
          if (match) {
            results.push({
              id: l.id,
              module: "leads",
              name: l.full_name || l.email || "Lead",
              email: l.email || null,
              phone: l.phone || null,
              subtitle: l.source ? `Source: ${l.source}` : "Lead",
              status: l.status,
            });
          }
        }
      }

      if (contactsRes.status === "fulfilled" && Array.isArray(contactsRes.value)) {
        for (const c of contactsRes.value) {
          const match =
            (c.full_name && c.full_name.toLowerCase().includes(trimmed)) ||
            (c.email && c.email.toLowerCase().includes(trimmed)) ||
            (c.company && c.company.toLowerCase().includes(trimmed));
          if (match) {
            results.push({
              id: c.id,
              module: "contacts",
              name: c.full_name || c.email || "Contact",
              email: c.email || null,
              phone: c.phone || null,
              subtitle: c.job_title || c.company || "Contact",
            });
          }
        }
      }

      if (dealsRes.status === "fulfilled" && Array.isArray(dealsRes.value)) {
        for (const d of dealsRes.value) {
          if (d.name && d.name.toLowerCase().includes(trimmed)) {
            results.push({
              id: d.id,
              module: "deals",
              name: d.name,
              subtitle: d.stage || "Deal",
              status: d.stage,
            });
          }
        }
      }

      if (accountsRes.status === "fulfilled" && Array.isArray(accountsRes.value)) {
        for (const a of accountsRes.value) {
          if (a.name && a.name.toLowerCase().includes(trimmed)) {
            results.push({
              id: a.id,
              module: "accounts",
              name: a.name,
              subtitle: a.industry || "Account",
            });
          }
        }
      }

      if (propsRes.status === "fulfilled" && Array.isArray(propsRes.value)) {
        for (const p of propsRes.value) {
          const match =
            (p.name && p.name.toLowerCase().includes(trimmed)) ||
            (p.unit_number && p.unit_number.toLowerCase().includes(trimmed)) ||
            (p.city && p.city.toLowerCase().includes(trimmed));
          if (match) {
            results.push({
              id: p.id,
              module: "properties",
              name: p.name || `Unit ${p.unit_number}`,
              subtitle: `${p.property_type || "Property"} • ${p.city || ""}`,
              status: p.status,
            });
          }
        }
      }
    } catch (e) {
      console.warn("Client side search failed", e);
    }

    const sliced = results.slice(0, safeLimit);
    return {
      query: query.trim(),
      count: sliced.length,
      results: sliced,
    };
  }

  try {
    const response = await apiClient.get<GlobalSearchResponse>("/api/v1/search/", {
      params: {
        q: query.trim(),
        limit: safeLimit,
      },
      signal,
    });
    return response.data;
  } catch {
    isSearchApiSupported = false;
    return searchGlobal(query, limit, signal);
  }
};
