// src/utils/stats.ts

import type { Reservation } from '@/types/index';
import type { Timestamp } from 'firebase/firestore';

// 🔑 Utilitaire safe pour convertir Timestamp ou Date
function toJSDate(input: Date | Timestamp): Date {
  return input instanceof Date ? input : input.toDate();
}

export function calculateDailyStats(
  reservations: Reservation[],
  start: Date,
  end: Date
): { date: string; reservations: number; revenue: number }[] {
  const days: Record<string, { reservations: number; revenue: number }> = {};

  // ✅ Initialiser chaque jour avec 0
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    days[key] = { reservations: 0, revenue: 0 };
  }

  reservations.forEach(res => {
    const dateKey = toJSDate(res.createdAt).toISOString().slice(0, 10);
    if (days[dateKey]) {
      days[dateKey].reservations += 1;
      days[dateKey].revenue += res.montant || 0;
    }
  });

  return Object.entries(days).map(([date, values]) => ({
    date,
    ...values,
  }));
}
