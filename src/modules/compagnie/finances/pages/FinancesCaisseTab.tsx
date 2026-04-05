/**
 * Onglet Caisse — sessions guichet (en attente) + détail encaissements / clôtures (sans bloc liquidité ledger en tête).
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalMoneyPositions } from "@/contexts/GlobalMoneyPositionsContext";
import { SectionCard, MetricCard } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import CompanyCashPage from "@/modules/compagnie/cash/CompanyCashPage";
import { Users } from "lucide-react";

export default function FinancesCaisseTab() {
  const { user } = useAuth();
  const { companyId: routeId } = useParams<{ companyId: string }>();
  const companyId = routeId ?? user?.companyId ?? "";
  const money = useFormatCurrency();
  const positions = useGlobalMoneyPositions();
  const [sessionsOpen, setSessionsOpen] = useState<number | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const agencesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
        let n = 0;
        for (const d of agencesSnap.docs) {
          const shiftsRef = collection(db, "companies", companyId, "agences", d.id, "shifts");
          const qShifts = query(shiftsRef, where("status", "in", ["active", "paused"]), limit(40));
          const shiftsSnap = await getDocs(qShifts);
          n += shiftsSnap.size;
        }
        if (!cancelled) setSessionsOpen(n);
      } catch {
        if (!cancelled) setSessionsOpen(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return (
    <div className="space-y-6">
      <SectionCard title="Sessions guichet" icon={Users}>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Argent encore lié à une session non validée par la comptabilité — hors grand livre définitif.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <MetricCard
            label="Sessions ouvertes"
            value={sessionsOpen == null ? "—" : String(sessionsOpen)}
            icon={Users}
          />
          <MetricCard
            label="Montant en attente de validation"
            value={money(positions.snapshot.pendingGuichet)}
            icon={Users}
          />
        </div>
      </SectionCard>
      <CompanyCashPage embedded financesTabMode />
    </div>
  );
}
