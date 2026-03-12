import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDocs, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { listVehicles } from "@/modules/compagnie/fleet/vehiclesService";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton, EmptyState } from "@/ui";
import { Users, Loader2 } from "lucide-react";

type CrewRole = "none" | "driver" | "convoyeur" | "both";

type CrewMember = {
  id: string;
  displayName: string;
  telephone?: string;
  role?: string;
  active?: boolean;
  crewRole: CrewRole;
  crewActive: boolean;
  crewAddress: string;
  assignedVehicleId: string;
};

type VehicleOpt = { id: string; label: string };

export default function FleetCrewPage() {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const [members, setMembers] = useState<CrewMember[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId || !agencyId) {
      setMembers([]);
      setVehicles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [usersSnap, allVehicles] = await Promise.all([
        getDocs(collection(db, `companies/${companyId}/agences/${agencyId}/users`)),
        listVehicles(companyId),
      ]);
      const crew = usersSnap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          displayName: data.displayName ?? d.id,
          telephone: data.telephone ?? "",
          role: data.role ?? "",
          active: data.active !== false,
          crewRole: (data.crewRole ?? "none") as CrewRole,
          crewActive: data.crewActive !== false,
          crewAddress: data.crewAddress ?? "",
          assignedVehicleId: data.assignedVehicleId ?? "",
        } as CrewMember;
      });
      const vehicleOpts = allVehicles
        .filter((v: any) => {
          const sameAgency = String(v.currentAgencyId ?? "") === String(agencyId);
          const city = String(v.currentCity ?? "").trim().toLowerCase();
          const agencyCity = String(user?.ville ?? "").trim().toLowerCase();
          return sameAgency || (agencyCity && city === agencyCity);
        })
        .map((v: any) => ({ id: v.id, label: `${v.plateNumber ?? v.id} — ${v.model ?? "Véhicule"}` }));
      setMembers(crew.sort((a, b) => a.displayName.localeCompare(b.displayName)));
      setVehicles(vehicleOpts);
    } finally {
      setLoading(false);
    }
  }, [companyId, agencyId, user?.ville]);

  useEffect(() => {
    void load();
  }, [load]);

  const managedCount = useMemo(
    () => members.filter((m) => m.crewRole !== "none" && m.crewActive).length,
    [members]
  );

  const updateMember = async (memberId: string, patch: Partial<CrewMember>) => {
    if (!companyId || !agencyId) return;
    setBusyId(memberId);
    try {
      await updateDoc(doc(db, `companies/${companyId}/agences/${agencyId}/users/${memberId}`), patch as any);
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, ...patch } as CrewMember : m))
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!companyId || !agencyId) {
    return (
      <StandardLayoutWrapper>
        <EmptyState message="Contexte agence introuvable." />
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-6xl">
      <PageHeader
        title="Équipage flotte"
        subtitle={`${managedCount} membre(s) équipage actif(s)`}
        icon={Users}
      />
      <SectionCard title="Chauffeurs et convoyeurs">
        {loading ? (
          <div className="py-8 text-center text-gray-500">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Chargement...
          </div>
        ) : members.length === 0 ? (
          <EmptyState message="Aucun agent disponible." />
        ) : (
          <div className="space-y-3">
            {members.map((m) => (
              <div key={m.id} className="rounded-lg border border-gray-200 p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
                  <div className="md:col-span-2">
                    <div className="text-sm font-semibold text-gray-900">{m.displayName}</div>
                    <div className="text-xs text-gray-500">{m.telephone || "Téléphone non renseigné"}</div>
                    <div className="text-xs text-gray-400">Rôle applicatif: {m.role || "—"}</div>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Rôle équipage</label>
                    <select
                      value={m.crewRole}
                      onChange={(e) => void updateMember(m.id, { crewRole: e.target.value as CrewRole })}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      disabled={busyId === m.id}
                    >
                      <option value="none">Aucun</option>
                      <option value="driver">Chauffeur</option>
                      <option value="convoyeur">Convoyeur</option>
                      <option value="both">Chauffeur + convoyeur</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Bus principal</label>
                    <select
                      value={m.assignedVehicleId}
                      onChange={(e) => void updateMember(m.id, { assignedVehicleId: e.target.value })}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      disabled={busyId === m.id}
                    >
                      <option value="">— Aucun —</option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Adresse</label>
                    <input
                      value={m.crewAddress}
                      onChange={(e) => setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, crewAddress: e.target.value } : x)))}
                      onBlur={() => void updateMember(m.id, { crewAddress: m.crewAddress })}
                      className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                      placeholder="Quartier / adresse"
                      disabled={busyId === m.id}
                    />
                  </div>
                  <div className="flex items-end gap-2">
                    <ActionButton
                      size="sm"
                      variant={m.crewActive ? "secondary" : "primary"}
                      onClick={() => void updateMember(m.id, { crewActive: !m.crewActive })}
                      disabled={busyId === m.id}
                    >
                      {m.crewActive ? "Désactiver" : "Activer"}
                    </ActionButton>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
}
