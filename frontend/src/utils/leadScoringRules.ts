import type { Lead } from "../types/lead";
import type { LeadScoreRow, LeadScoreDetail, LeadScoreLabel } from "../types/leadScoring";

const HOT_THRESHOLD = 70;
const WARM_THRESHOLD = 40;

const DEAD_STATUSES = new Set([
  "lost",
  "disqualified",
  "junk",
  "unqualified",
  "dead",
  "closed lost",
  "not interested",
]);

const CONVERTED_STATUSES = new Set([
  "converted",
  "won",
  "closed won",
  "customer",
]);

const SOURCE_POINTS: [string, number][] = [
  ["referral", 15],
  ["refer", 15],
  ["website", 10],
  ["walk", 10],
  ["event", 8],
  ["linkedin", 8],
  ["google", 8],
  ["facebook", 6],
  ["instagram", 6],
  ["cold", 3],
];

const STATUS_POINTS: [string, number][] = [
  ["negotiat", 22],
  ["proposal", 20],
  ["qualified", 18],
  ["contacted", 8],
  ["new", 0],
];

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function labelForScore(score: number, status?: string | null): LeadScoreLabel {
  const s = (status || "").trim().toLowerCase();
  if (DEAD_STATUSES.has(s)) return "Dead";
  if (CONVERTED_STATUSES.has(s)) return "Converted";
  if (score >= HOT_THRESHOLD) return "Hot";
  if (score >= WARM_THRESHOLD) return "Warm";
  return "Cold";
}

export function computeLeadProfileScore(lead: Lead): {
  score: number;
  label: LeadScoreLabel;
  breakdown: Record<string, number>;
} {
  const points: Record<string, number> = {};

  if (lead.email && EMAIL_RE.test(lead.email.trim())) {
    points["email"] = 10;
  }
  if (lead.phone) {
    const digits = lead.phone.replace(/\D/g, "");
    if (digits.length >= 7) {
      points["phone"] = 10;
    }
  }
  const source = (lead.source || "").trim().toLowerCase();
  if (source) {
    const match = SOURCE_POINTS.find(([kw]) => source.includes(kw));
    points["source"] = match ? match[1] : 4;
  }
  if (lead.notes && lead.notes.trim().length >= 20) {
    points["notes"] = 5;
  }
  if (lead.assigned_to) {
    points["assigned"] = 5;
  }
  if (lead.account_id) {
    points["account"] = 5;
  }
  const statusNorm = (lead.status || "").trim().toLowerCase();
  const statusMatch = STATUS_POINTS.find(([kw]) => statusNorm.includes(kw));
  if (statusMatch && statusMatch[1] > 0) {
    points["status"] = statusMatch[1];
  }

  const rawSum = Object.values(points).reduce((sum, v) => sum + v, 0);
  let total = Math.max(0, Math.min(100, rawSum));
  if (DEAD_STATUSES.has(statusNorm)) {
    total = 0;
  }

  const label = labelForScore(total, lead.status);
  return { score: total, label, breakdown: points };
}

export function convertLeadToScoreRow(lead: Lead): LeadScoreRow {
  const anyLead = lead as any;
  if (typeof anyLead.score === "number" && anyLead.score_label) {
    return {
      id: lead.id,
      full_name:
        lead.full_name ||
        `${anyLead.first_name || ""} ${anyLead.last_name || ""}`.trim() ||
        "Lead",
      email: lead.email || null,
      phone: lead.phone || null,
      source: lead.source || null,
      status: lead.status,
      assigned_to: lead.assigned_to || null,
      score: anyLead.score,
      score_label: anyLead.score_label,
      scored_at: anyLead.scored_at || lead.updated_at || lead.created_at,
    };
  }

  const { score, label } = computeLeadProfileScore(lead);
  return {
    id: lead.id,
    full_name:
      lead.full_name ||
      `${anyLead.first_name || ""} ${anyLead.last_name || ""}`.trim() ||
      "Lead",
    email: lead.email || null,
    phone: lead.phone || null,
    source: lead.source || null,
    status: lead.status,
    assigned_to: lead.assigned_to || null,
    score,
    score_label: label,
    scored_at: lead.updated_at || lead.created_at,
  };
}

export function buildLeadScoreDetail(lead: Lead): LeadScoreDetail {
  const anyLead = lead as any;
  const { score, label, breakdown } = computeLeadProfileScore(lead);
  return {
    id: lead.id,
    full_name:
      lead.full_name ||
      `${anyLead.first_name || ""} ${anyLead.last_name || ""}`.trim() ||
      "Lead",
    email: lead.email || null,
    phone: lead.phone || null,
    source: lead.source || null,
    status: lead.status,
    assigned_to: lead.assigned_to || null,
    score: typeof anyLead.score === "number" ? anyLead.score : score,
    score_label: anyLead.score_label || label,
    scored_at: anyLead.scored_at || lead.updated_at || lead.created_at,
    breakdown: anyLead.score_breakdown || {
      profile: breakdown,
      engagement: {},
      total: score,
    },
  };
}
