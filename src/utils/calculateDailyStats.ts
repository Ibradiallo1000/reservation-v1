import type { Reservation } from '@/types/index';

export function calculateDailyStats(reservations: Reservation[], start: Date, end: Date) {
  const days: Record<string, { sales: number; revenue: number }> = {};

  // Initialiser toutes les dates de la période
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateKey = d.toISOString().slice(0, 10);
    days[dateKey] = { sales: 0, revenue: 0 };
  }

  // Remplir les valeurs par date
  reservations.forEach(res => {
    const dateKey = res.createdAt.toDate().toISOString().slice(0, 10);
    if (days[dateKey]) {
      days[dateKey].sales += 1;
      days[dateKey].revenue += res.montant || 0;
    }
  });

  return Object.entries(days).map(([date, values]) => ({
    date,
    ...values
  }));
}
