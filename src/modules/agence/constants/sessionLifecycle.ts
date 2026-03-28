/**
 * Cycle de vie unifié des postes guichet (Phase 1 — Stabilisation).
 * PENDING → ACTIVE → CLOSED → VALIDATED_AGENCY (comptable agence) → VALIDATED (chef d'agence, LOCKED)
 * Une seule collection pour les rapports : shiftReports.
 *
 * Source de vérité statut : document Firestore `agences/{agencyId}/shifts/{shiftId}` — champ **`status`**.
 * (Équivalent métier « session guichet » ; ne pas dériver l’UI depuis `cashStatus` seul.)
 */

export const SHIFT_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  CLOSED: 'closed',
  /** Validé par le comptable agence ; en attente validation chef d'agence. */
  VALIDATED_AGENCY: 'validated_agency',
  /** Validé par le chef d'agence (contrôle final) ; verrouillé. */
  VALIDATED: 'validated',
} as const;

export const CASH_SESSION_STATUS = {
  OUVERTE: "ouverte",
  FERMEE: "fermee",
  VALIDEE_MANAGER: "validee_manager",
  VALIDEE_COMPTABLE: "validee_comptable",
} as const;

/** Niveau de validation pour shiftReports. */
export const VALIDATION_LEVEL = {
  AGENCY: 'agency',
  COMPANY: 'company',
} as const;

export type ShiftStatusValue = typeof SHIFT_STATUS[keyof typeof SHIFT_STATUS];
export type CashSessionStatusValue = typeof CASH_SESSION_STATUS[keyof typeof CASH_SESSION_STATUS];

const KNOWN_SHIFT_STATUSES: ReadonlySet<string> = new Set<string>([
  SHIFT_STATUS.PENDING,
  SHIFT_STATUS.ACTIVE,
  SHIFT_STATUS.PAUSED,
  SHIFT_STATUS.CLOSED,
  SHIFT_STATUS.VALIDATED_AGENCY,
  SHIFT_STATUS.VALIDATED,
]);

/**
 * Lit exclusivement le champ document `status` (Firestore). Pas de fusion avec `cashStatus`.
 */
export function parseShiftStatusFromFirestore(data: Record<string, unknown>): ShiftStatusValue {
  const raw = String(data.status ?? "").trim().toLowerCase();
  if (KNOWN_SHIFT_STATUSES.has(raw)) {
    return raw as ShiftStatusValue;
  }
  const underscored = raw.replace(/\s+/g, "_");
  if (KNOWN_SHIFT_STATUSES.has(underscored)) {
    return underscored as ShiftStatusValue;
  }
  console.warn("[shift] status Firestore inconnu, fallback pending:", data.status);
  return SHIFT_STATUS.PENDING;
}

export function mapCashToLegacy(cashStatus: CashSessionStatusValue): ShiftStatusValue {
  switch (cashStatus) {
    case CASH_SESSION_STATUS.OUVERTE:
      return SHIFT_STATUS.ACTIVE;
    case CASH_SESSION_STATUS.FERMEE:
      return SHIFT_STATUS.CLOSED;
    case CASH_SESSION_STATUS.VALIDEE_MANAGER:
      return SHIFT_STATUS.VALIDATED_AGENCY;
    case CASH_SESSION_STATUS.VALIDEE_COMPTABLE:
      return SHIFT_STATUS.VALIDATED;
    default:
      return SHIFT_STATUS.PENDING;
  }
}

export function mapLegacyToCash(status: ShiftStatusValue): CashSessionStatusValue {
  switch (status) {
    case SHIFT_STATUS.ACTIVE:
    case SHIFT_STATUS.PAUSED:
    case SHIFT_STATUS.PENDING:
      return CASH_SESSION_STATUS.OUVERTE;
    case SHIFT_STATUS.CLOSED:
      return CASH_SESSION_STATUS.FERMEE;
    case SHIFT_STATUS.VALIDATED_AGENCY:
      return CASH_SESSION_STATUS.VALIDEE_MANAGER;
    case SHIFT_STATUS.VALIDATED:
      return CASH_SESSION_STATUS.VALIDEE_COMPTABLE;
    default:
      return CASH_SESSION_STATUS.OUVERTE;
  }
}

/** Statuts qui permettent d'avoir "un poste ouvert" (un seul à la fois par guichetier). */
export const OPEN_SHIFT_STATUSES: ShiftStatusValue[] = [
  SHIFT_STATUS.PENDING,
  SHIFT_STATUS.ACTIVE,
  SHIFT_STATUS.PAUSED,
];

/** Statuts clôturables (avant validation définitive). */
export const CLOSABLE_STATUSES: ShiftStatusValue[] = [
  SHIFT_STATUS.PENDING,
  SHIFT_STATUS.ACTIVE,
  SHIFT_STATUS.PAUSED,
];

/** Une fois VALIDATED, le poste est verrouillé (plus de modification). */
export const LOCKED_STATUS = SHIFT_STATUS.VALIDATED;

/** Nom unique de la collection des rapports (plus de shift_reports). */
export const SHIFT_REPORTS_COLLECTION = 'shiftReports';

/** Verrouillé uniquement après validation chef d'agence (VALIDATED). VALIDATED_AGENCY reste modifiable par le chef. */
export function isShiftLocked(status: string): boolean {
  return status === SHIFT_STATUS.VALIDATED;
}

export function canCloseShift(status: string): boolean {
  return CLOSABLE_STATUSES.includes(status as ShiftStatusValue);
}
