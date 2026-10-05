import { useState, useRef, useEffect } from "react";
import { User } from "../../types/user";

interface UserSearchDropdownProps {
  users: User[];
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
  loading?: boolean;
}

export default function UserSearchDropdown({
  users,
  value,
  onChange,
  disabled = false,
  loading = false,
}: UserSearchDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedUser = value ? users.find((u) => u.id === value) : null;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearch("");
      }
    };
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const filtered = users.filter((u) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (u.full_name || "").toLowerCase().includes(q) ||
      (u.role || "").toLowerCase().includes(q) ||
      (u.email || "").toLowerCase().includes(q)
    );
  });

  const handleSelect = (userId: string) => {
    onChange(userId);
    setIsOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setIsOpen(false);
    setSearch("");
  };

  const handleTriggerClick = () => {
    if (disabled || loading) return;
    setIsOpen(!isOpen);
    if (!isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  return (
    <div className="user-search-dropdown" ref={containerRef}>
      {/* Trigger */}
      <button
        type="button"
        className={`usd-trigger ${isOpen ? "usd-trigger-active" : ""} ${disabled ? "usd-disabled" : ""}`}
        onClick={handleTriggerClick}
        disabled={disabled}
      >
        <div className="usd-trigger-content">
          {loading ? (
            <span className="usd-placeholder">Loading users…</span>
          ) : selectedUser ? (
            <div className="usd-selected-user">
              <div className="usd-user-avatar">
                {selectedUser.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="usd-user-info">
                <span className="usd-user-name">{selectedUser.full_name}</span>
                <span className="usd-user-role">{selectedUser.role}</span>
              </div>
            </div>
          ) : (
            <span className="usd-placeholder">— Unassigned —</span>
          )}
        </div>
        <div className="usd-trigger-actions">
          {selectedUser && !disabled && (
            <span className="usd-clear-btn" onClick={handleClear} title="Clear selection">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </span>
          )}
          <svg className="usd-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="usd-panel">
          <div className="usd-search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search users…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="usd-options">
            {/* Unassigned option */}
            <button
              type="button"
              className={`usd-option ${!value ? "usd-option-selected" : ""}`}
              onClick={() => handleSelect("")}
            >
              <div className="usd-option-avatar usd-option-avatar-empty">—</div>
              <div className="usd-option-info">
                <span className="usd-option-name">Unassigned</span>
                <span className="usd-option-role">No assignment</span>
              </div>
            </button>

            {filtered.length === 0 && search && (
              <div className="usd-no-results">
                No users matching "{search}"
              </div>
            )}

            {filtered.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`usd-option ${value === u.id ? "usd-option-selected" : ""}`}
                onClick={() => handleSelect(u.id)}
              >
                <div className="usd-option-avatar">
                  {u.full_name.charAt(0).toUpperCase()}
                </div>
                <div className="usd-option-info">
                  <span className="usd-option-name">{u.full_name}</span>
                  <span className="usd-option-role">{u.role}</span>
                </div>
                {value === u.id && (
                  <svg className="usd-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
