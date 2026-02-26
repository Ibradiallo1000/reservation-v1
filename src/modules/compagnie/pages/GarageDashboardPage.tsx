// Phase 1F/1G/1H + Phase 1 Stabilization: plaque 3 parties, VilleCombobox, model autocomplete, Edit/Delete, pagination.
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { useAuth } from "@/contexts/AuthContext";
import { Timestamp, type DocumentSnapshot } from "firebase/firestore";
import {
  listVehiclesPaginated,
  createVehicle,
  setTechnicalStatus,
  updateVehicle,
  archiveVehicle,
} from "@/modules/compagnie/fleet/vehiclesService";
import type { ListVehiclesOrderBy } from "@/modules/compagnie/fleet/vehiclesService";
import { getActiveAffectationByVehicle } from "@/modules/compagnie/fleet/affectationService";
import type { VehicleStatus } from "@/modules/compagnie/fleet/vehicleTypes";
import { VEHICLE_STATUS } from "@/modules/compagnie/fleet/vehicleTypes";
import { TECHNICAL_STATUS, OPERATIONAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";
import type { TechnicalStatus } from "@/modules/compagnie/fleet/vehicleTransitions";
import { PLATE_COUNTRIES, formatPlateFromParts, parsePlateToParts, validatePlate } from "@/modules/compagnie/fleet/plateValidation";
import PlateInput3Parts from "@/modules/compagnie/fleet/PlateInput3Parts";
import { listVehicleModels } from "@/modules/compagnie/fleet/vehicleModelsService";
import { useGarageTheme } from "@/modules/compagnie/layout/GarageThemeContext";
import VilleCombobox from "@/shared/ui/VilleCombobox";
import { useVilles } from "@/shared/hooks/useVilles";
import { Truck, Loader2, Plus, X, Pencil, Archive } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type VehicleRow = {
  id: string;
  country: string;
  plateNumber: string;
  model: string;
  year: number;
  status: string;
  technicalStatus: string;
  operationalStatus: string;
  currentCity: string;
  destinationCity?: string | null;
  updatedAt?: { toDate?: () => Date } | Date | null;
  insuranceExpiryDate?: { toDate?: () => Date } | Date | null;
  inspectionExpiryDate?: { toDate?: () => Date } | Date | null;
  vignetteExpiryDate?: { toDate?: () => Date } | null;
  notes?: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  GARAGE: "Garage",
  EN_SERVICE: "En service",
  EN_TRANSIT: "En transit",
  EN_MAINTENANCE: "Maintenance",
  ACCIDENTE: "Accidenté",
  HORS_SERVICE: "Hors service",
};
const TECHNICAL_LABELS: Record<string, string> = {
  NORMAL: "Normal",
  MAINTENANCE: "Maintenance",
  ACCIDENTE: "Accidenté",
  HORS_SERVICE: "Hors service",
};
const OPERATIONAL_LABELS: Record<string, string> = {
  GARAGE: "Garage",
  AFFECTE: "Affecté",
  EN_TRANSIT: "En transit",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  GARAGE: "bg-slate-200 text-slate-800",
  EN_SERVICE: "bg-emerald-100 text-emerald-800",
  EN_TRANSIT: "bg-blue-100 text-blue-800",
  EN_MAINTENANCE: "bg-amber-100 text-amber-800",
  ACCIDENTE: "bg-red-100 text-red-800",
  HORS_SERVICE: "bg-slate-300 text-slate-700",
};

function formatUpdatedAt(updatedAt: VehicleRow["updatedAt"]): string {
  if (!updatedAt) return "—";
  const d = typeof updatedAt === "object" && "toDate" in updatedAt ? (updatedAt as { toDate(): Date }).toDate() : updatedAt instanceof Date ? updatedAt : null;
  return d ? format(d, "dd/MM/yyyy HH:mm", { locale: fr }) : "—";
}

export type GarageView = "maintenance" | "transit" | "incidents";

type ViewFilter = "all" | "available" | "transit" | "maintenance" | "accidented" | "hors_service";

interface GarageDashboardPageProps {
  view?: GarageView;
}

export default function GarageDashboardPage({ view }: GarageDashboardPageProps) {
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? "";
  const { setHeader, resetHeader } = usePageHeader();
  const { user } = useAuth();
  const theme = useGarageTheme();

  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [cardFilter, setCardFilter] = useState<ViewFilter | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSaving, setAddSaving] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<"plate" | "status" | "updatedAt">("plate");
  const sortToOrderBy = (s: "plate" | "status" | "updatedAt"): ListVehiclesOrderBy =>
    s === "status" ? "technicalStatus" : s === "updatedAt" ? "updatedAt" : "plate";
  const [addForm, setAddForm] = useState<{
    country: string;
    platePart1: string;
    platePart2: string;
    platePart3: string;
    model: string;
    year: number;
    currentCity: string;
    status: VehicleStatus;
    insuranceExpiryDate: string;
    inspectionExpiryDate: string;
    vignetteExpiryDate: string;
    notes: string;
  }>({
    country: "ML",
    platePart1: "",
    platePart2: "",
    platePart3: "",
    model: "",
    year: new Date().getFullYear(),
    currentCity: "",
    status: VEHICLE_STATUS.GARAGE,
    insuranceExpiryDate: "",
    inspectionExpiryDate: "",
    vignetteExpiryDate: "",
    notes: "",
  });
  const [plateError, setPlateError] = useState<string | null>(null);
  const [vehicleModels, setVehicleModels] = useState<string[]>([]);
  const { villes } = useVilles();
  const [editVehicleId, setEditVehicleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    model: string;
    technicalStatus: TechnicalStatus;
    insuranceExpiryDate: string;
    inspectionExpiryDate: string;
    vignetteExpiryDate: string;
    notes: string;
  }>({ model: "", technicalStatus: TECHNICAL_STATUS.NORMAL, insuranceExpiryDate: "", inspectionExpiryDate: "", vignetteExpiryDate: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [orderByField, setOrderByField] = useState<ListVehiclesOrderBy>("plate");
  const [hasMorePages, setHasMorePages] = useState(false);
  const nextPageCursorRef = useRef<DocumentSnapshot | null>(null);

  const routeFilter: ViewFilter =
    view === "maintenance"
      ? "maintenance"
      : view === "transit"
        ? "transit"
        : view === "incidents"
          ? "accidented"
          : "all";
  const effectiveFilter: ViewFilter = cardFilter ?? routeFilter;

  const load = useCallback(async (pageIndex: number = 0) => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const startAfterDoc = pageIndex === 0 ? null : nextPageCursorRef.current;
      const { vehicles: list, lastDoc, hasMore } = await listVehiclesPaginated(companyId, {
        pageSize: 20,
        startAfterDoc: startAfterDoc ?? undefined,
        orderByField,
      });
      nextPageCursorRef.current = lastDoc;
      setVehicles(
        list.map((v) => ({
          id: v.id,
          country: (v as any).country ?? "ML",
          plateNumber: (v as any).plateNumber ?? "",
          model: v.model ?? "",
          year: Number(v.year) ?? 0,
          status: (v as any).status ?? "GARAGE",
          technicalStatus: (v as any).technicalStatus ?? TECHNICAL_STATUS.NORMAL,
          operationalStatus: (v as any).operationalStatus ?? OPERATIONAL_STATUS.GARAGE,
          currentCity: v.currentCity ?? "",
          destinationCity: (v as any).destinationCity ?? null,
          updatedAt: (v as any).updatedAt ?? null,
          insuranceExpiryDate: (v as any).insuranceExpiryDate ?? null,
          inspectionExpiryDate: (v as any).inspectionExpiryDate ?? null,
          vignetteExpiryDate: (v as any).vignetteExpiryDate ?? null,
          notes: (v as any).notes ?? null,
        }))
      );
      setHasMorePages(!!hasMore);
      setCurrentPage(pageIndex);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement flotte.");
      setVehicles([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, orderByField]);

  useEffect(() => {
    const title = view === "maintenance" ? "Maintenance" : view === "transit" ? "Transit" : view === "incidents" ? "Incidents" : "Flotte — Chef Garage";
    setHeader({ title });
    return () => resetHeader();
  }, [setHeader, resetHeader, view]);

  useEffect(() => {
    load(0);
  }, [load]);

  useEffect(() => {
    if (!companyId) return;
    listVehicleModels(companyId).then(setVehicleModels).catch(() => setVehicleModels([]));
  }, [companyId]);

  const handleTechnicalStatus = async (vehicleId: string, technicalStatus: TechnicalStatus) => {
    if (!companyId || !user?.uid) return;
    setActioningId(vehicleId);
    try {
      await setTechnicalStatus(companyId, vehicleId, technicalStatus, user.uid, (user as any).role ?? "chef_garage");
      await load(currentPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur mise à jour statut technique.");
    } finally {
      setActioningId(null);
    }
  };

  const openEditModal = (v: VehicleRow) => {
    const toDateStr = (d: VehicleRow["insuranceExpiryDate"]) => {
      if (!d) return "";
      const date = typeof d === "object" && "toDate" in d ? (d as { toDate(): Date }).toDate() : d instanceof Date ? d : null;
      return date ? format(date, "yyyy-MM-dd") : "";
    };
    setEditVehicleId(v.id);
    setEditForm({
      model: v.model ?? "",
      technicalStatus: (v.technicalStatus as TechnicalStatus) ?? TECHNICAL_STATUS.NORMAL,
      insuranceExpiryDate: toDateStr(v.insuranceExpiryDate),
      inspectionExpiryDate: toDateStr(v.inspectionExpiryDate),
      vignetteExpiryDate: toDateStr(v.vignetteExpiryDate),
      notes: v.notes ?? "",
    });
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !editVehicleId || !user?.uid) return;
    setEditSaving(true);
    setError(null);
    try {
      const toTs = (s: string) => (!s?.trim() ? null : Timestamp.fromDate(new Date(s.trim())));
      await updateVehicle(
        companyId,
        editVehicleId,
        {
          model: editForm.model.trim() || undefined,
          technicalStatus: editForm.technicalStatus,
          insuranceExpiryDate: toTs(editForm.insuranceExpiryDate),
          inspectionExpiryDate: toTs(editForm.inspectionExpiryDate),
          vignetteExpiryDate: toTs(editForm.vignetteExpiryDate),
          notes: editForm.notes.trim() || null,
        },
        user.uid,
        (user as any).role ?? "chef_garage"
      );
      setEditVehicleId(null);
      await load(currentPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur mise à jour véhicule.");
    } finally {
      setEditSaving(false);
    }
  };

  const [archiveConfirmVehicle, setArchiveConfirmVehicle] = useState<VehicleRow | null>(null);
  const [archiveSaving, setArchiveSaving] = useState(false);

  const handleArchiveClick = (v: VehicleRow) => {
    if (v.operationalStatus !== OPERATIONAL_STATUS.GARAGE) return;
    setArchiveConfirmVehicle(v);
  };

  const handleArchiveConfirm = async () => {
    if (!companyId || !archiveConfirmVehicle || !user?.uid) return;
    setArchiveSaving(true);
    setError(null);
    try {
      const active = await getActiveAffectationByVehicle(companyId, archiveConfirmVehicle.id);
      if (active) {
        setError("Impossible d'archiver : ce véhicule a une affectation active.");
        setArchiveConfirmVehicle(null);
        return;
      }
      await archiveVehicle(companyId, archiveConfirmVehicle.id, user.uid, (user as any).role ?? "chef_garage");
      setArchiveConfirmVehicle(null);
      await load(currentPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur archivage.");
    } finally {
      setArchiveSaving(false);
    }
  };

  const toTimestamp = (dateStr: string) => {
    if (!dateStr?.trim()) return undefined;
    const d = new Date(dateStr.trim());
    return isNaN(d.getTime()) ? undefined : Timestamp.fromDate(d);
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlateError(null);
    const plateNumber = formatPlateFromParts(addForm.platePart1, addForm.platePart2, addForm.platePart3);
    if (!companyId || !plateNumber || !addForm.model.trim() || !addForm.currentCity.trim()) return;
    if (!addForm.country?.trim()) {
      setError("Veuillez sélectionner un pays.");
      return;
    }
    if (!validatePlate(addForm.country, plateNumber)) {
      setPlateError("Format plaque invalide. Mali : AA 100 AF ou AB 1234 MD.");
      return;
    }
    const cityNorm = addForm.currentCity.trim();
    if (!villes.length || !villes.includes(cityNorm)) {
      setError("Veuillez sélectionner une ville dans la liste (pas de saisie libre).");
      return;
    }
    setAddSaving(true);
    setError(null);
    try {
      const payload: Parameters<typeof createVehicle>[1] = {
        country: addForm.country.trim(),
        plateNumber,
        model: addForm.model.trim(),
        year: addForm.year,
        status: addForm.status,
        currentCity: cityNorm,
      };
      const ins = toTimestamp(addForm.insuranceExpiryDate);
      const insp = toTimestamp(addForm.inspectionExpiryDate);
      const vig = toTimestamp(addForm.vignetteExpiryDate);
      if (ins) payload.insuranceExpiryDate = ins;
      if (insp) payload.inspectionExpiryDate = insp;
      if (vig) payload.vignetteExpiryDate = vig;
      if (addForm.notes?.trim()) payload.notes = addForm.notes.trim();
      await createVehicle(companyId, payload);
      setAddForm({
        country: "ML",
        platePart1: "",
        platePart2: "",
        platePart3: "",
        model: "",
        year: new Date().getFullYear(),
        currentCity: "",
        status: VEHICLE_STATUS.GARAGE,
        insuranceExpiryDate: "",
        inspectionExpiryDate: "",
        vignetteExpiryDate: "",
        notes: "",
      });
      setAddModalOpen(false);
      await load(currentPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur ajout véhicule.");
    } finally {
      setAddSaving(false);
    }
  };

  const total = vehicles.length;
  const available = vehicles.filter(
    (v) => v.operationalStatus === OPERATIONAL_STATUS.GARAGE && v.technicalStatus === TECHNICAL_STATUS.NORMAL
  ).length;
  const inTransit = vehicles.filter((v) => v.operationalStatus === OPERATIONAL_STATUS.EN_TRANSIT).length;
  const maintenance = vehicles.filter((v) => v.technicalStatus === TECHNICAL_STATUS.MAINTENANCE).length;
  const accidented = vehicles.filter((v) => v.technicalStatus === TECHNICAL_STATUS.ACCIDENTE).length;
  const horsService = vehicles.filter((v) => v.technicalStatus === TECHNICAL_STATUS.HORS_SERVICE).length;

  const filteredByStatus =
    effectiveFilter === "all"
      ? vehicles
      : effectiveFilter === "available"
        ? vehicles.filter(
            (v) => v.operationalStatus === OPERATIONAL_STATUS.GARAGE && v.technicalStatus === TECHNICAL_STATUS.NORMAL
          )
        : effectiveFilter === "transit"
          ? vehicles.filter((v) => v.operationalStatus === OPERATIONAL_STATUS.EN_TRANSIT)
          : effectiveFilter === "maintenance"
            ? vehicles.filter((v) => v.technicalStatus === TECHNICAL_STATUS.MAINTENANCE)
            : effectiveFilter === "accidented"
              ? vehicles.filter((v) => v.technicalStatus === TECHNICAL_STATUS.ACCIDENTE)
              : effectiveFilter === "hors_service"
                ? vehicles.filter((v) => v.technicalStatus === TECHNICAL_STATUS.HORS_SERVICE)
                : vehicles;

  const cities = useMemo(() => {
    const set = new Set(vehicles.map((v) => v.currentCity).filter(Boolean));
    return Array.from(set).sort();
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    let list = filteredByStatus;
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      list = list.filter(
        (v) =>
          (v.plateNumber ?? "").toLowerCase().includes(q) ||
          (v.model ?? "").toLowerCase().includes(q)
      );
    }
    if (cityFilter) {
      list = list.filter((v) => (v.currentCity ?? "") === cityFilter);
    }
    const getUpdatedTime = (row: VehicleRow): number => {
      const u = row.updatedAt;
      if (!u) return 0;
      if (typeof (u as { toDate?: () => Date }).toDate === "function") return (u as { toDate(): Date }).toDate().getTime();
      if (u instanceof Date) return u.getTime();
      return 0;
    };
    return [...list].sort((a, b) => {
      if (sortBy === "plate") return (a.plateNumber ?? "").localeCompare(b.plateNumber ?? "");
      if (sortBy === "status") return (a.status ?? "").localeCompare(b.status ?? "");
      return getUpdatedTime(b) - getUpdatedTime(a);
    });
  }, [filteredByStatus, searchText, cityFilter, sortBy]);

  const isChefGarage = user?.role === "chef_garage";

  if (!companyId) {
    return (
      <div className="p-6 text-slate-600 bg-slate-50 rounded-lg">Compagnie introuvable.</div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto garage-dashboard">
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
          <Truck className="w-5 h-5 text-slate-600" /> Flotte
        </h1>
        {isChefGarage && (
          <button
            type="button"
            onClick={() => {
              setPlateError(null);
              setAddModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition hover:opacity-90"
            style={{ backgroundColor: theme.secondary }}
          >
            <Plus className="w-4 h-4" /> Ajouter un véhicule
          </button>
        )}
      </div>

      {/* Recherche, filtre ville, tri */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Rechercher (plaque, modèle)"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-48 max-w-full"
        />
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="">Toutes les villes</option>
          {cities.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => {
            const v = e.target.value as "plate" | "status" | "updatedAt";
            setSortBy(v);
            setOrderByField(sortToOrderBy(v));
            nextPageCursorRef.current = null;
          }}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="plate">Trier par plaque</option>
          <option value="status">Trier par statut technique</option>
          <option value="updatedAt">Trier par dernière MAJ</option>
        </select>
      </div>

      {/* Cartes récap : Total, Disponibles, En transit, Maintenance, Accidentés, Hors service */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3 mb-6">
        {[
          { key: "all" as ViewFilter, count: total, label: "Total véhicules", className: "bg-slate-100 hover:bg-slate-200" },
          { key: "available" as ViewFilter, count: available, label: "Disponibles", className: "bg-emerald-50 hover:bg-emerald-100" },
          { key: "transit" as ViewFilter, count: inTransit, label: "En transit", className: "bg-blue-50 hover:bg-blue-100" },
          { key: "maintenance" as ViewFilter, count: maintenance, label: "Maintenance", className: "bg-amber-50 hover:bg-amber-100" },
          { key: "accidented" as ViewFilter, count: accidented, label: "Accidentés", className: "bg-red-50 hover:bg-red-100" },
          { key: "hors_service" as ViewFilter, count: horsService, label: "Hors service", className: "bg-slate-200 hover:bg-slate-300" },
        ].map(({ key, count, label, className }) => (
          <button
            key={key}
            type="button"
            onClick={() => setCardFilter(key)}
            className={`p-3 rounded-lg text-left transition ${className}`}
            style={effectiveFilter === key ? { boxShadow: `0 0 0 2px ${theme.primary}` } : undefined}
          >
            <div className="text-xl font-bold text-slate-800">{count}</div>
            <div className="text-xs text-slate-600">{label}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
        </div>
      ) : filteredVehicles.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-600">
          {effectiveFilter ? "Aucun véhicule pour ce filtre." : "Aucun véhicule enregistré."}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left" style={{ backgroundColor: theme.primaryLight ?? "#f1f5f9" }}>
                  <th className="p-3 font-medium text-slate-700">Pays</th>
                  <th className="p-3 font-medium text-slate-700">Plaque</th>
                  <th className="p-3 font-medium text-slate-700">Modèle</th>
                  <th className="p-3 font-medium text-slate-700">Année</th>
                  <th className="p-3 font-medium text-slate-700">Opérationnel</th>
                  <th className="p-3 font-medium text-slate-700">Technique</th>
                  <th className="p-3 font-medium text-slate-700">Ville actuelle</th>
                  <th className="p-3 font-medium text-slate-700">Destination</th>
                  <th className="p-3 font-medium text-slate-700">Dernière MAJ</th>
                  {isChefGarage && <th className="p-3 font-medium text-slate-700">Statut technique</th>}
                  {isChefGarage && <th className="p-3 font-medium text-slate-700">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((v) => {
                  const isActioning = actioningId === v.id;
                  return (
                    <tr key={v.id} className="border-b hover:bg-slate-50/50">
                      <td className="p-3 text-slate-600">{v.country}</td>
                      <td className="p-3 font-medium">{v.plateNumber}</td>
                      <td className="p-3">{v.model}</td>
                      <td className="p-3">{v.year}</td>
                      <td className="p-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE_CLASS[v.status] ?? "bg-slate-100"}`}>
                          {OPERATIONAL_LABELS[v.operationalStatus] ?? v.operationalStatus}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE_CLASS[v.status] ?? "bg-slate-100"}`}>
                          {TECHNICAL_LABELS[v.technicalStatus] ?? v.technicalStatus}
                        </span>
                      </td>
                      <td className="p-3">{v.currentCity}</td>
                      <td className="p-3">{v.destinationCity ?? "—"}</td>
                      <td className="p-3 text-slate-600">{formatUpdatedAt(v.updatedAt)}</td>
                      {isChefGarage && (
                        <td className="p-3">
                          <select
                            value={v.technicalStatus}
                            onChange={(e) => handleTechnicalStatus(v.id, e.target.value as TechnicalStatus)}
                            disabled={isActioning}
                            className="text-xs border border-slate-300 rounded px-2 py-1 bg-white"
                          >
                            {Object.entries(TECHNICAL_STATUS).map(([k, val]) => (
                              <option key={k} value={val}>{TECHNICAL_LABELS[val]}</option>
                            ))}
                          </select>
                        </td>
                      )}
                      {isChefGarage && (
                        <td className="p-3 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(v)}
                            className="p-1.5 rounded border border-slate-300 hover:bg-slate-100 text-slate-600"
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchiveClick(v)}
                            disabled={v.operationalStatus !== OPERATIONAL_STATUS.GARAGE || actioningId === v.id}
                            className="p-1.5 rounded border border-slate-300 hover:bg-amber-50 hover:border-amber-300 text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            title={v.operationalStatus !== OPERATIONAL_STATUS.GARAGE ? "Archivage possible uniquement au garage" : "Archiver"}
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination : 20 par page */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-slate-50 text-sm text-slate-600">
            <span>Page {currentPage + 1}</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => load(currentPage - 1)}
                disabled={currentPage === 0}
                className="px-3 py-1 rounded border border-slate-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Précédent
              </button>
              <button
                type="button"
                onClick={() => load(currentPage + 1)}
                disabled={!hasMorePages}
                className="px-3 py-1 rounded border border-slate-300 bg-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Suivant
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ajout véhicule — Phase 1G : max-height 90vh, body scrollable, footer sticky */}
      {addModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-gray-700 shrink-0">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Ajouter un véhicule</h3>
              <button type="button" onClick={() => setAddModalOpen(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-slate-600 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleAddVehicle} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Pays</label>
                  <select
                    value={addForm.country}
                    onChange={(e) => {
                      setAddForm((f) => ({ ...f, country: e.target.value }));
                      setPlateError(null);
                    }}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                    required
                  >
                    {PLATE_COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Plaque (Mali)</label>
                  <PlateInput3Parts
                    country={addForm.country}
                    part1={addForm.platePart1}
                    part2={addForm.platePart2}
                    part3={addForm.platePart3}
                    onChange={(p1, p2, p3) => {
                      setAddForm((f) => ({ ...f, platePart1: p1, platePart2: p2, platePart3: p3 }));
                      setPlateError(null);
                    }}
                    error={plateError}
                    required
                    className="dark:bg-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Modèle</label>
                  <input
                    type="text"
                    list="vehicle-models-list"
                    value={addForm.model}
                    onChange={(e) => setAddForm((f) => ({ ...f, model: e.target.value.toUpperCase() }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 uppercase"
                    required
                    placeholder="Ex. TOYOTA HIACE"
                  />
                  <datalist id="vehicle-models-list">
                    {vehicleModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Année</label>
                  <input
                    type="number"
                    value={addForm.year}
                    onChange={(e) => setAddForm((f) => ({ ...f, year: parseInt(e.target.value, 10) || f.year }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                    min={1990}
                    max={new Date().getFullYear() + 1}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Statut initial</label>
                  <select
                    value={addForm.status}
                    onChange={(e) => setAddForm((f) => ({ ...f, status: e.target.value as VehicleStatus }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                  >
                    {Object.entries(VEHICLE_STATUS).map(([k, val]) => (
                      <option key={k} value={val}>{STATUS_LABELS[val]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Ville actuelle</label>
                  <VilleCombobox
                    value={addForm.currentCity}
                    onChange={(val) => setAddForm((f) => ({ ...f, currentCity: val }))}
                    placeholder="Sélectionner une ville"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Expiration assurance (optionnel)</label>
                  <input
                    type="date"
                    value={addForm.insuranceExpiryDate}
                    onChange={(e) => setAddForm((f) => ({ ...f, insuranceExpiryDate: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Expiration contrôle technique (optionnel)</label>
                  <input
                    type="date"
                    value={addForm.inspectionExpiryDate}
                    onChange={(e) => setAddForm((f) => ({ ...f, inspectionExpiryDate: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Expiration vignette (optionnel)</label>
                  <input
                    type="date"
                    value={addForm.vignetteExpiryDate}
                    onChange={(e) => setAddForm((f) => ({ ...f, vignetteExpiryDate: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Notes (optionnel)</label>
                  <textarea
                    value={addForm.notes}
                    onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm min-h-[60px] bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex gap-2 p-4 border-t border-slate-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-gray-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={addSaving}
                  className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: theme.secondary }}
                >
                  {addSaving ? "Ajout…" : "Ajouter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal confirmation archivage */}
      {archiveConfirmVehicle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-4 border border-slate-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100 mb-2">Archiver ce véhicule ?</h3>
            <p className="text-sm text-slate-600 dark:text-gray-300 mb-4">
              Ce véhicule sera retiré de la flotte active mais son historique sera conservé.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setArchiveConfirmVehicle(null)}
                disabled={archiveSaving}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleArchiveConfirm}
                disabled={archiveSaving}
                className="flex-1 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {archiveSaving ? "…" : "Archiver"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Modifier véhicule */}
      {editVehicleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-gray-700">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-gray-700 shrink-0">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-gray-100">Modifier le véhicule</h3>
              <button type="button" onClick={() => setEditVehicleId(null)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-slate-600 dark:text-gray-400" />
              </button>
            </div>
            <form onSubmit={handleEditSave} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Modèle</label>
                  <input
                    type="text"
                    list="vehicle-models-edit"
                    value={editForm.model}
                    onChange={(e) => setEditForm((f) => ({ ...f, model: e.target.value.toUpperCase() }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100 uppercase"
                    required
                  />
                  <datalist id="vehicle-models-edit">
                    {vehicleModels.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Statut technique</label>
                  <select
                    value={editForm.technicalStatus}
                    onChange={(e) => setEditForm((f) => ({ ...f, technicalStatus: e.target.value as TechnicalStatus }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                  >
                    {Object.entries(TECHNICAL_STATUS).map(([k, val]) => (
                      <option key={k} value={val}>{TECHNICAL_LABELS[val]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Expiration assurance (optionnel)</label>
                  <input
                    type="date"
                    value={editForm.insuranceExpiryDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, insuranceExpiryDate: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Expiration contrôle technique (optionnel)</label>
                  <input
                    type="date"
                    value={editForm.inspectionExpiryDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, inspectionExpiryDate: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Expiration vignette (optionnel)</label>
                  <input
                    type="date"
                    value={editForm.vignetteExpiryDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, vignetteExpiryDate: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-gray-300 mb-1">Notes (optionnel)</label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full border border-slate-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm min-h-[60px] bg-white dark:bg-gray-700 text-slate-900 dark:text-gray-100"
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex gap-2 p-4 border-t border-slate-200 dark:border-gray-700 shrink-0 bg-white dark:bg-gray-800 rounded-b-xl">
                <button
                  type="button"
                  onClick={() => setEditVehicleId(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-gray-600 text-slate-700 dark:text-gray-300 text-sm font-medium hover:bg-slate-50 dark:hover:bg-gray-700"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: theme.secondary }}
                >
                  {editSaving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
