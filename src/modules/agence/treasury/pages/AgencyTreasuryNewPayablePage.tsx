import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { SectionCard, ActionButton } from "@/ui";
import { PAYABLE_CATEGORIES, type PayableCategory } from "@/modules/compagnie/finance/payablesTypes";
import { createPayable } from "@/modules/compagnie/finance/payablesService";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { createSupplier, listSuppliers, type SupplierDoc } from "@/modules/compagnie/finance/expenseMetadataService";
import { listVehiclesByCurrentAgency, listVehicles } from "@/modules/compagnie/fleet/vehiclesService";
import { FilePlus2 } from "lucide-react";
import { toast } from "sonner";

const PAYABLE_CATEGORY_LABELS: Record<PayableCategory, string> = {
  fuel: "Carburant",
  parts: "Pièces détachées",
  maintenance: "Entretien",
  other: "Autre",
};
const VEHICLE_REQUIRED_CATEGORIES: PayableCategory[] = ["fuel", "parts", "maintenance"];
const PAYABLE_ALLOWED_CATEGORIES: PayableCategory[] = ["fuel", "parts", "maintenance"];

const normalizeBusNumber = (raw: string) => {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  const n = Number(digits);
  if (!Number.isFinite(n) || n < 1 || n > 999) return "";
  return String(n).padStart(3, "0");
};

const normalizeDigits = (value: string) => String(value ?? "").replace(/\D+/g, "");
const compactDigits = (value: string) => {
  const digits = normalizeDigits(value);
  if (!digits) return "";
  const compact = digits.replace(/^0+/, "");
  return compact || "0";
};

