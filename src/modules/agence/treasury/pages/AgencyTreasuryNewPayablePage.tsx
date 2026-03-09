import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SectionCard, ActionButton } from "@/ui";
import { PAYABLE_CATEGORIES, type PayableCategory } from "@/modules/compagnie/finance/payablesTypes";
import { createPayable } from "@/modules/compagnie/finance/payablesService";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { listSuppliers, type SupplierDoc } from "@/modules/compagnie/finance/expenseMetadataService";
import { listVehiclesByCurrentAgency } from "@/modules/compagnie/fleet/vehiclesService";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";

const PAYABLE_CATEGORY_LABELS: Record<PayableCategory, string> = {
  fuel: "Carburant",
  parts: "Pieces detachees",
  maintenance: "Entretien",
  other: "Autre",
};
const VEHICLE_REQUIRED_CATEGORIES: PayableCategory[] = ["fuel", "parts", "maintenance"];
const PAYABLE_ALLOWED_CATEGORIES: PayableCategory[] = ["fuel", "parts", "maintenance"];

export default function AgencyTreasuryNewPayablePage() {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const fallbackAgencyName = user?.agencyNom ?? user?.agencyName ?? "Agence";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [agencyDisplayName, setAgencyDisplayName] = useState<string>(fallbackAgencyName);
  const [suppliers, setSuppliers] = useState<SupplierDoc[]>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; plateNumber: string; model?: string; currentCity?: string }>>([]);
  const [supplierId, setSupplierId] = useState("");
  const [category, setCategory] = useState<PayableCategory>("maintenance");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [dueDate, setDueDate] = useState("");

  useEffect(() => {
    if (!companyId || !agencyId) {
      setLoading(false);
      return;
    }
    setAgencyDisplayName(fallbackAgencyName);
    Promise.all([
      getDoc(doc(db, "companies", companyId, "agences", agencyId)),
      listSuppliers(companyId),
      listVehiclesByCurrentAgency(companyId, agencyId, { limitCount: 300 }),
    ])
      .then(([agenceDoc, suppliersList, vehiclesResult]) => {
        if (agenceDoc.exists()) {
          const data = agenceDoc.data() as { nom?: string; nomAgence?: string; name?: string };
          const officialName = data.nom ?? data.nomAgence ?? data.name;
          if (officialName && officialName.trim()) {
            setAgencyDisplayName(officialName.trim());
          }
        }
        setSuppliers(suppliersList);
        if (suppliersList.length > 0) {
          setSupplierId((prev) => (prev && suppliersList.some((s) => s.id === prev) ? prev : suppliersList[0].id));
        }
        setVehicles(
          vehiclesResult.vehicles.map((v) => ({
            id: v.id,
            plateNumber: String(v.plateNumber ?? ""),
            model: v.model ?? "",
            currentCity: v.currentCity ?? "",
          })),
        );
      })
      .finally(() => setLoading(false));
  }, [companyId, agencyId, fallbackAgencyName]);

  const handleCreate = async () => {
    if (!companyId || !user?.uid) return;
    const amount = Number(totalAmount.replace(",", "."));
    const selectedSupplier = suppliers.find((s) => s.id === supplierId);
    const isVehicleRequired = VEHICLE_REQUIRED_CATEGORIES.includes(category);
    if (!PAYABLE_ALLOWED_CATEGORIES.includes(category)) {
      toast.error("La categorie 'Autre' doit etre enregistree en depense directe.");
      return;
    }
    if (!agencyId || !selectedSupplier || !description.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error("Renseignez agence, fournisseur, description et montant.");
      return;
    }
    if (isVehicleRequired && !vehicleId) {
      toast.error("Veuillez selectionner le vehicule concerne.");
      return;
    }
    setSubmitting(true);
    try {
      const payableId = await createPayable(companyId, {
        supplierId: selectedSupplier.id,
        supplierName: selectedSupplier.name,
        agencyId,
        category,
        description: description.trim(),
        totalAmount: amount,
        vehicleId: vehicleId || null,
        createdBy: user.uid,
        dueDate: dueDate ? Timestamp.fromDate(new Date(`${dueDate}T00:00:00`)) : null,
      });
      toast.success(`Compte fournisseur cree: ${payableId.slice(0, 8)}...`);
      setDescription("");
      setTotalAmount("");
      setVehicleId("");
      setDueDate("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la creation.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!companyId) {
    return <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard title="Nouveau payable fournisseur agence" icon={FilePlus2}>
        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agence</label>
                <div className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700">
                  {agencyDisplayName}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fournisseur</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">Selectionner un fournisseur</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {suppliers.length === 0 && (
                  <p className="mt-1 text-xs text-amber-700">
                    Aucun fournisseur actif configure au niveau compagnie.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categorie</label>
                <select
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  value={category}
                  onChange={(e) => {
                    const nextCategory = e.target.value as PayableCategory;
                    setCategory(nextCategory);
                    if (!VEHICLE_REQUIRED_CATEGORIES.includes(nextCategory)) {
                      setVehicleId("");
                      setVehicleSearch("");
                    }
                  }}
                >
                  {PAYABLE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {PAYABLE_CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Pour les achats non fournisseurs (categorie Autre), utilisez la depense directe.
                </p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d'echeance</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicule concerne {VEHICLE_REQUIRED_CATEGORIES.includes(category) ? "*" : "(optionnel)"}
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                placeholder="Rechercher par numero de bus (plaque)"
              />
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                <option value="">Selectionner un vehicule</option>
                {vehicles
                  .filter((v) =>
                    !vehicleSearch.trim()
                      ? true
                      : v.plateNumber.toLowerCase().includes(vehicleSearch.trim().toLowerCase()),
                  )
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.plateNumber} {v.model ? `- ${v.model}` : ""} {v.currentCity ? `(${v.currentCity})` : ""}
                    </option>
                  ))}
              </select>
              {VEHICLE_REQUIRED_CATEGORIES.includes(category) && (
                <p className="mt-1 text-xs text-gray-500">
                  Obligatoire pour carburant, pieces detachees et entretien.
                </p>
              )}
            </div>

            <ActionButton onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creation..." : "Creer le payable"}
            </ActionButton>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
