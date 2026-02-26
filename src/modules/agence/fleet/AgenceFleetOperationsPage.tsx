// Phase 1 — Exploitation flotte : Véhicules disponibles, Départs affectés, En transit vers moi.
// Affectation + Confirmer départ + Confirmer arrivée (Chef Agence).
import React, { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  listVehicles,
  assignVehicle,
  confirmDepartureAffectation,
  confirmArrivalAffectation,
} from "@/modules/compagnie/fleet/vehiclesService";
import { listAffectationsByCompany } from "@/modules/compagnie/fleet/affectationService";
import { AFFECTATION_STATUS } from "@/modules/compagnie/fleet/affectationTypes";
import { OPERATIONAL_STATUS, TECHNICAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";
import { Truck, Loader2, MapPin, CheckCircle, UserPlus, X } from "lucide-react";

type VehicleRow = {
  id: string;
  plateNumber: string;
  model: string;
  currentCity: string;
  operationalStatus: string;
  technicalStatus: string;
};

type AffectationRow = {
  id: string;
  agencyId: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleModel: string;
  tripId: string;
  departureCity: string;
  arrivalCity: string;
  departureTime: string;
  driverName?: string;
  driverPhone?: string;
  convoyeurName?: string;
  convoyeurPhone?: string;
  status: string;
};

const AgenceFleetOperationsPage: React.FC = () => {
  const { user } = useAuth() as {
    user: { companyId?: string; agencyId?: string; ville?: string; uid?: string; role?: string };
  };
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const agencyCity = (user?.ville ?? "").trim();
  const userId = user?.uid ?? "";
  const role = (user?.role ?? "chefAgence") as string;

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [affectations, setAffectations] = useState<AffectationRow[]>([]);
  const [activeVehicleIds, setActiveVehicleIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [assignModalVehicleId, setAssignModalVehicleId] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({
    tripId: "",
    departureCity: agencyCity,
    arrivalCity: "",
    departureTime: "",
    driverName: "",
    driverPhone: "",
    convoyeurName: "",
    convoyeurPhone: "",
  });

  const load = useCallback(async () => {
    if (!companyId || !agencyId) {
      setLoading(false);
      setVehicles([]);
      setAffectations([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [list, allAff] = await Promise.all([
        listVehicles(companyId),
        listAffectationsByCompany(companyId),
      ]);
      setVehicles(
        list.map((v: any) => ({
          id: v.id,
          plateNumber: v.plateNumber ?? "",
          model: v.model ?? "",
          currentCity: v.currentCity ?? "",
          operationalStatus: v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE,
          technicalStatus: v.technicalStatus ?? TECHNICAL_STATUS.NORMAL,
        }))
      );
      setAffectations(
        allAff.map((a: any) => ({
          id: a.id,
          agencyId: a.agencyId ?? "",
          vehicleId: a.vehicleId,
          vehiclePlate: a.vehiclePlate ?? "",
          vehicleModel: a.vehicleModel ?? "",
          tripId: a.tripId ?? "",
          departureCity: a.departureCity ?? "",
          arrivalCity: a.arrivalCity ?? "",
          departureTime: a.departureTime ?? "",
          driverName: a.driverName,
          driverPhone: a.driverPhone,
          convoyeurName: a.convoyeurName,
          convoyeurPhone: a.convoyeurPhone,
          status: a.status ?? "",
        }))
      );
      const activeIds = new Set(
        allAff
          .filter((a: any) => a.status === AFFECTATION_STATUS.AFFECTE || a.status === AFFECTATION_STATUS.DEPART_CONFIRME)
          .map((a: any) => a.vehicleId)
      );
      setActiveVehicleIds(activeIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement.");
      setVehicles([]);
      setAffectations([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, agencyId]);

  useEffect(() => {
    load();
  }, [load]);

  const vehiclesDisponibles = vehicles.filter(
    (v) =>
      agencyCity &&
      v.operationalStatus === OPERATIONAL_STATUS.GARAGE &&
      v.technicalStatus === TECHNICAL_STATUS.NORMAL &&
      (v.currentCity ?? "").trim().toLowerCase() === agencyCity.toLowerCase() &&
      !activeVehicleIds.has(v.id)
  );

  const departsAffectes = affectations.filter(
    (a) => a.agencyId === agencyId && a.status === AFFECTATION_STATUS.AFFECTE
  );
  const enTransitVersMoi = affectations.filter(
    (a) =>
      a.status === AFFECTATION_STATUS.DEPART_CONFIRME &&
      (a.arrivalCity ?? "").trim().toLowerCase() === agencyCity.toLowerCase()
  );

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !agencyId || !assignModalVehicleId || !assignForm.arrivalCity?.trim()) {
      setError("Veuillez remplir au moins la ville d'arrivée.");
      return;
    }
    setActioningId(assignModalVehicleId);
    setError(null);
    try {
      await assignVehicle(
        companyId,
        agencyId,
        assignModalVehicleId,
        agencyCity,
        {
          tripId: assignForm.tripId.trim() || "—",
          departureCity: assignForm.departureCity.trim() || agencyCity,
          arrivalCity: assignForm.arrivalCity.trim(),
          departureTime: assignForm.departureTime.trim() || new Date().toISOString().slice(0, 16),
          driverName: assignForm.driverName.trim() || undefined,
          driverPhone: assignForm.driverPhone.trim() || undefined,
          convoyeurName: assignForm.convoyeurName.trim() || undefined,
          convoyeurPhone: assignForm.convoyeurPhone.trim() || undefined,
        },
        userId,
        role
      );
      setAssignModalVehicleId(null);
      setAssignForm({
        tripId: "",
        departureCity: agencyCity,
        arrivalCity: "",
        departureTime: "",
        driverName: "",
        driverPhone: "",
        convoyeurName: "",
        convoyeurPhone: "",
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur affectation.");
    } finally {
      setActioningId(null);
    }
  };

  const handleConfirmDeparture = async (affectationId: string) => {
    if (!companyId || !agencyId) return;
    setActioningId(affectationId);
    setError(null);
    try {
      await confirmDepartureAffectation(companyId, agencyId, affectationId, userId, role);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur confirmation départ.");
    } finally {
      setActioningId(null);
    }
  };

  const handleConfirmArrival = async (affectationId: string, affectationAgencyId: string) => {
    if (!companyId || !agencyCity) return;
    setActioningId(affectationId);
    setError(null);
    try {
      await confirmArrivalAffectation(companyId, affectationAgencyId, affectationId, agencyCity, userId, role);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur confirmation arrivée.");
    } finally {
      setActioningId(null);
    }
  };

  if (!companyId || !agencyId) {
    return (
      <div className="p-6 text-gray-600 bg-gray-50 rounded-lg">Compagnie ou agence introuvable.</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-800 mb-2 flex items-center gap-2">
        <Truck className="w-5 h-5" /> Exploitation
      </h1>
      <p className="text-sm text-gray-600 mb-4">
        Agence : <strong>{agencyCity || "—"}</strong>. Affectez les véhicules et confirmez départs / arrivées.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-8">
          {/* Section 1 – Véhicules disponibles */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> 1. Véhicules disponibles (dans votre agence)
            </h2>
            {vehiclesDisponibles.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun véhicule disponible à l'affectation.</p>
            ) : (
              <ul className="space-y-2">
                {vehiclesDisponibles.map((v) => (
                  <li
                    key={v.id}
                    className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-white"
                  >
                    <span className="font-medium">{v.plateNumber}</span>
                    <span className="text-gray-500">{v.model}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setAssignModalVehicleId(v.id);
                        setAssignForm((prev) => ({ ...prev, departureCity: agencyCity }));
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                    >
                      <UserPlus className="w-4 h-4" /> Affecter
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Section 2 – Départs affectés */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> 2. Départs affectés
            </h2>
            {departsAffectes.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun départ en attente de confirmation.</p>
            ) : (
              <ul className="space-y-2">
                {departsAffectes.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-white"
                  >
                    <span className="font-medium">{a.vehiclePlate}</span>
                    <span className="text-gray-500">{a.vehicleModel}</span>
                    <span className="text-gray-500">{a.departureCity} → {a.arrivalCity}</span>
                    <button
                      type="button"
                      onClick={() => handleConfirmDeparture(a.id)}
                      disabled={actioningId === a.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {actioningId === a.id ? "…" : <CheckCircle className="w-4 h-4" />}
                      Confirmer départ
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Section 3 – En transit vers moi */}
          <section>
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> 3. En transit vers moi
            </h2>
            {enTransitVersMoi.length === 0 ? (
              <p className="text-sm text-gray-500">Aucun véhicule en attente d'arrivée.</p>
            ) : (
              <ul className="space-y-2">
                {enTransitVersMoi.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-2 p-3 rounded-lg border bg-white"
                  >
                    <span className="font-medium">{a.vehiclePlate}</span>
                    <span className="text-gray-500">{a.vehicleModel}</span>
                    <span className="text-gray-500">{a.departureCity} → {a.arrivalCity}</span>
                    <button
                      type="button"
                      onClick={() => handleConfirmArrival(a.id, a.agencyId)}
                      disabled={actioningId === a.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {actioningId === a.id ? "…" : <CheckCircle className="w-4 h-4" />}
                      Confirmer arrivée
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {/* Modal Affectation */}
      {assignModalVehicleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b shrink-0">
              <h3 className="text-lg font-semibold">Affecter un véhicule</h3>
              <button
                type="button"
                onClick={() => setAssignModalVehicleId(null)}
                className="p-1 rounded hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAssign} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville d'arrivée *</label>
                  <input
                    type="text"
                    value={assignForm.arrivalCity}
                    onChange={(e) => setAssignForm((f) => ({ ...f, arrivalCity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville de départ</label>
                  <input
                    type="text"
                    value={assignForm.departureCity}
                    onChange={(e) => setAssignForm((f) => ({ ...f, departureCity: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID trajet</label>
                  <input
                    type="text"
                    value={assignForm.tripId}
                    onChange={(e) => setAssignForm((f) => ({ ...f, tripId: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Heure de départ</label>
                  <input
                    type="datetime-local"
                    value={assignForm.departureTime}
                    onChange={(e) => setAssignForm((f) => ({ ...f, departureTime: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chauffeur (optionnel)</label>
                  <input
                    type="text"
                    value={assignForm.driverName}
                    onChange={(e) => setAssignForm((f) => ({ ...f, driverName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="Nom"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tél. chauffeur</label>
                  <input
                    type="text"
                    value={assignForm.driverPhone}
                    onChange={(e) => setAssignForm((f) => ({ ...f, driverPhone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="Téléphone"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Convoyeur (optionnel)</label>
                  <input
                    type="text"
                    value={assignForm.convoyeurName}
                    onChange={(e) => setAssignForm((f) => ({ ...f, convoyeurName: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="Nom"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tél. convoyeur</label>
                  <input
                    type="text"
                    value={assignForm.convoyeurPhone}
                    onChange={(e) => setAssignForm((f) => ({ ...f, convoyeurPhone: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    placeholder="Téléphone"
                  />
                </div>
              </div>
              <div className="flex gap-2 p-4 border-t shrink-0">
                <button
                  type="button"
                  onClick={() => setAssignModalVehicleId(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={!!actioningId || !assignForm.arrivalCity?.trim()}
                  className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                >
                  {actioningId ? "…" : "Affecter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgenceFleetOperationsPage;
