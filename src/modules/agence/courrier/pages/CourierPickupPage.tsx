// Remise colis — une seule action visible « Confirmer remise » (orchestration interne si besoin).

import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { db } from "@/firebaseConfig";
import { getDoc, getDocs, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { shipmentRef, shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { confirmPickup } from "@/modules/logistics/services/confirmPickup";
import { markReadyForPickup } from "@/modules/logistics/services/markReadyForPickup";
import { getPersistentDeviceId } from "@/modules/offline/services/offlineIdentityService";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import type { Company } from "@/types/companyTypes";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { Package, Truck, Search, CheckCircle } from "lucide-react";
import { SectionCard } from "@/ui";

function isRemiseEligible(s: Shipment, agencyId: string): boolean {
  if (s.destinationAgencyId !== agencyId) return false;
  if (s.currentStatus === "READY_FOR_PICKUP") return true;
  if (s.currentStatus === "ARRIVED" && s.needsValidation === false) return true;
  return false;
}

export default function CourierPickupPage() {
  const { user, company } = useAuth() as { user: { uid: string; companyId?: string; agencyId?: string }; company: unknown };
  const theme = useCompanyTheme(company as Company | null);
  const secondaryColor = theme?.colors?.secondary ?? "#f97316";
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const money = useFormatCurrency();
  const [searchBy, setSearchBy] = useState<"phone" | "code">("code");
  const [searchValue, setSearchValue] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [delegatedPickup, setDelegatedPickup] = useState(false);
  const [pickupCodeInput, setPickupCodeInput] = useState("");
  const [pickupPhoneInput, setPickupPhoneInput] = useState("");

  const searchByCode = useCallback(
    async (code: string) => {
      if (!companyId || !agencyId || !code.trim()) return;
      const trimmed = code.trim();
      const byIdRef = shipmentRef(db, companyId, trimmed);
      const byIdSnap = await getDoc(byIdRef);
      if (byIdSnap.exists()) {
        setShipment({ ...byIdSnap.data(), shipmentId: byIdSnap.id } as Shipment);
        return;
      }
      const byNumberQ = query(shipmentsRef(db, companyId), where("shipmentNumber", "==", trimmed));
      const byNumberSnap = await getDocs(byNumberQ);
      if (!byNumberSnap.empty) {
        const doc0 = byNumberSnap.docs[0];
        setShipment({ ...doc0.data(), shipmentId: doc0.id } as Shipment);
      } else {
        setShipment(null);
      }
    },
    [companyId, agencyId]
  );

  useEffect(() => {
    if (!companyId || !agencyId || !searchValue.trim()) {
      setShipment(null);
      return;
    }
    if (searchBy === "code") {
      void searchByCode(searchValue);
      return;
    }
    const q = query(
      shipmentsRef(db, companyId),
      where("receiver.phone", "==", searchValue.trim()),
      where("currentAgencyId", "==", agencyId),
      where("currentStatus", "in", ["READY_FOR_PICKUP", "ARRIVED"]),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs;
      if (docs.length === 0) {
        setShipment(null);
        return;
      }
      const first = { ...docs[0].data(), shipmentId: docs[0].id } as Shipment;
      const pick =
        docs
          .map((d) => ({ ...d.data(), shipmentId: d.id } as Shipment))
          .find((s) => isRemiseEligible(s, agencyId)) ?? first;
      setShipment(pick);
    });
    return () => unsub();
  }, [companyId, agencyId, searchBy, searchValue, searchByCode]);

  useEffect(() => {
    setIdentityConfirmed(false);
    setDelegatedPickup(false);
    setPickupCodeInput("");
    setPickupPhoneInput("");
  }, [shipment?.shipmentId]);

  const handleConfirm = async () => {
    if (!shipment?.shipmentId) return;
    if (shipment.destinationAgencyId !== agencyId) {
      setError("Cet envoi n’est pas destiné à votre agence.");
      return;
    }
    if (shipment.currentStatus === "ARRIVED" && shipment.needsValidation === true) {
      setError("Contrôle d’arrivée requis : utilisez l’onglet Arrivages.");
      return;
    }
    if (!isRemiseEligible(shipment, agencyId)) {
      setError("Cet envoi n’est pas prêt pour la remise.");
      return;
    }
    if (!identityConfirmed) {
      setError("Confirmez d'abord l'identité du client.");
      return;
    }
    if (delegatedPickup && !pickupCodeInput.trim()) {
      setError("Code obligatoire pour une remise déléguée.");
      return;
    }
    if (!delegatedPickup && !pickupCodeInput.trim() && !pickupPhoneInput.trim()) {
      setError("Saisissez le code de retrait ou le téléphone du destinataire.");
      return;
    }
    setError(null);
    setActionLoading(true);
    try {
      const deviceId = await getPersistentDeviceId().catch(() => "");
      if (shipment.currentStatus === "ARRIVED" && shipment.needsValidation === false) {
        await markReadyForPickup({
          companyId,
          shipmentId: shipment.shipmentId,
          performedBy: user!.uid,
          agencyId,
        });
      }
      await confirmPickup({
        companyId,
        shipmentId: shipment.shipmentId,
        performedBy: user!.uid,
        agencyId,
        identityConfirmed: true,
        delegatedPickup,
        pickupCodeInput: pickupCodeInput.trim(),
        pickupPhoneInput: pickupPhoneInput.trim(),
        proof: pickupCodeInput.trim()
          ? { type: "otp", reference: pickupCodeInput.trim() }
          : { type: "signature", reference: pickupPhoneInput.trim() },
        ...(deviceId ? { deviceId } : {}),
      });
      setShipment(null);
      setSearchValue("");
      setIdentityConfirmed(false);
      setDelegatedPickup(false);
      setPickupCodeInput("");
      setPickupPhoneInput("");
      setError("Remise confirmée avec preuve");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const eligible = shipment && isRemiseEligible(shipment, agencyId);
  const blockedNeedsValidation =
    shipment &&
    shipment.destinationAgencyId === agencyId &&
    shipment.currentStatus === "ARRIVED" &&
    shipment.needsValidation === true;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 lg:px-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gray-100 dark:bg-gray-800 text-[var(--courier-primary,#ea580c)]">
          <Truck className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Remise</h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Recherche ou scan, puis une seule confirmation de remise au destinataire (paiement déjà effectué à l’origine).
          </p>
        </div>
      </div>

      <SectionCard title="Recherche" icon={Search}>
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-2">
          <select
            value={searchBy}
            onChange={(e) => {
              setSearchBy(e.target.value as "phone" | "code");
              setShipment(null);
              setSearchValue("");
            }}
            className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 dark:border-gray-600 dark:bg-gray-900"
            style={{ ["--tw-ring-color" as string]: secondaryColor }}
          >
            <option value="code">Code envoi</option>
            <option value="phone">Tél. destinataire</option>
          </select>
          <div className="flex flex-1 gap-2">
            <input
              type={searchBy === "phone" ? "tel" : "text"}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder={searchBy === "code" ? "Code envoi" : "Téléphone destinataire"}
              className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 dark:border-gray-600 dark:bg-gray-900"
              style={{ ["--tw-ring-color" as string]: secondaryColor }}
            />
            <button
              type="button"
              onClick={() => searchBy === "code" && searchValue.trim() && void searchByCode(searchValue)}
              className="flex min-h-[44px] items-center justify-center rounded-lg border px-4 py-2.5 transition-colors duration-200"
              style={{ borderColor: "var(--courier-primary, #ea580c)", color: "var(--courier-primary, #ea580c)" }}
              aria-label="Rechercher"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
        </div>
      </SectionCard>

      {error && (
        <div className="mt-4 flex justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="min-h-[44px] underline">
            Fermer
          </button>
        </div>
      )}

      {shipment && (
        <SectionCard title="Détails envoi" icon={Package} className="mt-4">
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div>
              <dt className="text-gray-500 dark:text-gray-400">N° envoi</dt>
              <dd className="font-mono font-medium">{shipment.shipmentNumber ?? shipment.shipmentId}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Destinataire</dt>
              <dd>{shipment.receiver?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Tél.</dt>
              <dd>{shipment.receiver?.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500 dark:text-gray-400">Frais (payés à l’origine)</dt>
              <dd className="teliya-monetary font-medium">{money(shipment.transportFee ?? 0)}</dd>
            </div>
          </dl>
          {eligible && (
            <>
              <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                Colis prêt pour remise au destinataire.
              </p>
              <div className="mb-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={identityConfirmed}
                    onChange={(e) => setIdentityConfirmed(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Identité du client vérifiée
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={delegatedPickup}
                    onChange={(e) => setDelegatedPickup(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  Retrait par une autre personne (code obligatoire)
                </label>
                <input
                  type="text"
                  value={pickupCodeInput}
                  onChange={(e) => setPickupCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="Code de retrait (4 à 6 chiffres)"
                  className="min-h-[40px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 dark:border-gray-600 dark:bg-gray-900"
                  style={{ ["--tw-ring-color" as string]: secondaryColor }}
                />
                {!delegatedPickup && (
                  <input
                    type="tel"
                    value={pickupPhoneInput}
                    onChange={(e) => setPickupPhoneInput(e.target.value)}
                    placeholder="ou téléphone destinataire"
                    className="min-h-[40px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 dark:border-gray-600 dark:bg-gray-900"
                    style={{ ["--tw-ring-color" as string]: secondaryColor }}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={
                  actionLoading ||
                  !identityConfirmed ||
                  (delegatedPickup ? !pickupCodeInput.trim() : (!pickupCodeInput.trim() && !pickupPhoneInput.trim()))
                }
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-white transition-colors duration-200 disabled:opacity-50 sm:w-auto"
                style={{ backgroundColor: "var(--courier-primary, #ea580c)" }}
              >
                <CheckCircle className="h-5 w-5" />
                Confirmer remise
              </button>
            </>
          )}
          {shipment.currentStatus === "DELIVERED" && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
              <p className="font-semibold">Remise confirmée avec preuve</p>
              {(() => {
                const delivered = shipment as unknown as {
                  proofType?: string;
                  proofReference?: string;
                  pickupCodeUsedValue?: string | null;
                };
                return (
              <p className="mt-1 text-xs">
                Type: {String(delivered.proofType ?? "—")} • Réf: {String(delivered.proofReference ?? "—")} • Code utilisé:{" "}
                {String(delivered.pickupCodeUsedValue ?? "—")}
              </p>
                );
              })()}
            </div>
          )}
          {blockedNeedsValidation && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">
              Ce colis est en attente de validation d’arrivée.{" "}
              <Link to="/agence/courrier/arrivages" className="font-semibold underline">
                Ouvrir Arrivages
              </Link>
            </p>
          )}
          {shipment.destinationAgencyId === agencyId &&
            !eligible &&
            !blockedNeedsValidation &&
            shipment.currentStatus !== "DELIVERED" && (
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                Ce colis n’est pas encore éligible à la remise à cette agence. Vérifiez l’onglet Arrivages si un contrôle est en
                attente.
              </p>
            )}
          {shipment.destinationAgencyId !== agencyId && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Agence de destination différente.</p>
          )}
        </SectionCard>
      )}
      {searchValue.trim() && !shipment && (
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Aucun envoi trouvé.</p>
      )}
    </div>
  );
}
