import { useEffect, useMemo, useState } from "react";
import { getAccounts } from "../../services/accountService";
import { getContacts } from "../../services/contactService";
import { getDeals } from "../../services/dealService";
import { getLeads } from "../../services/leadService";
import type { EmailLinkEntity, EmailLinks } from "../../types/emailLog";
import { EMAIL_LINK_ENTITIES } from "../../types/emailLog";

/* ───────── record lookup (lazy, cached per entity for the session) ───────── */

export interface RecordOption {
  id: string;
  label: string;
  hint: string;
}

const loaders: Record<EmailLinkEntity, () => Promise<RecordOption[]>> = {
  lead: async () => (await getLeads()).map((r) => ({ id: r.id, label: r.full_name, hint: r.email ?? "" })),
  contact: async () => (await getContacts()).map((r) => ({ id: r.id, label: r.full_name, hint: r.email ?? "" })),
  account: async () => (await getAccounts()).map((r) => ({ id: r.id, label: r.name, hint: r.email ?? "" })),
  deal: async () => (await getDeals()).map((r) => ({ id: r.id, label: r.name, hint: "" })),
};

const cache = new Map<EmailLinkEntity, Promise<RecordOption[]>>();

const loadOptions = (entity: EmailLinkEntity): Promise<RecordOption[]> => {
  let promise = cache.get(entity);
  if (!promise) {
    promise = loaders[entity]().catch((err) => {
      cache.delete(entity); // do not cache a failure
      throw err;
    });
    cache.set(entity, promise);
  }
  return promise;
};

export interface RecordLookup {
  options: RecordOption[];
  loading: boolean;
  error: string | null;
}

export function useRecordOptions(entity: EmailLinkEntity, enabled = true): RecordLookup {
  const [state, setState] = useState<RecordLookup>({ options: [], loading: enabled, error: null });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadOptions(entity)
      .then((options) => active && setState({ options, loading: false, error: null }))
      .catch(() => active && setState({ options: [], loading: false, error: "Could not load records." }));
    return () => {
      active = false;
    };
  }, [entity, enabled]);
  return state;
}

export const LINK_KEY: Record<EmailLinkEntity, keyof EmailLinks> = {
  lead: "lead_id",
  contact: "contact_id",
  account: "account_id",
  deal: "deal_id",
};

export type EntityLabels = Record<EmailLinkEntity, string>;

export const DEFAULT_ENTITY_LABELS: EntityLabels = {
  lead: "Lead",
  contact: "Contact",
  account: "Account",
  deal: "Deal",
};

/* ───────── searchable picker ───────── */

interface RecordPickerProps {
  entity: EmailLinkEntity;
  label: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

const MAX_VISIBLE = 100;

export function RecordPicker({ entity, label, value, onChange, disabled }: RecordPickerProps) {
  const { options, loading, error } = useRecordOptions(entity);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? options.filter((o) => o.label.toLowerCase().includes(q) || o.hint.toLowerCase().includes(q))
      : options;
    const limited = matches.slice(0, MAX_VISIBLE);
    // Keep the current choice selectable even when the filter hides it.
    const selected = options.find((o) => o.id === value);
    return selected && !limited.some((o) => o.id === value) ? [selected, ...limited] : limited;
  }, [options, query, value]);

  return (
    <label className="em-field em-picker">
      <span>{label}</span>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${label.toLowerCase()}…`}
        disabled={disabled || loading}
        aria-label={`Search ${label}`}
      />
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled || loading} aria-label={label}>
        <option value="">{loading ? "Loading…" : "None"}</option>
        {visible.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
            {o.hint ? ` — ${o.hint}` : ""}
          </option>
        ))}
      </select>
      {error && <span className="em-error-text">{error}</span>}
    </label>
  );
}

interface LinkFieldsProps {
  value: EmailLinks;
  onChange: (next: EmailLinks) => void;
  labels?: EntityLabels;
  disabled?: boolean;
}

/** The four CRM link pickers (lead / contact / account / deal). */
export function EmailLinkFields({ value, onChange, labels = DEFAULT_ENTITY_LABELS, disabled }: LinkFieldsProps) {
  return (
    <div className="em-link-grid">
      {EMAIL_LINK_ENTITIES.map((entity) => (
        <RecordPicker
          key={entity}
          entity={entity}
          label={labels[entity]}
          value={value[LINK_KEY[entity]] ?? ""}
          onChange={(id) => onChange({ ...value, [LINK_KEY[entity]]: id || null })}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

/* ───────── badges / chips ───────── */

export function EmailStatusBadge({ status }: { status: string }) {
  const tone =
    status === "Failed" ? "failed" : status === "Sent" ? "sent" : status === "Received" ? "received" : "logged";
  return <span className={`em-badge ${tone}`}>{status}</span>;
}

export function EmailDirectionBadge({ direction }: { direction: string }) {
  return <span className={`em-dir ${direction === "Inbound" ? "in" : "out"}`}>{direction === "Inbound" ? "↙ Inbound" : "↗ Outbound"}</span>;
}

/** Linked-record chips. Names are resolved from the cached lookup lists when available. */
export function EmailLinkChips({ links, labels = DEFAULT_ENTITY_LABELS, names }: { links: EmailLinks; labels?: EntityLabels; names?: Map<string, string> }) {
  const chips = EMAIL_LINK_ENTITIES.map((entity) => {
    const id = links[LINK_KEY[entity]];
    return id ? { entity, id } : null;
  }).filter((c): c is { entity: EmailLinkEntity; id: string } => c !== null);
  if (chips.length === 0) return <span className="em-unlinked">Not linked</span>;
  return (
    <span className="em-chips">
      {chips.map((c) => (
        <span key={c.entity} className={`em-chip ${c.entity}`} title={`${labels[c.entity]} ${c.id}`}>
          {labels[c.entity]}: {names?.get(c.id) ?? "linked"}
        </span>
      ))}
    </span>
  );
}

/** Name lookup for every link entity, for list rows. Loads the four lists once (cached). */
export function useLinkNames(enabled: boolean): Map<string, string> {
  const lead = useRecordOptions("lead", enabled);
  const contact = useRecordOptions("contact", enabled);
  const account = useRecordOptions("account", enabled);
  const deal = useRecordOptions("deal", enabled);
  return useMemo(() => {
    const map = new Map<string, string>();
    [lead, contact, account, deal].forEach((lookup) => lookup.options.forEach((o) => map.set(o.id, o.label)));
    return map;
  }, [lead, contact, account, deal]);
}
