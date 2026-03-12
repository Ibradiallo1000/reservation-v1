import React, { useCallback, useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { useParams } from "react-router-dom";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, EmptyState } from "@/ui";
import { Users, Loader2 } from "lucide-react";
import { getPhoneRuleFromCountry, isValidLocalPhone, sanitizeLocalPhone } from "@/utils/phoneCountryRules";
import { listVehicles } from "@/modules/compagnie/fleet/vehiclesService";

type CrewRole = "driver" | "convoyeur";

type CrewRow = {
  id: string;
  lastName: string;
  firstName: string;
  fullName: string;
  phone: string;
  address: string;
  city: string;
  role: CrewRole;
  isAvailable: boolean;
  active: boolean;
  assignedVehicleId: string;
};

function toNameCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function buildFullName(lastName: string, firstName: string): string {
  return [toNameCase(lastName), toNameCase(firstName)].filter(Boolean).join(" ").trim();
}

export default function LogisticsCrewPage() {
  const { companyId = "" } = useParams<{ companyId: string }>();
  const { company } = useAuth() as { company?: { pays?: string } };
  const [rows, setRows] = useState<CrewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Array<{ id: string; label: string }>>([]);
  const [vehiclePickerId, setVehiclePickerId] = useState<string | null>(null);
  const [draftVehicleByCrew, setDraftVehicleByCrew] = useState<Record<string, string>>({});
  const [editingCrew, setEditingCrew] = useState<CrewRow | null>(null);
  const [editForm, setEditForm] = useState({
    lastName: "",
    firstName: "",
    phone: "",
    city: "",
    address: "",
    role: "driver" as CrewRole,
  });
  const [form, setForm] = useState({
    lastName: "",
    firstName: "",
    phone: "",
    address: "",
    city: "",
    role: "driver" as CrewRole,
  });
  const phoneRule = useMemo(() => getPhoneRuleFromCountry(company?.pays), [company?.pays]);

  const load = useCallback(async () => {
    if (!companyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [crewSnap, fleetVehicles] = await Promise.all([
        getDocs(collection(db, `companies/${companyId}/personnel`)),
        listVehicles(companyId),
      ]);
      setVehicles(
        (fleetVehicles as any[])
          .map((v) => ({ id: v.id, label: `${v.plateNumber ?? v.id} — ${v.model ?? "Véhicule"}` }))
          .sort((a, b) => a.label.localeCompare(b.label))
      );
      setRows(
        crewSnap.docs
          .map((d) => {
            const data = d.data() as any;
            const fallbackFull = String(data.fullName ?? "").trim();
            const storedLast = String(data.lastName ?? "").trim();
            const storedFirst = String(data.firstName ?? "").trim();
            const fallbackTokens = fallbackFull.split(/\s+/).filter(Boolean);
            const lastName = toNameCase(storedLast || fallbackTokens[0] || "");
            const firstName = toNameCase(storedFirst || fallbackTokens.slice(1).join(" "));
            return {
              id: d.id,
              lastName,
              firstName,
              fullName: buildFullName(lastName, firstName),
              phone: String(data.phone ?? "").trim(),
              address: String(data.address ?? "").trim(),
              city: toNameCase(String(data.city ?? "").trim()),
              role: (data.crewRole ?? (data.role === "agentCourrier" ? "convoyeur" : "driver")) as CrewRole,
              isAvailable: data.isAvailable !== false,
              active: data.active !== false,
              assignedVehicleId: String(data.assignedVehicleId ?? ""),
            } as CrewRow;
          })
          .filter((r) => r.fullName)
          .sort((a, b) => a.fullName.localeCompare(b.fullName))
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = async (row: CrewRow, patch: Partial<CrewRow>) => {
    if (!companyId) return;
    setBusyId(row.id);
    try {
      if (patch.assignedVehicleId !== undefined && row.role === "driver" && patch.assignedVehicleId) {
        const assignedDriversCount = rows.filter(
          (r) => r.id !== row.id && r.role === "driver" && r.assignedVehicleId === patch.assignedVehicleId && r.active
        ).length;
        if (assignedDriversCount >= 2) {
          setSaveError("Ce véhicule a déjà 2 chauffeurs affectés. Retirez-en un avant de continuer.");
          return;
        }
      }
      const nextPhone = patch.phone !== undefined ? sanitizeLocalPhone(patch.phone, phoneRule) : row.phone;
      if (nextPhone && !isValidLocalPhone(nextPhone, phoneRule)) {
        setPhoneError(`Téléphone invalide: ${phoneRule.localLength} chiffres requis (${phoneRule.label}, +${phoneRule.callingCode}).`);
        return;
      }
      setPhoneError(null);
      setSaveError(null);
      const nextLastName = patch.lastName !== undefined ? toNameCase(patch.lastName) : row.lastName;
      const nextFirstName = patch.firstName !== undefined ? toNameCase(patch.firstName) : row.firstName;
      const fullName = buildFullName(nextLastName, nextFirstName);
      await updateDoc(doc(db, `companies/${companyId}/personnel/${row.id}`), {
        ...patch,
        lastName: nextLastName,
        firstName: nextFirstName,
        fullName,
        phone: nextPhone,
        city: patch.city !== undefined ? toNameCase(patch.city) : row.city,
        crewRole: patch.role !== undefined ? patch.role : row.role,
        role: (patch.role !== undefined ? patch.role : row.role) === "driver" ? "agency_fleet_controller" : "agentCourrier",
        assignedVehicleId: patch.assignedVehicleId !== undefined ? patch.assignedVehicleId : row.assignedVehicleId,
        updatedAt: serverTimestamp(),
      } as any);
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                ...patch,
                lastName: nextLastName,
                firstName: nextFirstName,
                fullName,
                phone: nextPhone,
                city: patch.city !== undefined ? toNameCase(patch.city) : r.city,
                assignedVehicleId: patch.assignedVehicleId !== undefined ? patch.assignedVehicleId : r.assignedVehicleId,
              }
            : r
        )
      );
    } finally {
      setBusyId(null);
    }
  };

  const addCrew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    const lastName = toNameCase(form.lastName);
    const firstName = toNameCase(form.firstName);
    if (!lastName || !firstName) return;
    const phone = sanitizeLocalPhone(form.phone, phoneRule);
    if (phone && !isValidLocalPhone(phone, phoneRule)) {
      setPhoneError(`Téléphone invalide: ${phoneRule.localLength} chiffres requis (${phoneRule.label}, +${phoneRule.callingCode}).`);
      return;
    }
    setPhoneError(null);
    setSaveError(null);
    const fullName = buildFullName(lastName, firstName);
    setBusyId("new");
    try {
      await addDoc(collection(db, `companies/${companyId}/personnel`), {
        lastName,
        firstName,
        fullName,
        phone,
        address: form.address.trim(),
        city: toNameCase(form.city),
        role: form.role === "driver" ? "agency_fleet_controller" : "agentCourrier",
        crewRole: form.role,
        isAvailable: true,
        active: true,
        assignedVehicleId: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setForm({ lastName: "", firstName: "", phone: "", address: "", city: "", role: "driver" });
      setShowCreateModal(false);
      await load();
    } catch (e) {
      console.error(e);
      setSaveError("Échec de l'enregistrement. Vérifiez les champs puis réessayez.");
    } finally {
      setBusyId(null);
    }
  };

  const driversCount = useMemo(() => rows.filter((r) => r.role === "driver" && r.active).length, [rows]);
  const convoyeursCount = useMemo(() => rows.filter((r) => r.role === "convoyeur" && r.active).length, [rows]);
  const vehicleLabelById = useMemo(
    () => Object.fromEntries(vehicles.map((v) => [v.id, v.label])),
    [vehicles]
  );

  const openEditModal = (row: CrewRow) => {
    setEditingCrew(row);
    setEditForm({
      lastName: row.lastName,
      firstName: row.firstName,
      phone: row.phone,
      city: row.city,
      address: row.address,
      role: row.role,
    });
  };

  const openVehiclePicker = (row: CrewRow) => {
    setSaveError(null);
    setVehiclePickerId((curr) => (curr === row.id ? null : row.id));
    setDraftVehicleByCrew((prev) => ({ ...prev, [row.id]: row.assignedVehicleId ?? "" }));
  };

  const cancelVehicleDraft = (crewId: string) => {
    setDraftVehicleByCrew((prev) => ({ ...prev, [crewId]: "" }));
    setVehiclePickerId(null);
    setSaveError(null);
  };

  const saveVehicleDraft = async (row: CrewRow) => {
    const selectedVehicleId = draftVehicleByCrew[row.id] ?? "";
    await patchRow(row, { assignedVehicleId: selectedVehicleId });
    setVehiclePickerId(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCrew) return;
    const phone = sanitizeLocalPhone(editForm.phone, phoneRule);
    if (phone && !isValidLocalPhone(phone, phoneRule)) {
      setPhoneError(`Téléphone invalide: ${phoneRule.localLength} chiffres requis (${phoneRule.label}, +${phoneRule.callingCode}).`);
      return;
    }
    setPhoneError(null);
    await patchRow(editingCrew, {
      lastName: editForm.lastName,
      firstName: editForm.firstName,
      phone,
      city: editForm.city,
      address: editForm.address,
      role: editForm.role,
    });
    setEditingCrew(null);
  };

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Registre équipage"
        subtitle={`${driversCount} chauffeur(s) • ${convoyeursCount} convoyeur(s)`}
        icon={Users}
        right={
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Ajouter un équipage
          </button>
        }
      />
      {saveError && !showCreateModal && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {saveError}
        </div>
      )}
      {phoneError && !showCreateModal && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {phoneError}
        </div>
      )}

      <SectionCard title="Registre équipage">
        {loading ? (
          <div className="py-8 text-center text-gray-500">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Chargement...
          </div>
        ) : rows.length === 0 ? (
          <EmptyState message="Aucun membre d'équipage trouvé." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-gray-600">
                  <th className="px-3 py-2">Nom complet</th>
                  <th className="px-3 py-2">Téléphone</th>
                  <th className="px-3 py-2">Ville</th>
                  <th className="px-3 py-2">Véhicule affecté</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b align-top">
                    <td className="px-3 py-2 font-medium text-gray-900">{r.fullName}</td>
                    <td className="px-3 py-2">{r.phone || "—"}</td>
                    <td className="px-3 py-2">{r.city || "—"}</td>
                    <td className="px-3 py-2">
                      {r.assignedVehicleId ? vehicleLabelById[r.assignedVehicleId] ?? r.assignedVehicleId : "Non affecté"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openVehiclePicker(r)}
                          className="rounded border border-indigo-300 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                          disabled={busyId === r.id}
                        >
                          Affecter véhicule
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(r)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                          disabled={busyId === r.id}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={() => void patchRow(r, { isAvailable: !r.isAvailable })}
                          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                          disabled={busyId === r.id}
                        >
                          {r.isAvailable ? "Disponible" : "Indisponible"}
                        </button>
                        <button
                          type="button"
                          onClick={() => void patchRow(r, { active: !r.active })}
                          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                          disabled={busyId === r.id}
                        >
                          {r.active ? "Actif" : "Inactif"}
                        </button>
                      </div>
                      {vehiclePickerId === r.id && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <select
                            value={draftVehicleByCrew[r.id] ?? r.assignedVehicleId}
                            onChange={(e) =>
                              setDraftVehicleByCrew((prev) => ({ ...prev, [r.id]: e.target.value }))
                            }
                            className="min-w-[240px] rounded border border-gray-300 px-2 py-1 text-xs"
                            disabled={busyId === r.id}
                          >
                            <option value="">— Choisir un véhicule —</option>
                            {vehicles.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => void saveVehicleDraft(r)}
                            className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
                            disabled={busyId === r.id}
                          >
                            Valider l'affectation
                          </button>
                          <button
                            type="button"
                            onClick={() => cancelVehicleDraft(r.id)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                            disabled={busyId === r.id}
                          >
                            Annuler
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-lg font-semibold text-gray-900">Ajouter un membre d'équipage</h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setSaveError(null);
                  setPhoneError(null);
                }}
                className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>
            <form onSubmit={addCrew} className="space-y-3 p-4">
              {phoneError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                  {phoneError}
                </div>
              )}
              {saveError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                  {saveError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  onBlur={(e) => setForm((f) => ({ ...f, lastName: toNameCase(e.target.value) }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Nom *"
                  required
                />
                <input
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  onBlur={(e) => setForm((f) => ({ ...f, firstName: toNameCase(e.target.value) }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Prénom *"
                  required
                />
                <input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: sanitizeLocalPhone(e.target.value, phoneRule) }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder={`+${phoneRule.callingCode} (${phoneRule.localLength} chiffres)`}
                  inputMode="numeric"
                  maxLength={phoneRule.localLength}
                />
                <input
                  value={form.city}
                  onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                  onBlur={(e) => setForm((f) => ({ ...f, city: toNameCase(e.target.value) }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ville"
                />
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as CrewRole }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="driver">Chauffeur</option>
                  <option value="convoyeur">Convoyeur</option>
                </select>
              </div>
              <input
                value={form.address}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Adresse"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busyId === "new"}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busyId === "new" ? "Ajout..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingCrew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h3 className="text-lg font-semibold text-gray-900">Modifier membre d'équipage</h3>
              <button
                type="button"
                onClick={() => {
                  setEditingCrew(null);
                  setSaveError(null);
                  setPhoneError(null);
                }}
                className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>
            <form onSubmit={saveEdit} className="space-y-3 p-4">
              {phoneError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                  {phoneError}
                </div>
              )}
              {saveError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-800">
                  {saveError}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  value={editForm.lastName}
                  onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Nom"
                  required
                />
                <input
                  value={editForm.firstName}
                  onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Prénom"
                  required
                />
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: sanitizeLocalPhone(e.target.value, phoneRule) }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder={`+${phoneRule.callingCode} (${phoneRule.localLength} chiffres)`}
                  inputMode="numeric"
                  maxLength={phoneRule.localLength}
                />
                <input
                  value={editForm.city}
                  onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Ville"
                />
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value as CrewRole }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="driver">Chauffeur</option>
                  <option value="convoyeur">Convoyeur</option>
                </select>
              </div>
              <input
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Adresse"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busyId === editingCrew.id}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  Enregistrer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </StandardLayoutWrapper>
  );
}
