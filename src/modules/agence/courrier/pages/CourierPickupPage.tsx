// CourierPickupPage — Remise: recherche par tél. destinataire ou code envoi, détails, option paiement destination, confirmer → DELIVERED.

import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { db } from "@/firebaseConfig";
import { getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { shipmentRef, shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { confirmPickup } from "@/modules/logistics/services/confirmPickup";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import type { Company } from "@/types/companyTypes";
import { useFormatCurrency, useCurrencySymbol } from "@/shared/currency/CurrencyContext";
import { Package, Truck, Search, Loader2, CheckCircle } from "lucide-react";
import { PageHeader, StandardLayoutWrapper, SectionCard } from "@/ui";

export default function CourierPickupPage() {
  const { user, company } = useAuth() as { user: { uid: string; companyId?: string; agencyId?: string }; company: unknown };
  const theme = useCompanyTheme(company as Company | null);
  const primaryColor = theme?.colors?.primary ?? "#ea580c";
  const secondaryColor = theme?.colors?.secondary ?? "#f97316";
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const money = useFormatCurrency();
  const currencySymbol = useCurrencySymbol();
  const [searchBy, setSearchBy] = useState<"phone" | "code">("code");
  const [searchValue, setSearchValue] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [destinationAmount, setDestinationAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchByCode = useCallback(async (code: string) => {
    if (!companyId || !code.trim()) return;
    const trimmed = code.trim();
    const byIdRef = shipmentRef(db, companyId, trimmed);
    const byIdSnap = await getDoc(byIdRef);
    if (byIdSnap.exists()) {
      setShipment(byIdSnap.data() as Shipment);
      return;
    }
    const byNumberQ = query(shipmentsRef(db, companyId), where("shipmentNumber", "==", trimmed));
    const byNumberSnap = await getDocs(byNumberQ);
    if (!byNumberSnap.empty) {
      const doc = byNumberSnap.docs[0];
      setShipment({ ...doc.data(), shipmentId: doc.id } as Shipment);
    } else {
      setShipment(null);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !agencyId || !searchValue.trim()) {
      setShipment(null);
      return;
    }
    if (searchBy === "code") {
      searchByCode(searchValue);
      return;
    }
    const q = query(
      shipmentsRef(db, companyId),
      where("receiver.phone", "==", searchValue.trim()),
      where("currentAgencyId", "==", agencyId),
      where("currentStatus", "==", "READY_FOR_PICKUP")
    );
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs;
      if (docs.length > 0) setShipment(docs[0].data() as Shipment);
      else setShipment(null);
    });
    return () => unsub();
  }, [companyId, agencyId, searchBy, searchValue, searchByCode]);

  const handleConfirm = async () => {
    if (!shipment) return;
    if (shipment.currentStatus !== "READY_FOR_PICKUP") {
      setError("Cet envoi n'est pas en attente de remise.");
      return;
    }
    if (shipment.paymentType === "DESTINATION") {
      const amount = destinationAmount.trim() ? Number(destinationAmount) : NaN;
      if (Number.isNaN(amount) || amount < 0) {
        setError(`Paiement à destination : saisissez le montant perçu (${currencySymbol}).`);
        return;
      }
    }
    setError(null);
    setLoading(true);
    try {
      const amount = destinationAmount.trim() ? Number(destinationAmount) : undefined;
      if (amount != null && (Number.isNaN(amount) || amount < 0)) {
        setError("Montant destination invalide.");
        setLoading(false);
        return;
      }
      await confirmPickup({
        companyId,
        shipmentId: shipment.shipmentId,
        performedBy: user!.uid,
        agencyId,
        destinationCollectedAmount: amount,
      });
      setShipment(null);
      setSearchValue("");
      setDestinationAmount("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const canDeliver =
    shipment?.currentStatus === "READY_FOR_PICKUP" &&
    (shipment.paymentType !== "DESTINATION" ||
      (destinationAmount.trim() !== "" && !Number.isNaN(Number(destinationAmount)) && Number(destinationAmount) >= 0));

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-2xl">
      <PageHeader
        icon={Truck}
        title="Remise Colis"
        primaryColorVar="var(--courier-primary, #ea580c)"
        subtitle="Recherchez par code envoi ou téléphone destinataire, puis confirmez la remise."
      />

      <SectionCard title="Recherche" icon={Search}>
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-2">
          <select
            value={searchBy}
            onChange={(e) => { setSearchBy(e.target.value as "phone" | "code"); setShipment(null); setSearchValue(""); }}
            className="min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0"
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
              className="min-h-[44px] flex-1 rounded-lg border border-gray-300 px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0"
              style={{ ["--tw-ring-color" as string]: secondaryColor }}
            />
            <button
              type="button"
              onClick={() => searchBy === "code" && searchValue.trim() && searchByCode(searchValue)}
              className="flex min-h-[44px] items-center justify-center rounded-lg border px-4 py-2.5 transition-colors duration-200"
              style={{ borderColor: "var(--courier-primary, #ea580c)", color: "var(--courier-primary, #ea580c)" }}
              onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)"; e.currentTarget.style.color = "#fff"; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = ""; e.currentTarget.style.color = "var(--courier-primary, #ea580c)"; }}
              aria-label="Rechercher"
            >
              <Search className="h-5 w-5" />
            </button>
          </div>
        </div>
      </SectionCard>

      {error && (
        <div className="flex justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="min-h-[44px] underline">Fermer</button>
        </div>
      )}

      {shipment && (
        <SectionCard title="Détails envoi" icon={Package}>
          <dl className="grid grid-cols-1 gap-3 text-sm">
            <div><dt className="text-gray-500">N° Envoi</dt><dd className="font-mono font-medium">{shipment.shipmentNumber ?? shipment.shipmentId}</dd></div>
            <div><dt className="text-gray-500">Destinataire</dt><dd>{shipment.receiver?.name ?? "—"}</dd></div>
            <div><dt className="text-gray-500">Tél.</dt><dd>{shipment.receiver?.phone ?? "—"}</dd></div>
            <div><dt className="text-gray-500">Expéditeur</dt><dd>{shipment.sender?.name ?? "—"}</dd></div>
            <div><dt className="text-gray-500">Statut</dt><dd>{shipment.currentStatus}</dd></div>
            <div><dt className="text-gray-500">Frais transport</dt><dd className="font-medium teliya-monetary">{money(shipment.transportFee ?? 0)}</dd></div>
          </dl>
          {shipment.paymentType === "DESTINATION" && (
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-gray-700">Montant à percevoir (destination) {currencySymbol}</label>
              <input
                type="number"
                min="0"
                step="1"
                value={destinationAmount}
                onChange={(e) => setDestinationAmount(e.target.value)}
                className="min-h-[44px] w-full rounded-lg border border-gray-300 px-3 py-2.5 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0"
                style={{ ["--tw-ring-color" as string]: secondaryColor }}
                placeholder="0"
              />
            </div>
          )}
          {canDeliver && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-white transition-colors duration-200 disabled:opacity-50 min-h-[48px] sm:w-auto"
              style={{ backgroundColor: "var(--courier-primary, #ea580c)" }}
              onMouseOver={(e) => { if (!loading) e.currentTarget.style.backgroundColor = "var(--courier-secondary, #f97316)"; }}
              onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "var(--courier-primary, #ea580c)"; }}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />}
              Confirmer la remise
            </button>
          )}
          {shipment.currentStatus !== "READY_FOR_PICKUP" && shipment.currentStatus !== "DELIVERED" && (
            <p className="mt-3 text-sm text-amber-700">Statut : {shipment.currentStatus}. Non remis.</p>
          )}
        </SectionCard>
      )}
      {searchValue.trim() && !shipment && <p className="text-sm text-gray-500">Aucun envoi trouvé.</p>}
    </StandardLayoutWrapper>
  );
}
