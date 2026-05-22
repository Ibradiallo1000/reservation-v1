import React from "react";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

type PremiumGateProps = {
  companyId?: string;
  featureName?: string;
  className?: string;
};

export default function PremiumGate({ companyId, featureName, className = "" }: PremiumGateProps) {
  const target = companyId ? `/compagnie/${companyId}/parametres/plan` : "/compagnie/parametres/plan";

  return (
    <div className={`rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950 ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700 shadow-sm">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-semibold">🔒 Disponible en Premium</p>
            {featureName ? <p className="mt-1 text-sm text-amber-800">{featureName}</p> : null}
          </div>
        </div>
        <Link
          to={target}
          className="inline-flex items-center justify-center rounded-lg bg-[var(--btn-primary,#FF6600)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
        >
          Demander une mise a niveau
        </Link>
      </div>
    </div>
  );
}
