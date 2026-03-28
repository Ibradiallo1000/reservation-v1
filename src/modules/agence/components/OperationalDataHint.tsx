import React from "react";

const badgeBase =
  "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";

/** Indique une donnée terrain / opérationnelle (réservations, sessions, cashTransactions, etc.) — pas le grand livre. */
export function OperationalSourceBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`${badgeBase} border-amber-300 bg-amber-50 text-amber-950 ${className}`}
      title="Donnée d’activité — la comptabilité utilise les écrans dédiés"
    >
      Donnée opérationnelle · non comptabilisée
    </span>
  );
}

/** Registre ou saisie terrain hors écritures comptables officielles. */
export function DocumentaryRegisterBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`${badgeBase} border-slate-300 bg-slate-100 text-slate-800 ${className}`}
      title="Registre documentaire — pas la vérité comptable"
    >
      Source terrain · registre non comptable
    </span>
  );
}

export function OperationalHintRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200/90 bg-amber-50/80 px-3 py-2 text-xs text-amber-950">
      <OperationalSourceBadge />
      <span className="min-w-0 leading-snug">{children}</span>
    </div>
  );
}

export function DocumentaryHintRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
      <DocumentaryRegisterBadge />
      <span className="min-w-0 leading-snug">{children}</span>
    </div>
  );
}
