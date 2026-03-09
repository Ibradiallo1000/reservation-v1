import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useParams, useSearchParams } from "react-router-dom";
import { SectionCard, ActionButton } from "@/ui";
import { PAYABLE_CATEGORIES, type PayableCategory } from "@/modules/compagnie/finance/payablesTypes";
import { createPayable } from "@/modules/compagnie/finance/payablesService";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";

type AgencyOption = { id: string; name: string };

export default function TreasuryNewPayablePage() {
  const { user } = useAuth() as any;
  const params = useParams<{ companyId: string }>();
  const [searchParams] = useSearchParams();
  const companyId = params.companyId ?? searchParams.get("companyId") ?? user?.companyId ?? "";

  const [agencies, setAgencies] = useState<AgencyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [agencyId, setAgencyId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [category, setCategory] = useState<PayableCategory>("maintenance");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    getDocs(collection(db, "companies", companyId, "agences"))
      .then((snap) => {
        const list = snap.docs.map((d) => {
          const data = d.data() as { nom?: string; nomAgence?: string; name?: string };
          return { id: d.id, name: data.nom ?? data.nomAgence ?? data.name ?? d.id };
        });
        setAgencies(list);
        setAgencyId(user?.agencyId || list[0]?.id || "");
      })
      .finally(() => setLoading(false));
  }, [companyId, user?.agencyId]);

  const handleCreate = async () => {
    if (!companyId || !user?.uid) return;
    const amount = Number(totalAmount.replace(",", "."));
    if (!agencyId || !supplierName.trim() || !description.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Renseignez agence, fournisseur, description et montant.");
      return;
    }
    setSubmitting(true);
    try {
      const payableId = await createPayable(companyId, {
        supplierName: supplierName.trim(),
        agencyId,
        category,
        description: description.trim(),
        totalAmount: amount,
        vehicleId: vehicleId.trim() || null,
        createdBy: user.uid,
        dueDate: dueDate ? Timestamp.fromDate(new Date(`${dueDate}T00:00:00`)) : null,
      });
      toast.success(`Compte fournisseur créé: ${payableId.slice(0, 8)}...`);
      setSupplierName("");
      setDescription("");
      setTotalAmount("");
      setVehicleId("");
      setDueDate("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la création.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!companyId) {
    return <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Nouveau compte fournisseur" icon={FilePlus2}>
        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agence</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={agencyId}
                  onChange={(e) => setAgencyId(e.target.value)}
                >
                  <option value="">Sélectionner</option>
                  {agencies.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as PayableCategory)}
                >
                  {PAYABLE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Montant</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d'échéance</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={3}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Véhicule (optionnel)</label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                placeholder="vehicleId"
              />
            </div>

            <ActionButton onClick={handleCreate} disabled={submitting}>
              {submitting ? "Création..." : "Créer le payable"}
            </ActionButton>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

