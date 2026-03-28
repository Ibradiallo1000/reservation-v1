export type IncidentSeverity = "warning" | "critical";
export type IncidentStatus = "open" | "in_progress" | "resolved";

export interface ChefIncident {
  id: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  createdAtIso: string;
  createdBy: { id: string; name?: string };
  reason: string;
  relatedSessionId: string;
  source: "activity" | "cash";
  type: "flag" | "suspend_request" | "suspension";
}

function incidentKey(companyId: string, agencyId: string) {
  return `teliya:chef:incidents:${companyId}:${agencyId}`;
}

export function listChefIncidents(companyId: string, agencyId: string): ChefIncident[] {
  try {
    const raw = localStorage.getItem(incidentKey(companyId, agencyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ChefIncident[]) : [];
  } catch {
    return [];
  }
}

export function createChefIncident(companyId: string, agencyId: string, incident: Omit<ChefIncident, "id" | "createdAtIso">): ChefIncident {
  const next: ChefIncident = {
    ...incident,
    id: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAtIso: new Date().toISOString(),
  };
  const list = listChefIncidents(companyId, agencyId);
  list.unshift(next);
  try {
    localStorage.setItem(incidentKey(companyId, agencyId), JSON.stringify(list.slice(0, 300)));
  } catch {
    // ignore storage failures
  }
  return next;
}
