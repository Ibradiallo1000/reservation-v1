/**
 * Finances (CEO) - argent disponible, flux recents, etat des validations.
 */
import React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { DollarSign } from "lucide-react";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { pageMaxWidthFluid } from "@/ui/foundation";
import { TimeFilterBar, type RangeKey } from "@/modules/compagnie/admin/components/CompanyDashboard/TimeFilterBar";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useAuth } from "@/contexts/AuthContext";
import FinancesLiquiditesTab from "../finances/pages/FinancesLiquiditesTab";
import FinancesMouvementsTab from "../finances/pages/FinancesMouvementsTab";
import FinancesCaisseTab from "../finances/pages/FinancesCaisseTab";

export default function FinancesPage() {
  const { user } = useAuth();
  const globalPeriod = useGlobalPeriodContext();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const mouvementsMountRef = React.useRef<HTMLDivElement | null>(null);
  const caisseMountRef = React.useRef<HTMLDivElement | null>(null);
  const [deferredSections, setDeferredSections] = React.useState({ mouvements: false, caisse: false });

  // Compat: anciens liens ?tab=... ignores, page unique.
  React.useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["mouvements", "caisse", "liquidites", "ca"].includes(tab)) {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  React.useEffect(() => {
    setDeferredSections({ mouvements: false, caisse: false });
  }, [companyId]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("IntersectionObserver" in window)) {
      setDeferredSections({ mouvements: true, caisse: true });
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const section = (entry.target as HTMLElement).dataset.section;
          if (section === "mouvements") {
            setDeferredSections((prev) => (prev.mouvements ? prev : { ...prev, mouvements: true }));
          }
          if (section === "caisse") {
            setDeferredSections((prev) => (prev.caisse ? prev : { ...prev, caisse: true }));
          }
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "400px 0px 400px 0px" }
    );

    if (mouvementsMountRef.current) observer.observe(mouvementsMountRef.current);
    if (caisseMountRef.current) observer.observe(caisseMountRef.current);

    return () => observer.disconnect();
  }, [companyId]);

  const range: RangeKey =
    globalPeriod.preset === "day"
      ? "day"
      : globalPeriod.preset === "month"
        ? "month"
        : "custom";
  const customStart = globalPeriod.preset === "custom" ? globalPeriod.startDate : null;
  const customEnd = globalPeriod.preset === "custom" ? globalPeriod.endDate : null;

  const setRange = (v: RangeKey) => {
    if (v === "day") return globalPeriod.setPreset("day");
    if (v === "month") return globalPeriod.setPreset("month");
    if (v === "custom") return globalPeriod.setPreset("custom");

    const now = new Date();
    if (v === "prev_month") {
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endPrev = new Date(firstOfThisMonth.getTime() - 1);
      const startPrev = new Date(endPrev.getFullYear(), endPrev.getMonth(), 1);
      const start = `${startPrev.getFullYear()}-${String(startPrev.getMonth() + 1).padStart(2, "0")}-${String(
        startPrev.getDate()
      ).padStart(2, "0")}`;
      const end = `${endPrev.getFullYear()}-${String(endPrev.getMonth() + 1).padStart(2, "0")}-${String(
        endPrev.getDate()
      ).padStart(2, "0")}`;
      return globalPeriod.setCustomRange(start, end);
    }

    if (v === "ytd") {
      const start = `${now.getFullYear()}-01-01`;
      const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      return globalPeriod.setCustomRange(start, end);
    }

    if (v === "12m") {
      const endD = now;
      const startD = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const start = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, "0")}-${String(
        startD.getDate()
      ).padStart(2, "0")}`;
      const end = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(
        endD.getDate()
      ).padStart(2, "0")}`;
      return globalPeriod.setCustomRange(start, end);
    }
  };

  if (!companyId) {
    return (
      <StandardLayoutWrapper maxWidthClass={pageMaxWidthFluid}>
        <PageHeader title="Finances" icon={DollarSign} />
        <p className="text-gray-500">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper maxWidthClass={pageMaxWidthFluid}>
      <PageHeader
        title="Finances"
        subtitle="Ou est l'argent, quels risques et quelle action prioritaire."
        icon={DollarSign}
        right={
          <TimeFilterBar
            range={range}
            setRange={setRange}
            customStart={customStart}
            setCustomStart={(v) => globalPeriod.setCustomRange(v ?? globalPeriod.startDate, globalPeriod.endDate)}
            customEnd={customEnd}
            setCustomEnd={(v) => globalPeriod.setCustomRange(globalPeriod.startDate, v ?? globalPeriod.endDate)}
          />
        }
      />
      <div className="space-y-3">
        <FinancesLiquiditesTab />
        <div ref={mouvementsMountRef} data-section="mouvements">
          {deferredSections.mouvements ? (
            <FinancesMouvementsTab />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Flux recents charges a l'ouverture de la section.
            </div>
          )}
        </div>
        <div ref={caisseMountRef} data-section="caisse">
          {deferredSections.caisse ? (
            <FinancesCaisseTab />
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Validations en attente chargees a l'ouverture de la section.
            </div>
          )}
        </div>
      </div>
    </StandardLayoutWrapper>
  );
}
