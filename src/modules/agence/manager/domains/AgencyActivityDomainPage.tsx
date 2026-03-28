/**
 * Domaine « Activité » — supervision chef d'agence (opérations temps réel).
 */
import React from "react";
import { Link } from "react-router-dom";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { LayoutDashboard } from "lucide-react";
import AgencyChiefDashboardLite from "../AgencyChiefDashboardLite";

export default function AgencyActivityDomainPage() {
  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Activité en temps réel"
        subtitle="Suivi des opérations en cours dans l'agence"
        icon={LayoutDashboard}
      />

      <div className="mb-4">
        <Link
          to="/agence/activity-log"
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-900 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100"
        >
          <LayoutDashboard className="h-4 w-4" />
          Journal des sessions et contrôles
        </Link>
      </div>

      <section id="activite-synthese" className="scroll-mt-28">
        <AgencyChiefDashboardLite />
      </section>
    </StandardLayoutWrapper>
  );
}
