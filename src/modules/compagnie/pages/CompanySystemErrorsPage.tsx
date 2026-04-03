/**
 * Journal interne des erreurs système (incohérences véhicule/trajet, etc.).
 * Données : companies/{companyId}/systemErrors
 */
import React, { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, SectionCard, StandardLayoutWrapper } from "@/ui";

type SystemErrorRow = {
  id: string;
  type?: string;
  severity?: string;
  tripInstanceId?: string;
  vehicleId?: string;
  message?: string;
  createdAt?: { toDate?: () => Date };
  [key: string]: unknown;
};

function fmtWhen(v: unknown): string {
  if (v && typeof v === "object" && "toDate" in v && typeof (v as { toDate: () => Date }).toDate === "function") {
    try {
      return (v as { toDate: () => Date }).toDate().toLocaleString("fr-FR");
    } catch {
      return "—";
    }
  }
  return "—";
}

const CompanySystemErrorsPage: React.FC = () => {
  const { user } = useAuth() as { user?: { companyId?: string } };
  const companyId = user?.companyId ?? "";
  const [rows, setRows] = useState<SystemErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const q = query(
          collection(db, "companies", companyId, "systemErrors"),
          orderBy("createdAt", "desc"),
          limit(200)
        );
        const snap = await getDocs(q);
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as SystemErrorRow[];
        if (!cancelled) setRows(list);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Chargement impossible.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return (
    <StandardLayoutWrapper>
      <PageHeader title="Erreurs système" subtitle="Incohérences détectées et traces critiques (lecture seule)." />
      <SectionCard title="Journal">
        {!companyId ? (
          <p className="text-sm text-slate-600">Société non chargée.</p>
        ) : loading ? (
          <p className="text-sm text-slate-600">Chargement…</p>
        ) : err ? (
          <p className="text-sm text-red-700">{err}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-600">Aucune entrée pour le moment.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-slate-500">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Gravité</th>
                  <th className="py-2 pr-4">Trajet</th>
                  <th className="py-2 pr-4">Véhicule</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100">
                    <td className="py-2 pr-4 whitespace-nowrap">{fmtWhen(r.createdAt)}</td>
                    <td className="py-2 pr-4">{String(r.type ?? "—")}</td>
                    <td className="py-2 pr-4">{String(r.severity ?? "—")}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{String(r.tripInstanceId ?? "—")}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{String(r.vehicleId ?? "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default CompanySystemErrorsPage;
