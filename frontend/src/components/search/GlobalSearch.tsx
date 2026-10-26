import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { searchGlobal } from "../../services/searchService";
import type { SearchResultItem } from "../../types/search";
import { normalizeIndustry } from "../../utils/industryUtils";
import "./GlobalSearch.css";

interface GlobalSearchProps {
  placeholder?: string;
  className?: string;
}

export default function GlobalSearch({
  placeholder = "Search leads, contacts, accounts, deals...",
  className = "",
}: GlobalSearchProps) {
  const navigate = useNavigate();
  const { industry } = useParams<{ industry?: string }>();

  // Determine base path for navigation
  const currentIndustry = normalizeIndustry(industry);
  const basePath = `/${currentIndustry}`;

  // Search State
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  // DOM Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Route map for seamless navigation
  const routeMap: Record<string, string> = {
    lead: "leads",
    leads: "leads",
    contact: "contacts",
    contacts: "contacts",
    account: "accounts",
    accounts: "accounts",
    deal: "deals",
    deals: "deals",
    project: "projects",
    projects: "projects",
    building: "buildings",
    buildings: "buildings",
    property: "properties",
    properties: "properties",
    buyer_requirement: "buyer-requirements",
    buyer_requirements: "buyer-requirements",
    "buyer-requirements": "buyer-requirements",
    site_visit: "site-visits",
    site_visits: "site-visits",
    "site-visits": "site-visits",
    booking: "bookings",
    bookings: "bookings",
    payment: "payments",
    payments: "payments",
  };

  // Debounced Search Effect
  useEffect(() => {
    const trimmed = query.trim();

    // Reset if query is too short
    if (trimmed.length < 2) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      setResults([]);
      setTotalCount(0);
      setIsSearching(false);
      setError(null);
      setActiveIndex(-1);
      return;
    }

    setIsSearching(true);
    setError(null);

    // 350ms debounce
    const timer = setTimeout(async () => {
      // Abort previous in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await searchGlobal(trimmed, 15, controller.signal);
        setResults(response.results || []);
        setTotalCount(response.count || 0);
        setActiveIndex(-1);
      } catch (err: any) {
        if (err?.name === "CanceledError" || err?.name === "AbortError") {
          return; // Ignore canceled requests
        }
        console.error("Global search error:", err);
        const status = err?.response?.status;
        if (status === 403) {
          setError("You do not have permission to perform search.");
        } else if (status === 422) {
          setError("Search query must contain at least 2 characters.");
        } else if (status >= 500) {
          setError("Search service is temporarily unavailable.");
        } else {
          setError(
            err?.response?.data?.detail || "Unable to complete search. Please try again."
          );
        }
        setResults([]);
        setTotalCount(0);
      } finally {
        setIsSearching(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query]);

  // Handle Outside Click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  // Handle Select / Navigate
  const handleSelectResult = useCallback(
    (item: SearchResultItem) => {
      setIsOpen(false);
      const mod = item.module ? item.module.toLowerCase() : "leads";
      const targetRoute = routeMap[mod] || mod;
      navigate(
        `${basePath}/${targetRoute}?search=${encodeURIComponent(item.name)}&recordId=${encodeURIComponent(item.id)}`
      );
    },
    [basePath, navigate]
  );

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if ((e.key === "ArrowDown" || e.key === "Enter") && query.trim().length >= 2) {
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < results.length) {
        const selected = results[activeIndex];
        if (selected) handleSelectResult(selected);
      } else if (results.length > 0 && results[0]) {
        handleSelectResult(results[0]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      inputRef.current?.blur();
    }
  };

  // Helper: Highlight query matches in text
  const highlightMatch = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text;
    const parts = text.split(new RegExp(`(${searchTerm})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === searchTerm.toLowerCase() ? (
        <span key={i} style={{ color: "#0891b2", fontWeight: 700 }}>
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  // Render Module Icon
  const renderModuleIcon = (module: string) => {
    const mod = module.toLowerCase();
    switch (mod) {
      case "leads":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        );
      case "contacts":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        );
      case "accounts":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
            <line x1="9" y1="22" x2="9" y2="22.01" />
            <line x1="15" y1="22" x2="15" y2="22.01" />
            <line x1="8" y1="6" x2="10" y2="6" />
            <line x1="14" y1="6" x2="16" y2="6" />
            <line x1="8" y1="10" x2="10" y2="10" />
            <line x1="14" y1="10" x2="16" y2="10" />
          </svg>
        );
      case "deals":
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
        );
      default:
        return (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        );
    }
  };

  // Helper for subtitle
  const getSubtitle = (item: SearchResultItem) => {
    if (item.email && item.phone) {
      return `${item.email} • ${item.phone}`;
    }
    if (item.email) return item.email;
    if (item.phone) return item.phone;
    if (item.subtitle) return item.subtitle;
    return null;
  };

  return (
    <div className={`global-search-wrapper ${className}`} ref={containerRef}>
      {/* ─── Search Box Input ─── */}
      <div className={`global-search-box ${isOpen ? "focused" : ""}`}>
        <svg
          className="search-icon-left"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <input
          ref={inputRef}
          type="text"
          className="global-search-input"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            const val = e.target.value;
            setQuery(val);
            if (val.trim().length >= 2) {
              setIsOpen(true);
            } else {
              setIsOpen(false);
            }
          }}
          onFocus={() => {
            if (query.trim().length >= 2) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          aria-label="Global CRM search"
        />

        <div className="search-controls-right">
          {isSearching && <div className="search-spinner-mini" title="Searching..." />}

          {query && (
            <button
              className="search-clear-button"
              onClick={() => {
                setQuery("");
                setResults([]);
                setIsOpen(false);
                inputRef.current?.focus();
              }}
              title="Clear search"
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {/* ─── Results Dropdown ─── */}
      {isOpen && query.trim().length >= 2 && (
        <div className="global-search-dropdown">
          {/* Header Bar */}
          {!error && (
            <div className="dropdown-header-bar">
              <span>Search Results</span>
              <span>
                {isSearching ? "Searching..." : `${totalCount || results.length} record(s)`}
              </span>
            </div>
          )}

          {/* Body Content */}
          <div className="dropdown-results-scroll">
            {isSearching && results.length === 0 ? (
              <div className="search-state-panel">
                <div className="search-spinner-mini" style={{ width: "20px", height: "20px" }} />
                <div className="search-state-title">Searching CRM records...</div>
                <div className="search-state-sub">Querying matching records in your tenant...</div>
              </div>
            ) : error ? (
              <div className="search-state-panel">
                <div className="search-state-icon error">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="search-state-title">Search Error</div>
                <div className="search-state-sub">{error}</div>
              </div>
            ) : results.length === 0 ? (
              <div className="search-state-panel">
                <div className="search-state-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </div>
                <div className="search-state-title">No results found</div>
                <div className="search-state-sub">
                  No records matching &ldquo;{query}&rdquo;. Try a different name, email, or phone number.
                </div>
              </div>
            ) : (
              results.map((item, idx) => {
                const modClass = item.module ? item.module.toLowerCase() : "generic";
                const subtitle = getSubtitle(item);
                const isActive = idx === activeIndex;

                return (
                  <div
                    key={`${item.module}-${item.id}`}
                    className={`search-result-row ${isActive ? "active" : ""}`}
                    onClick={() => handleSelectResult(item)}
                    onMouseEnter={() => setActiveIndex(idx)}
                  >
                    <div className="result-main-col">
                      <div className={`result-icon-box ${modClass}`}>
                        {renderModuleIcon(item.module)}
                      </div>
                      <div className="result-text-box">
                        <span className="result-title">
                          {highlightMatch(item.name || "Untitled Record", query)}
                        </span>
                        {subtitle && (
                          <span className="result-subtitle">
                            {highlightMatch(subtitle, query)}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className={`module-badge ${modClass}`}>
                      {item.module}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Keyboard Navigation Hint */}
          {results.length > 0 && (
            <div className="dropdown-footer-hint">
              <span>
                Use <span className="kbd-shortcut">&uarr;</span> <span className="kbd-shortcut">&darr;</span> to navigate
              </span>
              <span>
                Press <span className="kbd-shortcut">&crarr;</span> to select
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
