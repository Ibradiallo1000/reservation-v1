/**
 * Journal d'activité agence : sessions, écarts, synthèse par agent (contrôle métier, pas compta).
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { ClipboardList, AlertTriangle, UserCircle2, ChevronDown, ChevronRight } from "lucide-react";
import {
  ACTIVITY_DISCREPANCY_EPSILON,
  aggregateAgentPerformance,
  filterAgencyActivityRows,
  loadAgencyActivityRows,
  type AgencySessionHistoryRow,
  type DiscrepancyType,
  type DiscrepancySeverity,
  type RootCauseHint,
  type SessionTimelineEntry,
  type AgentDiscrepancyTrend,
} from "./agencyActivityTrackingService";

function startOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function endOfDayMs(d: Date): number {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

function formatTs(ms: number | null): string {
  if (ms == null) return "—";
  try {
    return new Date(ms).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function discrepancyTypeLabel(t: DiscrepancyType): string {
  switch (t) {
    case "missing_cash":
      return "Manquant";
    case "over_cash":
      return "Surplus";
    default:
      return "À préciser";
  }
}

function timelineEventLabel(e: SessionTimelineEntry["event"]): string {
  switch (e) {
    case "created":
      return "Création";
    case "closed":
      return "Clôture";
    case "validated_by_accountant":
      return "Validation comptable";
    case "validated_by_manager":
      return "Validation chef d'agence";
    case "exception_flagged":
      return "Exception / écart signalé";
    case "suspended":
      return "Suspension";
    default:
      return e;
  }
}

function severityLabel(s: DiscrepancySeverity): string {
  switch (s) {
    case "low":
      return "Faible";
    case "medium":
      return "Moyenne";
    case "high":
      return "Élevée";
    default:
      return s;
  }
}

function rootCauseLabel(r: RootCauseHint): string {
  switch (r) {
    case "late_validation":
      return "Validation tardive";
    case "partial_remittance":
      return "Remise partielle";
    case "missing_remittance":
      return "Remise ou validation manquante";
    case "manual_override":
      return "Dérogation manuelle";
    default:
      return "Piste non déterminée";
  }
}

function trendLabel(trend: AgentDiscrepancyTrend): string {
  switch (trend) {
    case "improving":
      return "En amélioration";
    case "worsening":
      return "En dégradation";
    default:
      return "Stable";
  }
}

function sessionRowKey(s: AgencySessionHistoryRow): string {
  return `${s.type}-${s.sessionId}`;
}

export default function AgencyActivityLogPage() {
  const location = useLocation();
  const { user } = useAuth() as { user?: { companyId?: string; agencyId?: string } };
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const money = useFormatCurrency();

  const defaultTo = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 60);
    return d;
  }, []);

  const [dateFrom, setDateFrom] = useState(() => defaultFrom.toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => defaultTo.toISOString().slice(0, 10));
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<"all" | "guichet" | "courrier">("all");
  const [raw, setRaw] = useState<AgencySessionHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSessionKeys, setExpandedSessionKeys] = useState<Set<string>>(() => new Set());

  const toggleSessionExpanded = (key: string) => {
    setExpandedSessionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  useEffect(() => {
    if (!companyId || !agencyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadAgencyActivityRows(companyId, agencyId)
      .then((rows) => {
        if (!cancelled) setRaw(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Chargement impossible");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId]);

  useEffect(() => {
    const st = location.state as { focusSessionId?: string } | null | undefined;
    const id = st?.focusSessionId?.trim();
    if (!id || loading || raw.length === 0) return;
    const match = raw.find((r) => r.sessionId === id);
    if (!match) return;
    const key = sessionRowKey(match);
    setExpandedSessionKeys((prev) => new Set(prev).add(key));
    window.requestAnimationFrame(() => {
      document.getElementById(`activity-session-${key}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [location.state, loading, raw]);

  const dateFromMs = useMemo(() => startOfDayMs(new Date(dateFrom + "T12:00:00")), [dateFrom]);
  const dateToMs = useMemo(() => endOfDayMs(new Date(dateTo + "T12:00:00")), [dateTo]);

  const dateScoped = useMemo(
    () => filterAgencyActivityRows(raw, { dateFromMs, dateToMs }),
    [raw, dateFromMs, dateToMs]
  );

  const sessions = useMemo(
    () =>
      filterAgencyActivityRows(dateScoped, {
        agentId: agentFilter || null,
        type: typeFilter,
      }),
    [dateScoped, agentFilter, typeFilter]
  );

  const agents = useMemo(() => aggregateAgentPerformance(sessions), [sessions]);

  const agentOptions = useMemo(() => {
    const m = new Map<string, string>();
    dateScoped.forEach((r) => {
      if (r.agentId) m.set(r.agentId, r.agentName);
    });
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [dateScoped]);

  const sessionAlerts = useMemo(
    () => sessions.filter((s) => s.discrepancy > ACTIVITY_DISCREPANCY_EPSILON),
    [sessions]
  );

  const agentsRepeatAlert = useMemo(
    () => agents.filter((a) => a.discrepancySessionCount >= 2),
    [agents]
  );

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Journal d'activité"
        subtitle="Sessions billetterie et courrier, écarts et synthèse par agent (lecture seule)"
        icon={ClipboardList}
        right={
          <Link
            to="/agence/activite"
            className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            ← Activité
          </Link>
        }
      />

      {(sessionAlerts.length > 0 || agentsRepeatAlert.length > 0) && (
        <div className="mb-4 space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-100">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Points de vigilance
          </div>
          {sessionAlerts.length > 0 && (
            <p className="text-xs text-amber-900 dark:text-amber-200">
              {sessionAlerts.length} session(s) avec écart significatif sur la période affichée.
            </p>
          )}
          {agentsRepeatAlert.length > 0 && (
            <p className="text-xs text-amber-900 dark:text-amber-200">
              {agentsRepeatAlert.length} agent(s) avec plusieurs sessions en écart :{" "}
              {agentsRepeatAlert.map((a) => a.agentName).join(", ")}
            </p>
          )}
        </div>
      )}

      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="mb-3 text-sm font-semibold text-gray-900 dark:text-white">Filtres</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-gray-600 dark:text-slate-400">
            Du
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600 dark:text-slate-400">
            Au
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600 dark:text-slate-400">
            Agent
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="min-w-[12rem] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Tous</option>
              {agentOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-600 dark:text-slate-400">
            Type
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="all">Tous</option>
              <option value="guichet">Billetterie</option>
              <option value="courrier">Courrier</option>
            </select>
          </label>
        </div>
      </section>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <ClipboardList className="h-4 w-4" />
          Sessions ({loading ? "…" : sessions.length})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="w-8 p-1" aria-label="Chronologie" />
                <th className="p-2">Session</th>
                <th className="p-2">Agent</th>
                <th className="p-2">Type</th>
                <th className="p-2">Nature écart</th>
                <th className="p-2">Gravité</th>
                <th className="p-2 text-right">Attendu</th>
                <th className="p-2 text-right">Déclaré</th>
                <th className="p-2 text-right">Écart</th>
                <th className="p-2">Statut</th>
                <th className="p-2">Créé</th>
                <th className="p-2">Clôturé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={12} className="p-4 text-center text-gray-500">
                    Chargement…
                  </td>
                </tr>
              ) : sessions.length === 0 ? (
                <tr>
                  <td colSpan={12} className="p-4 text-center text-gray-500">
                    Aucune session sur cette période.
                  </td>
                </tr>
              ) : (
                sessions.flatMap((s) => {
                  const discAlert = s.discrepancy > ACTIVITY_DISCREPANCY_EPSILON;
                  const rowKey = sessionRowKey(s);
                  const expanded = expandedSessionKeys.has(rowKey);
                  const ctx = s.discrepancyContext;
                  const mainRow = (
                    <tr
                      key={rowKey}
                      id={`activity-session-${rowKey}`}
                      className={
                        discAlert
                          ? "bg-amber-50/80 dark:bg-amber-950/20"
                          : "bg-white dark:bg-slate-900"
                      }
                    >
                      <td className="p-1 align-top">
                        <button
                          type="button"
                          onClick={() => toggleSessionExpanded(rowKey)}
                          className="rounded p-1 text-gray-600 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-800"
                          aria-expanded={expanded}
                          title="Chronologie et détail"
                        >
                          {expanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>
                      </td>
                      <td className="max-w-[140px] truncate p-2 font-mono text-xs" title={s.sessionId}>
                        {s.sessionId.slice(0, 10)}…
                      </td>
                      <td className="p-2">{s.agentName}</td>
                      <td className="p-2">
                        {s.type === "guichet"
                          ? "Billetterie"
                          : s.type === "courrier"
                            ? "Courrier"
                            : s.type}
                      </td>
                      <td className="p-2 text-xs">
                        {ctx ? (
                          <span
                            className={
                              ctx.discrepancyType === "missing_cash"
                                ? "font-medium text-rose-700 dark:text-rose-300"
                                : ctx.discrepancyType === "over_cash"
                                  ? "font-medium text-violet-700 dark:text-violet-300"
                                  : "text-gray-700 dark:text-slate-300"
                            }
                          >
                            {discrepancyTypeLabel(ctx.discrepancyType)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-2 text-xs">
                        {ctx ? (
                          <span
                            className={
                              ctx.severity === "high"
                                ? "font-semibold text-red-700 dark:text-red-300"
                                : ctx.severity === "medium"
                                  ? "font-medium text-amber-800 dark:text-amber-300"
                                  : "text-gray-600 dark:text-slate-400"
                            }
                          >
                            {severityLabel(ctx.severity)}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="p-2 text-right tabular-nums">{money(s.totalExpected)}</td>
                      <td className="p-2 text-right tabular-nums">{money(s.totalDeclared)}</td>
                      <td
                        className={`p-2 text-right tabular-nums font-medium ${
                          discAlert ? "text-amber-800 dark:text-amber-300" : ""
                        }`}
                      >
                        {money(s.discrepancy)}
                      </td>
                      <td className="p-2 text-xs">{s.status}</td>
                      <td className="p-2 text-xs text-gray-600 dark:text-slate-400">{formatTs(s.createdAt)}</td>
                      <td className="p-2 text-xs text-gray-600 dark:text-slate-400">{formatTs(s.closedAt)}</td>
                    </tr>
                  );

                  const detailRow = expanded ? (
                    <tr key={`${rowKey}-detail`} className="bg-gray-50/90 dark:bg-slate-800/50">
                      <td colSpan={12} className="px-4 py-3 text-xs text-gray-700 dark:text-slate-300">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div>
                            <div className="mb-1 font-semibold text-gray-900 dark:text-white">Chronologie</div>
                            <ul className="list-inside list-disc space-y-1 text-gray-600 dark:text-slate-400">
                              {s.timeline.map((ev, i) => (
                                <li key={`${rowKey}-tl-${i}`}>
                                  <span className="font-medium text-gray-800 dark:text-slate-200">
                                    {timelineEventLabel(ev.event)}
                                  </span>
                                  {" — "}
                                  {formatTs(ev.at)}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div>
                            <div className="mb-1 font-semibold text-gray-900 dark:text-white">
                              Lecture de l&apos;écart
                            </div>
                            {ctx ? (
                              <>
                                <p className="mb-1 font-medium text-gray-800 dark:text-slate-200">
                                  Piste : {rootCauseLabel(ctx.rootCauseHint)}
                                </p>
                                <p className="mb-2 text-gray-600 dark:text-slate-400">{ctx.explanationHint}</p>
                                <p className="tabular-nums text-gray-800 dark:text-slate-200">
                                  Montant structurant : {money(ctx.discrepancyAmount)} ·{" "}
                                  {discrepancyTypeLabel(ctx.discrepancyType)} · Gravité :{" "}
                                  {severityLabel(ctx.severity)}
                                </p>
                              </>
                            ) : (
                              <p className="text-gray-500 dark:text-slate-500">
                                Pas d&apos;écart significatif sur les critères de contrôle.
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null;

                  return detailRow ? [mainRow, detailRow] : [mainRow];
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <UserCircle2 className="h-4 w-4" />
          Performance par agent
        </h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-600 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="p-2">Agent</th>
                <th className="p-2 text-right">Sessions</th>
                <th className="p-2 text-right">Σ attendu</th>
                <th className="p-2 text-right">Σ déclaré</th>
                <th className="p-2 text-right">Σ écarts</th>
                <th className="p-2 text-right">Sessions en écart</th>
                <th className="p-2 text-right">Moy. écart (litiges)</th>
                <th className="p-2">Dernier écart</th>
                <th className="p-2">Tendance</th>
                <th className="p-2">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-gray-500">
                    Chargement…
                  </td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-4 text-center text-gray-500">
                    Aucun agent sur le filtre courant.
                  </td>
                </tr>
              ) : (
                agents.map((a) => (
                  <tr
                    key={a.agentId}
                    className={
                      a.status === "WARNING"
                        ? "bg-amber-50/60 dark:bg-amber-950/15"
                        : "bg-white dark:bg-slate-900"
                    }
                  >
                    <td className="p-2">{a.agentName}</td>
                    <td className="p-2 text-right tabular-nums">{a.totalSessions}</td>
                    <td className="p-2 text-right tabular-nums">{money(a.totalExpected)}</td>
                    <td className="p-2 text-right tabular-nums">{money(a.totalDeclared)}</td>
                    <td className="p-2 text-right tabular-nums font-medium">{money(a.totalDiscrepancy)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {a.discrepancySessionCount >= 2 ? (
                        <span className="font-semibold text-amber-800 dark:text-amber-300">
                          {a.discrepancySessionCount} (répété)
                        </span>
                      ) : (
                        a.discrepancySessionCount
                      )}
                    </td>
                    <td className="p-2 text-right tabular-nums text-gray-700 dark:text-slate-300">
                      {money(a.averageDiscrepancy)}
                    </td>
                    <td className="p-2 text-xs text-gray-600 dark:text-slate-400">
                      {formatTs(a.lastDiscrepancyDate)}
                    </td>
                    <td className="p-2 text-xs">
                      <span
                        className={
                          a.trend === "worsening"
                            ? "font-medium text-rose-700 dark:text-rose-300"
                            : a.trend === "improving"
                              ? "font-medium text-emerald-700 dark:text-emerald-300"
                              : "text-gray-600 dark:text-slate-400"
                        }
                      >
                        {trendLabel(a.trend)}
                      </span>
                    </td>
                    <td className="p-2">
                      {a.status === "WARNING" ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
                          Vigilance
                        </span>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-slate-400">OK</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </StandardLayoutWrapper>
  );
}
