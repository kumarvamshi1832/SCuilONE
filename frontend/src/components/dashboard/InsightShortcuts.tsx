import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useVerifiedAuth } from "../layout/ProtectedRoute";
import { getIndustryConfig } from "../../config/industryConfig";
import { hasFeaturePermission } from "../../utils/modulePermissions";
import { getForecastSummary } from "../../services/forecastService";
import { getLeadLeaderboard } from "../../services/leadScoringService";
import "../../pages/insights/CrmInsights.css";

interface Shortcut {
  key: string;
  label: string;
  to: string;
  note: string;
  value: string;
}

const formatMoney = (value: number): string =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);

/**
 * Permission- and industry-aware shortcuts to Sales Forecast, Lead Scoring and Trash for the CRM
 * dashboards. A tile appears only when the industry configuration enables the module and the user
 * holds the matching permission. Live figures come from the real APIs; if one fails the tile still
 * works as a plain link.
 */
export default function InsightShortcuts() {
  const verified = useVerifiedAuth();
  const { industry: routeIndustry } = useParams();

  const industry =
    (verified?.kind === "crm" && verified.industrySlug) || routeIndustry || "";
  const modules = getIndustryConfig(industry).modules;
  const basePath = `/${industry}`;

  const access = useMemo(
    () => ({
      scoring: modules.includes("lead-scoring") && hasFeaturePermission("lead.view"),
      forecast: modules.includes("forecast") && hasFeaturePermission("forecast.view"),
      trash: modules.includes("trash") && hasFeaturePermission("trash.view"),
    }),
    [modules]
  );

  const [hotLeads, setHotLeads] = useState<string | null>(null);
  const [weighted, setWeighted] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (access.scoring) {
      getLeadLeaderboard({ label: "Hot", limit: 100 })
        .then((rows) => active && setHotLeads(rows.length >= 100 ? "100+" : String(rows.length)))
        .catch(() => undefined);
    }
    if (access.forecast) {
      getForecastSummary({ months: 6 })
        .then((s) => active && setWeighted(formatMoney(s.totals.weighted_amount)))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [access.scoring, access.forecast]);

  if (!industry) return null;

  const tiles: Shortcut[] = [];
  if (access.forecast) {
    tiles.push({
      key: "forecast",
      label: "Weighted forecast",
      to: `${basePath}/forecast`,
      value: weighted ?? "Sales Forecast",
      note: "Open the Sales Forecast →",
    });
  }
  if (access.scoring) {
    tiles.push({
      key: "scoring",
      label: "Hot leads",
      to: `${basePath}/lead-scoring`,
      value: hotLeads ?? "Lead Scoring",
      note: "Open the Lead Scoring leaderboard →",
    });
  }
  if (access.trash) {
    tiles.push({
      key: "trash",
      label: "Trash",
      to: `${basePath}/trash`,
      value: "Deleted records",
      note: "Restore or permanently delete →",
    });
  }

  if (tiles.length === 0) return null;

  return (
    <section className="ins-shortcuts" aria-label="Insights and data shortcuts">
      <h2>Insights &amp; data</h2>
      <div className="ins-shortcut-grid">
        {tiles.map((tile) => (
          <Link key={tile.key} to={tile.to} className="ins-shortcut">
            <span className="ins-shortcut-label">{tile.label}</span>
            <span className="ins-shortcut-value">{tile.value}</span>
            <span className="ins-shortcut-note">{tile.note}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
