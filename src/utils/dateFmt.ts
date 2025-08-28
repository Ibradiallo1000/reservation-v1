// src/utils/dateFmt.ts
import type { Timestamp } from 'firebase/firestore';

export function toJSDate(v?: Date | string | number | Timestamp | null) {
  if (!v) return null;
  // Firestore Timestamp
  // @ts-ignore
  if (typeof v?.toDate === 'function') return v.toDate();
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') return new Date(v);
  return null;
}

export function fmtDate(v?: Date | string | number | Timestamp | null) {
  const d = toJSDate(v);
  return d
    ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
    : '—';
}

export function fmtDateTime(v?: Date | string | number | Timestamp | null) {
  const d = toJSDate(v);
  return d
    ? new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d)
    : '—';
}
