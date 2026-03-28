import React, { useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SectionCard, ActionButton } from "@/ui";
import {
  generateTripInstancesFromWeeklyTrips,
  DEFAULT_TRIP_INSTANCE_GENERATION_DAYS,
} from "@/modules/compagnie/tripInstances/generateTripInstancesFromWeeklyTrips";
import { toast } from "sonner";

interface Props {
  companyId: string;
}

function normalizedRole(role: string | undefined): string {
  return String(role || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

const ROLES_CAN_GENERATE = new Set(["admin_compagnie", "company_ceo", "admin_platforme"]);

export const GenerateTripInstancesPlanningCard: React.FC<Props> = ({ companyId }) => {
  const { user } = useAuth();
  const [running, setRunning] = useState(false);

  const r = normalizedRole(user?.role);
  if (!ROLES_CAN_GENERATE.has(r)) return null;
  if (!companyId?.trim()) return null;

  const run = async () => {
    if (!companyId) return;
    setRunning(true);
    try {
      const res = await generateTripInstancesFromWeeklyTrips(companyId, {
        createdBy: user?.uid ?? "admin_ui",
      });
      const errPart = res.errors > 0 ? `, ${res.errors} erreur(s)` : "";
      toast.success("Planning matérialisé", {
        description: `${res.created} instance(s) créée(s), ${res.skipped} ignorée(s) ou déjà présente(s)${errPart}.`,
      });
    } catch (e) {
      toast.error("Génération impossible", {
        description: e instanceof Error ? e.message : "Vérifiez vos droits Firestore ou réessayez.",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <SectionCard
      title="Planning des bus (tripInstances)"
      icon={CalendarClock}
      className="mt-8"
      description={`Crée les documents manquants pour les ${DEFAULT_TRIP_INSTANCE_GENERATION_DAYS} prochains jours à partir des trajets hebdomadaires actifs (toutes agences). Id déterministe = pas de doublon.`}
    >
      <ActionButton type="button" onClick={run} disabled={running || !companyId}>
        {running ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
            <span className="ml-2">Génération…</span>
          </>
        ) : (
          "Générer le planning"
        )}
      </ActionButton>
    </SectionCard>
  );
};

export default GenerateTripInstancesPlanningCard;
