import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import type { Role } from "@/roles-permissions";
import type { CustomUser } from "@/types/auth";
import { db } from "@/firebaseConfig";
import { doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import type { Shipment } from "../domain/shipment.types";
import { shipmentRef, shipmentsRef } from "../domain/firestorePaths";
import { markShipmentInTransit } from "../services/markShipmentInTransit";
import { markShipmentArrived } from "../services/markShipmentArrived";
import { markReadyForPickup } from "../services/markReadyForPickup";
import { confirmPickup } from "../services/confirmPickup";
import { confirmShipmentArrivalValidation } from "../services/shipmentArrivalControlService";
import { formatFrenchDateTime } from "@/shared/date/fmtFrench";
import { buildPublicTrackWebUrl } from "../utils/shipmentTrackingCrypto";

/** Rôles pouvant ouvrir un colis de n’importe quelle agence de la compagnie (scan / recherche). */
const COMPANY_WIDE_SCAN = new Set<Role>([
  "admin_compagnie",
  "financial_director",
  "company_accountant",
  "responsable_logistique",
  "chef_garage",
]);

function canAccessShipmentForScan(role: Role | undefined, userAgencyId: string, s: Shipment): boolean {
  const aid = userAgencyId.trim();
  if (!aid) return false;
  if (role && COMPANY_WIDE_SCAN.has(role)) return true;
  return s.originAgencyId === aid || s.destinationAgencyId === aid;
}

function buildArrivalWhatsAppHref(s: Shipment, destAgencyLabel: string, origin: string): string | null {
  const phoneDigits = String(s.receiver?.phone ?? "").replace(/\D/g, "");
  const pid = s.trackingPublicId?.trim();
  if (!phoneDigits || !pid) return null;
  const ref = s.shipmentNumber ?? s.shipmentId;
  const trackUrl = buildPublicTrackWebUrl(origin, pid);
  const place = destAgencyLabel.trim() || "l’agence de destination";
  const line =
    s.currentStatus === "READY_FOR_PICKUP"
      ? `Votre colis ${ref} est prêt pour retrait à ${place}.`
      : `Votre colis ${ref} est arrivé à ${place}.`;
  const text = `Bonjour 👋\n\n${line}\n\nMerci de passer récupérer votre colis.\n\n🔗 Suivi : ${trackUrl}\n\nMerci 🙏`;
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

function statusLabelFr(s: string): string {
  const m: Record<string, string> = {
    CREATED: "Enregistré",
    IN_TRANSIT: "En transit",
    ARRIVED: "Arrivé",
    READY_FOR_PICKUP: "Prêt pour retrait",
    DELIVERED: "Remis",
    CANCELLED: "Annulé",
  };
  return m[s] ?? s;
}

/**
 * Scan / recherche agent : détails colis + actions explicites (aucune action auto).
 */
export default function ScanShipmentPage() {
  const { shipmentId: routeShipmentId } = useParams<{ shipmentId: string }>();
  const { user } = useAuth() as { user?: CustomUser | null };
  const companyId = String(user?.companyId ?? "").trim();
  const agencyId = String(user?.agencyId ?? "").trim();
  const uid = String(user?.uid ?? "").trim();
  const userRole = user?.role;

  const [searchNumber, setSearchNumber] = useState("");
  const [phoneQuery, setPhoneQuery] = useState("");
  const [phoneChoices, setPhoneChoices] = useState<(Shipment & { shipmentId: string })[]>([]);
  const [shipment, setShipment] = useState<(Shipment & { shipmentId: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [destAgencyLabel, setDestAgencyLabel] = useState("");

  const loadById = useCallback(
    async (id: string) => {
      if (!companyId || !id.trim()) return;
      setLoading(true);
      setError(null);
      setShipment(null);
      try {
        const snap = await getDoc(shipmentRef(db, companyId, id.trim()));
        if (!snap.exists()) {
          setError("Envoi introuvable pour cette compagnie.");
          return;
        }
        const row = { ...(snap.data() as Shipment), shipmentId: snap.id };
        if (!canAccessShipmentForScan(userRole, agencyId, row)) {
          setError("Cet envoi n’est pas lié à votre agence (origine ou destination).");
          return;
        }
        setShipment(row);
      } catch {
        setError("Chargement impossible.");
      } finally {
        setLoading(false);
      }
    },
    [companyId, agencyId, userRole]
  );

  useEffect(() => {
    const id = routeShipmentId?.trim();
    if (id) void loadById(id);
  }, [routeShipmentId, loadById]);

  useEffect(() => {
    if (!shipment?.destinationAgencyId || !companyId) {
      setDestAgencyLabel("");
      return;
    }
    const destId = shipment.destinationAgencyId;
    let cancelled = false;
    void (async () => {
      const r = await getDoc(doc(db, "companies", companyId, "agences", destId));
      if (cancelled) return;
      if (!r.exists()) {
        setDestAgencyLabel(destId);
        return;
      }
      const d = r.data() as { nomAgence?: string; nom?: string };
      setDestAgencyLabel(String(d.nomAgence ?? d.nom ?? destId).trim() || destId);
    })();
    return () => {
      cancelled = true;
    };
  }, [shipment?.destinationAgencyId, shipment?.shipmentId, companyId]);

  const searchByShipmentNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = searchNumber.trim();
    if (!companyId || !num) return;
    setLoading(true);
    setError(null);
    setShipment(null);
    setPhoneChoices([]);
    try {
      const q = query(shipmentsRef(db, companyId), where("shipmentNumber", "==", num), limit(5));
      const snap = await getDocs(q);
      if (snap.empty) {
        setError("Aucun envoi avec ce numéro.");
        return;
      }
      if (snap.docs.length > 1) {
        setError("Plusieurs envois correspondent : affinez ou utilisez l’ID document.");
        return;
      }
      const d = snap.docs[0]!;
      const row = { ...(d.data() as Shipment), shipmentId: d.id };
      if (!canAccessShipmentForScan(userRole, agencyId, row)) {
        setError("Cet envoi n’est pas lié à votre agence (origine ou destination).");
        return;
      }
      setShipment(row);
    } catch {
      setError("Recherche impossible (index Firestore manquant ?).");
    } finally {
      setLoading(false);
    }
  };

  const searchByReceiverPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    const p = phoneQuery.trim();
    if (!companyId || !p || !agencyId) return;
    setLoading(true);
    setError(null);
    setShipment(null);
    setPhoneChoices([]);
    try {
      const q = query(shipmentsRef(db, companyId), where("receiver.phone", "==", p), limit(25));
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ ...(d.data() as Shipment), shipmentId: d.id }));
      const filtered = rows.filter((r) => r.originAgencyId === agencyId || r.destinationAgencyId === agencyId);
      if (filtered.length === 0) {
        setError("Aucun envoi pour ce numéro de téléphone (destinataire) lié à votre agence.");
        return;
      }
      if (filtered.length === 1) {
        setShipment(filtered[0]!);
        return;
      }
      setPhoneChoices(filtered);
    } catch {
      setError("Recherche par téléphone impossible.");
    } finally {
      setLoading(false);
    }
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await loadById(shipment!.shipmentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action impossible");
    } finally {
      setBusy(null);
    }
  };

  if (!companyId) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-sm text-gray-600">
        Compte sans compagnie associée.{" "}
        <Link to="/login" className="text-orange-600 underline">
          Connexion
        </Link>
      </div>
    );
  }

  const s = shipment;
  const isOrigin = s && agencyId && s.originAgencyId === agencyId;
  const isDest = s && agencyId && s.destinationAgencyId === agencyId;
  const waArrivalHref =
    s &&
    (s.currentStatus === "ARRIVED" || s.currentStatus === "READY_FOR_PICKUP") &&
    typeof window !== "undefined"
      ? buildArrivalWhatsAppHref(s, destAgencyLabel, window.location.origin)
      : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Colis — terrain</h1>
        <Link to="/agence/courrier" className="text-sm text-orange-600 underline dark:text-orange-400">
          Courrier
        </Link>
      </div>

      <form onSubmit={searchByShipmentNumber} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={searchNumber}
          onChange={(e) => setSearchNumber(e.target.value)}
          placeholder="N° envoi (ex. KMT-ABJ-…)"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white dark:bg-gray-100 dark:text-gray-900"
        >
          Rechercher
        </button>
      </form>
      <form onSubmit={searchByReceiverPhone} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          value={phoneQuery}
          onChange={(e) => setPhoneQuery(e.target.value)}
          placeholder="Téléphone destinataire (ex. +223…)"
          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold dark:border-gray-600 dark:bg-gray-900"
        >
          Par tél. dest.
        </button>
      </form>
      <p className="mt-1 text-xs text-gray-500">
        Numéro ticket, téléphone destinataire (format enregistré), ou URL /scan/&lt;id technique&gt;.
      </p>

      {phoneChoices.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <p className="font-medium text-amber-900 dark:text-amber-100">Plusieurs envois — choisir :</p>
          <ul className="mt-2 space-y-1">
            {phoneChoices.map((row) => (
              <li key={row.shipmentId}>
                <button
                  type="button"
                  className="text-left font-mono text-xs text-orange-800 underline dark:text-orange-200"
                  onClick={() => {
                    setShipment(row);
                    setPhoneChoices([]);
                  }}
                >
                  {row.shipmentNumber ?? row.shipmentId} — {row.currentStatus}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      )}

      {loading && <p className="mt-4 text-sm text-gray-500">Chargement…</p>}

      {s && (
        <div className="mt-6 space-y-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Référence</p>
            <p className="font-mono text-sm font-bold">{s.shipmentNumber ?? s.shipmentId}</p>
            <p className="text-xs text-gray-500">ID : {s.shipmentId}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Statut</p>
            <p className="text-lg font-semibold">{statusLabelFr(s.currentStatus)}</p>
            {s.transportStatus ? (
              <p className="text-xs text-gray-500">Transport : {s.transportStatus}</p>
            ) : null}
            {s.needsValidation ? <p className="text-xs text-amber-700">Contrôle arrivée requis</p> : null}
          </div>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-gray-500">Expéditeur :</span> {s.sender?.name}
            </div>
            <div>
              <span className="text-gray-500">Destinataire :</span> {s.receiver?.name}
            </div>
            <div>
              <span className="text-gray-500">Tél. destinataire :</span> {s.receiver?.phone ?? "—"}
            </div>
            <div>
              <span className="text-gray-500">Créé :</span> {formatFrenchDateTime(s.createdAt)}
            </div>
          </div>

          {(s.currentStatus === "ARRIVED" || s.currentStatus === "READY_FOR_PICKUP") &&
            (waArrivalHref ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/30">
                <p className="text-xs font-semibold uppercase text-green-900 dark:text-green-100">Notifier le client</p>
                <p className="mt-1 text-xs text-green-800 dark:text-green-200">
                  Proposer un message WhatsApp au numéro du destinataire (ouverture de l’app).
                </p>
                <a
                  href={waArrivalHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white dark:bg-green-600"
                >
                  Envoyer notification WhatsApp
                </a>
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Notification WhatsApp : renseignez le téléphone du destinataire et un suivi (QR) sur l’envoi.
              </p>
            ))}

          <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Actions (manuelles)</p>
            {s.currentStatus === "IN_TRANSIT" &&
              s.needsValidation &&
              s.transportStatus !== "ARRIVED" &&
              isDest && (
                <p className="mb-2 text-xs text-amber-800 dark:text-amber-200">
                  En attente de l&apos;enregistrement d&apos;arrivée du transport avant contrôle agent.
                </p>
              )}
            <div className="flex flex-col gap-2">
              {s.currentStatus === "CREATED" && isOrigin && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    run("transit", () =>
                      markShipmentInTransit({
                        companyId,
                        shipmentId: s.shipmentId,
                        performedBy: uid,
                        agencyId,
                      })
                    )
                  }
                  className="rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "transit" ? "…" : "Mettre en transit"}
                </button>
              )}

              {s.currentStatus === "IN_TRANSIT" &&
                isDest &&
                s.transportStatus === "ARRIVED" &&
                s.needsValidation && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() =>
                      run("validate", () =>
                        confirmShipmentArrivalValidation({
                          companyId,
                          shipmentId: s.shipmentId,
                          performedBy: uid,
                          agencyId,
                        })
                      )
                    }
                    className="rounded-lg bg-amber-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy === "validate" ? "…" : "Valider arrivée (contrôle)"}
                  </button>
                )}

              {s.currentStatus === "IN_TRANSIT" && isDest && !s.needsValidation && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    run("arrived", () =>
                      markShipmentArrived({
                        companyId,
                        shipmentId: s.shipmentId,
                        performedBy: uid,
                        agencyId,
                      })
                    )
                  }
                  className="rounded-lg bg-orange-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "arrived" ? "…" : "Marquer arrivé"}
                </button>
              )}

              {s.currentStatus === "ARRIVED" && isDest && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    run("ready", () =>
                      markReadyForPickup({
                        companyId,
                        shipmentId: s.shipmentId,
                        performedBy: uid,
                        agencyId,
                      })
                    )
                  }
                  className="rounded-lg border-2 border-orange-500 py-2 text-sm font-semibold text-orange-700 disabled:opacity-50 dark:text-orange-300"
                >
                  {busy === "ready" ? "…" : "Prêt pour retrait"}
                </button>
              )}

              {s.currentStatus === "READY_FOR_PICKUP" && isDest && (
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() =>
                    run("delivered", () =>
                      window.confirm("Confirmez-vous l'identité du destinataire ?")
                        ? (() => {
                            const pickupCode = (window.prompt("Code de retrait (4 à 6 chiffres) :") ?? "").trim();
                            if (!pickupCode) throw new Error("Code de retrait requis.");
                            return confirmPickup({
                              companyId,
                              shipmentId: s.shipmentId,
                              performedBy: uid,
                              agencyId,
                              identityConfirmed: true,
                              delegatedPickup: true,
                              pickupCodeInput: pickupCode,
                              proof: {
                                type: "otp",
                                reference: pickupCode,
                              },
                            });
                          })()
                        : Promise.resolve()
                    )
                  }
                  className="rounded-lg bg-green-700 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "delivered" ? "…" : "Confirmer remise"}
                </button>
              )}
            </div>
            {!isOrigin && !isDest && (
              <p className="mt-2 text-xs text-gray-500">Votre agence n’est ni l’origine ni la destination de cet envoi.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
