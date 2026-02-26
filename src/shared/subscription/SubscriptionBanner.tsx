/**
 * Teliya SaaS – Subscription Status Banner
 *
 * Displays contextual banners based on the company's subscription status.
 * Integrates into InternalLayout via the `banner` prop.
 *
 * Rules:
 *   trial      → blue info banner with countdown
 *   active     → no banner
 *   grace      → amber warning banner
 *   restricted → red warning banner
 *   suspended  → red blocking banner
 */
import React, { useMemo } from "react";
import { AlertTriangle, Clock, ShieldAlert, Ban, Info } from "lucide-react";
import type { SubscriptionStatus } from "./types";

interface SubscriptionBannerProps {
  subscriptionStatus?: SubscriptionStatus | null;
  trialEndsAt?: Date | null;
  companyName?: string;
}

const SubscriptionBanner: React.FC<SubscriptionBannerProps> = ({
  subscriptionStatus,
  trialEndsAt,
  companyName,
}) => {
  const status = subscriptionStatus ?? "active";

  const trialDaysLeft = useMemo(() => {
    if (status !== "trial" || !trialEndsAt) return null;
    const now = new Date();
    const diff = trialEndsAt.getTime() - now.getTime();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [status, trialEndsAt]);

  if (status === "active") return null;

  if (status === "trial") {
    return (
      <div className="bg-blue-50 border-b border-blue-200 px-4 md:px-6 py-2.5">
        <div className="flex items-center gap-2 max-w-7xl mx-auto">
          <Info className="h-4 w-4 text-blue-600 shrink-0" />
          <p className="text-sm text-blue-800">
            <strong>Période d'essai</strong>
            {trialDaysLeft !== null && (
              <> — {trialDaysLeft <= 0
                ? "expirée"
                : <>il reste <strong>{trialDaysLeft} jour{trialDaysLeft > 1 ? "s" : ""}</strong></>
              }</>
            )}
            . Effectuez un paiement pour maintenir l'accès complet.
          </p>
        </div>
      </div>
    );
  }

  if (status === "grace") {
    return (
      <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-2.5">
        <div className="flex items-center gap-2 max-w-7xl mx-auto">
          <Clock className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>Abonnement expiré — Période de grâce.</strong>{" "}
            Veuillez régulariser votre paiement pour éviter la restriction de votre compte.
          </p>
        </div>
      </div>
    );
  }

  if (status === "restricted") {
    return (
      <div className="bg-red-50 border-b border-red-200 px-4 md:px-6 py-2.5">
        <div className="flex items-center gap-2 max-w-7xl mx-auto">
          <ShieldAlert className="h-4 w-4 text-red-600 shrink-0" />
          <p className="text-sm text-red-800">
            <strong>Compte restreint.</strong>{" "}
            La création de réservations et d'agences est désactivée. Le tableau de bord reste accessible.
            Contactez Teliya pour régulariser votre abonnement.
          </p>
        </div>
      </div>
    );
  }

  if (status === "suspended") {
    return (
      <div className="bg-red-100 border-b border-red-300 px-4 md:px-6 py-3">
        <div className="flex items-center gap-2 max-w-7xl mx-auto">
          <Ban className="h-4 w-4 text-red-700 shrink-0" />
          <p className="text-sm text-red-900 font-medium">
            <strong>Compte suspendu.</strong>{" "}
            L'accès est limité. Seul le paiement est disponible. Contactez le support Teliya.
          </p>
        </div>
      </div>
    );
  }

  return null;
};

export default SubscriptionBanner;
