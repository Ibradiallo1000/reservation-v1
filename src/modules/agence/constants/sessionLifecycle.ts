/**
 * Cycle de vie unifié des postes guichet (Phase 1 — Stabilisation).
 * PENDING → ACTIVE → CLOSED → VALIDATED_AGENCY (comptable agence) → VALIDATED (chef comptable, LOCKED)
 * Une seule collection pour les rapports : shiftReports.
 */

export const SHIFT_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  CLOSED: 'closed',
  /** Validé par le comptable agence ; en attente validation chef comptable. */
  VALIDATED_AGENCY: 'validated_agency',
  /** Validé par le chef comptable (niveau compagnie) ; verrouillé. */
  VALIDATED: 'validated',
} as const;

/** Niveau de validation pour shiftReports. */
export const VALIDATION_LEVEL = {
  AGENCY: 'agency',
  COMPANY: 'company',
} as const;

export type ShiftStatusValue = typeof SHIFT_STATUS[keyof typeof SHIFT_STATUS];

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

/** Verrouillé uniquement après validation chef comptable (VALIDATED). VALIDATED_AGENCY reste modifiable par le chef. */
export function isShiftLocked(status: string): boolean {
  return status === SHIFT_STATUS.VALIDATED;
}

export function canCloseShift(status: string): boolean {
  return CLOSABLE_STATUSES.includes(status as ShiftStatusValue);
}
