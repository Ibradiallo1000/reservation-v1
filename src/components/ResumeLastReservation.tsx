import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/firebaseConfig";

type Props = {
  /** Afficher seulement si la résa correspond à ce slug (utile sur la page compagnie) */
  onlyForSlug?: string;
  className?: string;
};

type LastResa = {
  id: string;
  slug: string;
  companyId: string;
  agencyId: string;
  createdAt?: number;
};

const chip = (statut?: string) => {
  const s = (statut || "").toLowerCase();
  if (s === "payé" || s === "paye" || s === "payé")
    return { label: "Confirmée", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (s === "preuve_recue")
    return { label: "Vérification", cls: "bg-violet-100 text-violet-700 border-violet-200" };
  if (s === "paiement_en_cours")
    return { label: "Paiement en cours", cls: "bg-blue-100 text-blue-700 border-blue-200" };
  if (s === "en_attente" || s === "en_attente_paiement")
    return { label: "En attente", cls: "bg-amber-100 text-amber-700 border-amber-200" };
  if (s === "annule" || s === "annulé")
    return { label: "Annulée", cls: "bg-gray-100 text-gray-700 border-gray-200" };
  return { label: s || "—", cls: "bg-slate-100 text-slate-700 border-slate-200" };
};

export default function ResumeLastReservation({ onlyForSlug, className }: Props) {
  const navigate = useNavigate();
  const [resa, setResa] = useState<LastResa | null>(null);
  const [statut, setStatut] = useState<string | undefined>(undefined);
  const [reference, setReference] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  // lire depuis localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("lastReservation");
      if (!raw) return;
      const parsed = JSON.parse(raw) as LastResa;
      if (onlyForSlug && parsed.slug !== onlyForSlug) return;
      setResa(parsed);
    } catch {/* ignore */}
  }, [onlyForSlug]);

  // écoute Firestore
  useEffect(() => {
    if (!resa?.id || !resa?.companyId || !resa?.agencyId) { setLoading(false); return; }
    const ref = doc(db, "companies", resa.companyId, "agences", resa.agencyId, "reservations", resa.id);
    const unsub = onSnapshot(ref, (snap) => {
      setLoading(false);
      if (!snap.exists()) return;
      const d = snap.data() as any;
      setStatut(d?.statut);
      setReference(d?.referenceCode);
    }, () => setLoading(false));
    return () => unsub();
  }, [resa?.id, resa?.companyId, resa?.agencyId]);

  const canShow = useMemo(() => !!resa?.id && (!onlyForSlug || resa.slug === onlyForSlug), [resa, onlyForSlug]);
  if (!canShow) return null;

  const c = chip(statut);
  const url = `/${encodeURIComponent(resa!.slug)}/reservation/${encodeURIComponent(resa!.id)}`;
  const isConfirmed = (statut || "").toLowerCase() === "payé" || (statut || "").toLowerCase() === "paye" || (statut || "").toLowerCase() === "payé";

  return (
    <div className={`rounded-xl border bg-white p-4 shadow-sm ${className || ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-gray-900 font-semibold">Retrouver ma réservation</div>
          <div className="text-xs text-gray-600">
            {loading ? "Mise à jour du statut…" :
              reference ? <>Référence&nbsp;<span className="font-medium">{reference}</span></> :
              "Réservation en cours"}
          </div>
          {statut && (
            <span className={`inline-flex mt-2 items-center rounded-full border px-2 py-0.5 text-xs font-medium ${c.cls}`}>
              {c.label}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              // Toujours permettre d’ouvrir la page de suivi
              navigate(url, { state: resa });
            }}
            className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium ${isConfirmed ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-orange-600 text-white hover:bg-orange-700"}`}
          >
            {isConfirmed ? "Voir mon billet" : "Suivre ma réservation"}
          </button>
          <button
            onClick={() => { localStorage.removeItem("lastReservation"); window.location.reload(); }}
            className="text-xs text-gray-500 underline self-center"
            title="Effacer le rappel"
          >
            Effacer
          </button>
        </div>
      </div>
    </div>
  );
}