export default function AgencyTreasuryNewPayablePage() {
  const { user } = useAuth() as any;
  const companyId =
    user?.companyId ?? user?.compagnieId ?? user?.company?.id ?? user?.company?.companyId ?? "";
  const agencyId =
    user?.agencyId ?? user?.agenceId ?? user?.currentAgencyId ?? user?.agency?.id ?? user?.agence?.id ?? "";
  const fallbackAgencyName = user?.agencyNom ?? user?.agencyName ?? "Agence";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [agencyDisplayName, setAgencyDisplayName] = useState<string>(fallbackAgencyName);
  const [suppliers, setSuppliers] = useState<SupplierDoc[]>([]);
  const [vehicles, setVehicles] = useState<Array<{ id: string; busNumber?: string; plateNumber: string; model?: string; currentCity?: string }>>([]);
  const [supplierId, setSupplierId] = useState("");
  const [newSupplierName, setNewSupplierName] = useState("");
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [category, setCategory] = useState<PayableCategory>("maintenance");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [dueDate, setDueDate] = useState("");

  const normalizeForSearch = (value: string) =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "");

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setAgencyDisplayName(fallbackAgencyName);

    const load = async () => {
      try {
        const suppliersList = await listSuppliers(companyId);
        if (agencyId) {
          const agenceDoc = await getDoc(doc(db, "companies", companyId, "agences", agencyId));
          if (agenceDoc.exists()) {
            const data = agenceDoc.data() as { nom?: string; nomAgence?: string; name?: string };
            const officialName = data.nom ?? data.nomAgence ?? data.name;
            if (officialName && officialName.trim()) {
              setAgencyDisplayName(officialName.trim());
            }
          }
        }

        setSuppliers(suppliersList);
        if (suppliersList.length > 0) {
          setSupplierId((prev) => (prev && suppliersList.some((s) => s.id === prev) ? prev : suppliersList[0].id));
        }

        let vehicleSource: Array<{ id: string; busNumber?: string; plateNumber: string; model?: string; currentCity?: string }> = [];

        try {
          if (agencyId) {
            const agencyVehicles = await listVehiclesByCurrentAgency(companyId, agencyId, { limitCount: 300 });
            vehicleSource = agencyVehicles.vehicles.map((v) => ({
              id: v.id,
              busNumber: normalizeBusNumber(String((v as any).busNumber ?? (v as any).fleetNumber ?? "")),
              plateNumber: String(v.plateNumber ?? "").trim(),
              model: v.model ?? "",
              currentCity: v.currentCity ?? "",
            }));
          }
        } catch (_) {
          vehicleSource = [];
        }

        // Robust fallback: if agency-scoped query returns empty OR fails (missing index/field mismatch), use company fleet.
        if (vehicleSource.length === 0) {
          const companyVehicles = await listVehicles(companyId, 300);
          vehicleSource = companyVehicles.map((v) => ({
            id: v.id,
            busNumber: normalizeBusNumber(String((v as any).busNumber ?? (v as any).fleetNumber ?? "")),
            plateNumber: String(v.plateNumber ?? "").trim(),
            model: v.model ?? "",
            currentCity: v.currentCity ?? "",
          }));
        }

        const deduped = Array.from(new Map(vehicleSource.map((v) => [v.id, v])).values());
        setVehicles(deduped);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [companyId, agencyId, fallbackAgencyName]);

  const handleCreateSupplier = async () => {
    if (!companyId) return;
    const name = newSupplierName.trim();
    if (!name) {
      toast.error("Renseignez un nom de fournisseur.");
      return;
    }
    setCreatingSupplier(true);
    try {
      const id = await createSupplier({
        companyId,
        name,
        createdBy: user?.uid ?? undefined,
      });
      setSuppliers((prev) => [...prev, { id, name, isActive: true, phone: null, email: null }].sort((a, b) => a.name.localeCompare(b.name)));
      setSupplierId(id);
      setNewSupplierName("");
      toast.success("Fournisseur ajouté.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erreur de création du fournisseur.");
    } finally {
      setCreatingSupplier(false);
    }
  };

  const normalizedSearch = normalizeForSearch(vehicleSearch);
  const searchDigits = normalizeDigits(vehicleSearch);
  const searchDigitsCompact = compactDigits(vehicleSearch);
  const filteredVehicles = vehicles.filter((v) => {
    if (!normalizedSearch) return true;
    const busNumber = normalizeForSearch(v.busNumber ?? "");
    const plate = normalizeForSearch(v.plateNumber);
    const model = normalizeForSearch(v.model ?? "");
    const id = normalizeForSearch(v.id);
    const busDigits = normalizeDigits(v.busNumber ?? "");
    const busDigitsCompact = compactDigits(v.busNumber ?? "");
    const numericBusMatch =
      !!searchDigits &&
      (busDigits.includes(searchDigits) ||
        busDigitsCompact === searchDigitsCompact ||
        Number(busDigits) === Number(searchDigits));
    return (
      numericBusMatch ||
      busNumber.includes(normalizedSearch) ||
      plate.includes(normalizedSearch) ||
      model.includes(normalizedSearch) ||
      id.includes(normalizedSearch)
    );
  });

  const handleCreate = async () => {
    if (!companyId || !user?.uid) return;
    const amount = Number(totalAmount.replace(",", "."));
    const selectedSupplier = suppliers.find((s) => s.id === supplierId);
    const isVehicleRequired = VEHICLE_REQUIRED_CATEGORIES.includes(category);
    if (!PAYABLE_ALLOWED_CATEGORIES.includes(category)) {
      toast.error("La catégorie 'Autre' doit être enregistrée en dépense directe.");
      return;
    }
    if (!agencyId || !selectedSupplier || !description.trim() || !Number.isFinite(amount) || amount <= 0) {
      toast.error(!agencyId ? "Aucune agence associée à ce compte. Vérifiez le profil utilisateur." : "Renseignez agence, fournisseur, description et montant.");
      return;
    }
    if (isVehicleRequired && !vehicleId) {
      toast.error("Veuillez sélectionner le véhicule concerné.");
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
      toast.success(`Compte fournisseur créé : ${payableId.slice(0, 8)}...`);
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
                  <option value="">Sélectionner un fournisseur</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                {suppliers.length === 0 && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-amber-700">Aucun fournisseur actif configuré au niveau compagnie.</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSupplierName}
                        onChange={(e) => setNewSupplierName(e.target.value)}
                        placeholder="Nouveau fournisseur"
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                      <ActionButton type="button" onClick={handleCreateSupplier} disabled={creatingSupplier}>
                        {creatingSupplier ? "Ajout..." : "Ajouter"}
                      </ActionButton>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie</label>
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
                  Pour les achats non fournisseurs (catégorie Autre), utilisez la dépense directe.
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
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Véhicule concerné {VEHICLE_REQUIRED_CATEGORIES.includes(category) ? "*" : "(optionnel)"}
              </label>
              <input
                type="text"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
                value={vehicleSearch}
                onChange={(e) => setVehicleSearch(e.target.value)}
                placeholder="Rechercher par numéro bus, plaque, modèle ou identifiant"
              />
              <select
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
              >
                <option value="">Sélectionner un véhicule</option>
                {filteredVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.busNumber ? `#${v.busNumber} - ` : ""}{v.plateNumber || v.id} {v.model ? `- ${v.model}` : ""} {v.currentCity ? `(${v.currentCity})` : ""}
                  </option>
                ))}
              </select>
              {vehicles.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  Aucun véhicule disponible. Vérifiez la flotte compagnie/garage.
                </p>
              )}
              {vehicles.length > 0 && filteredVehicles.length === 0 && (
                <p className="mt-1 text-xs text-amber-700">
                  Aucun résultat. Essayez sans espace/tiret (ex : AA100AF).
                </p>
              )}
              {VEHICLE_REQUIRED_CATEGORIES.includes(category) && (
                <p className="mt-1 text-xs text-gray-500">
                  Obligatoire pour carburant, pièces détachées et entretien.
                </p>
              )}
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
