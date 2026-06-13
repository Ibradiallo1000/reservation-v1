import React, { useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  addDoc,
} from "firebase/firestore";
import { toast } from "sonner";
import {
  Loader2,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Plus,
  Image as ImageIcon,
  Info,

} from "lucide-react";

import { db } from "@/firebaseConfig";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { cn } from "@/lib/utils";
import type { Timestamp } from "firebase/firestore";
import ImageSelectorModal from "@/shared/ui/ImageSelectorModal";

// TEMPORARY duplicate (will be extracted later)
// Used to auto-fill: countryName, countryCode, currency, phonePrefix
const WEST_AFRICA_COUNTRIES = [
  { name: "Mali", code: "ML", phonePrefix: "+223", currency: "FCFA", currencySymbol: "F CFA" },
  { name: "Sénégal", code: "SN", phonePrefix: "+221", currency: "FCFA", currencySymbol: "F CFA" },
  { name: "Côte d’Ivoire", code: "CI", phonePrefix: "+225", currency: "FCFA", currencySymbol: "F CFA" },
  { name: "Burkina Faso", code: "BF", phonePrefix: "+226", currency: "FCFA", currencySymbol: "F CFA" },
  { name: "Guinée", code: "GN", phonePrefix: "+224", currency: "GNF", currencySymbol: "GNF" },
  { name: "Niger", code: "NE", phonePrefix: "+227", currency: "FCFA", currencySymbol: "F CFA" },
  { name: "Bénin", code: "BJ", phonePrefix: "+229", currency: "FCFA", currencySymbol: "F CFA" },
  { name: "Togo", code: "TG", phonePrefix: "+228", currency: "FCFA", currencySymbol: "F CFA" },
  { name: "Ghana", code: "GH", phonePrefix: "+233", currency: "GHS", currencySymbol: "GH₵" },
  { name: "Nigeria", code: "NG", phonePrefix: "+234", currency: "NGN", currencySymbol: "₦" },
];


type PaymentMethodType = "ussd" | "wallet_number" | "payment_link";

type PaymentMethodDoc = {
  name: string;
  providerCode: string;
  countryCode: string;
  countryName: string;
  currency?: string;
  phonePrefix?: string;
  type: PaymentMethodType;
  logoUrl: string;
  ussdTemplate?: string;
  requiresMerchantCode?: boolean;
  requiresPhoneNumber?: boolean;
  instructions: string;
  active: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

type PaymentMethodRow = PaymentMethodDoc & { id: string };

type PaymentMethodFormState = {
  name: string;
  providerCode: string;
  countryCode: string;
  countryName: string;
  currency: string;
  phonePrefix: string;
  type: PaymentMethodType;
  logoUrl: string;
  ussdTemplate: string;
  requiresMerchantCode: boolean;
  requiresPhoneNumber: boolean;
  instructions: string;
  active: boolean;
};

const DEFAULT_FORM: PaymentMethodFormState = {
  name: "",
  providerCode: "",
  countryCode: "",
  countryName: "",
  currency: "",
  phonePrefix: "",
  type: "ussd",
  logoUrl: "",
  ussdTemplate: "#144#8*MERCHANT*AMOUNT#",
  requiresMerchantCode: true,
  requiresPhoneNumber: false,
  instructions: "",
  active: true,
};

function statusPill(active: boolean) {
  return active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700";
}

function safeString(v: unknown) {
  if (v == null) return "";
  return String(v);
}

function typeLabel(t: PaymentMethodType) {
  switch (t) {
    case "ussd":
      return "USSD";
    case "wallet_number":
      return "Mobile Money";
    case "payment_link":
      return "Lien de paiement";
  }
}

function isPaymentMethodType(v: string): v is PaymentMethodType {
  return v === "ussd" || v === "wallet_number" || v === "payment_link";
}

export default function AdminPaymentMethodsPage() {
  const isOnline = useOnlineStatus();

  const [rows, setRows] = useState<PaymentMethodRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // Create
  const [createOpen, setCreateOpen] = useState(true);
  
  const onCreateClick = () => {
    setCreateOpen(true);
  };

  const [form, setForm] = useState<PaymentMethodFormState>(DEFAULT_FORM);

  // Edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<PaymentMethodFormState>(DEFAULT_FORM);

  const [logoModalOpen, setLogoModalOpen] = useState(false);

  const [editSaving, setEditSaving] = useState(false);

  // Countries (optional). If collection exists we show a select; otherwise fallback to inputs.
  const [countries, setCountries] = useState<Array<{ code: string; name: string }>>([]);
  const [countriesReady, setCountriesReady] = useState(false);
  const [countriesError, setCountriesError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, "paymentMethods"), orderBy("updatedAt", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: PaymentMethodRow[] = snap.docs.map((d) => {
          const data = d.data() as Partial<PaymentMethodDoc>;
          const rawType = safeString(data.type);
          const type: PaymentMethodType = isPaymentMethodType(rawType) ? rawType : "ussd";

          return {
            id: d.id,
            name: safeString(data.name),
            providerCode: safeString(data.providerCode),
            countryCode: safeString(data.countryCode),
            countryName: safeString(data.countryName),
            type,
            logoUrl: safeString(data.logoUrl),
            ussdTemplate: safeString(data.ussdTemplate),
            requiresMerchantCode: Boolean(data.requiresMerchantCode),
            requiresPhoneNumber: Boolean(data.requiresPhoneNumber),
            instructions: safeString(data.instructions),
            active: Boolean(data.active),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
          };
        });
        setRows(next);
        setReady(true);
      },
      (e) => {
        console.error("[AdminPaymentMethodsPage] paymentMethods snapshot failed", e);
        setRows([]);
        setReady(true);
        setError("Impossible de charger les moyens de paiement.");
      }
    );

    return () => unsub();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCountries() {
      setCountriesReady(false);
      setCountriesError(null);

      // Try multiple potential sources; if none works, we fallback to manual fields.
      const candidates: Array<{ path: string; mapper: (docData: any, id: string) => { code: string; name: string } | null }> = [
        {
          path: "countries",
          mapper: (data) => {
            const code = safeString(data.code || data.countryCode);
            const name = safeString(data.name || data.countryName);
            return code && name ? { code, name } : null;
          },
        },
        {
          path: "pays",
          mapper: (data) => {
            const code = safeString(data.code || data.countryCode || data.id);
            const name = safeString(data.name || data.countryName || data.nom);
            return code && name ? { code, name } : null;
          },
        },
        {
          path: "villes",
          mapper: (data, id) => {
            // Deduce country from ville docs if present.
            const code = safeString(data.countryCode || data.paysCode || data.country?.code);
            const name = safeString(data.countryName || data.paysNom || data.country?.name);
            return code && name ? { code, name } : null;
          },
        },
      ];

      for (const c of candidates) {
        try {
          const snap = await import("firebase/firestore").then(({ getDocs, query, collection }) =>
            getDocs(query(collection(db, c.path)))
          );
          if (cancelled) return;

          const mapped = snap.docs.map((d) => c.mapper(d.data(), d.id)).filter(Boolean) as any[];
          const unique = new Map<string, { code: string; name: string }>();
          for (const item of mapped) {
            unique.set(item.code, item);
          }

          const list = Array.from(unique.values());
          if (list.length) {
            setCountries(list.sort((a, b) => a.name.localeCompare(b.name, "fr")));
            setCountriesReady(true);
            return;
          }
        } catch {
          // Try next candidate.
        }
      }

      if (!cancelled) {
        setCountries([]);
        setCountriesReady(true);
      }
    }

    void loadCountries();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => rows, [rows]);

  const resetCreate = () => {
    setForm(DEFAULT_FORM);
    setCreateOpen(true);
  };

  const openEdit = (id: string) => {
    const r = rows.find((x) => x.id === id);
    if (!r) return;

    setEditingId(id);
    setEditForm({
      name: r.name,
      providerCode: r.providerCode,
      countryCode: r.countryCode,
      countryName: r.countryName,
      currency: (r as any).currency ?? (DEFAULT_FORM as any).currency,
      phonePrefix: (r as any).phonePrefix ?? (DEFAULT_FORM as any).phonePrefix,
      type: r.type,
      logoUrl: r.logoUrl,
      ussdTemplate: r.ussdTemplate || DEFAULT_FORM.ussdTemplate,
      requiresMerchantCode: Boolean(r.requiresMerchantCode),
      requiresPhoneNumber: Boolean(r.requiresPhoneNumber),
      instructions: r.instructions,
      active: Boolean(r.active),
    });
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditForm(DEFAULT_FORM);
    setEditSaving(false);
  };

  const validateForm = (s: PaymentMethodFormState) => {
    const errors: string[] = [];

    const nameOk = !!safeString(s.name).trim();
    const providerCodeOk = !!safeString(s.providerCode).trim();
    const countryCodeOk = !!safeString(s.countryCode).trim();
    const countryNameOk = !!safeString(s.countryName).trim();
    const typeOk = !!safeString(s.type).trim();
    const logoOk = !!safeString(s.logoUrl).trim();

    if (!nameOk) errors.push("Le nom est obligatoire.");
    if (!providerCodeOk) errors.push("L'identifiant fournisseur est obligatoire.");
    if (!countryCodeOk) errors.push("Le pays (code) est obligatoire.");
    if (!countryNameOk) errors.push("Le pays est obligatoire.");

    // Si currency/phonePrefix sont gérés via le select Pays (WEST_AFRICA_COUNTRIES), on évite les faux positifs.
    // Le backend attend ces champs, mais ils sont auto-remplis dès que le pays est sélectionné.
    // (Si l'utilisateur a un payload existant, countryCode/countryName restent la source de vérité UI.)
    if (!typeOk) errors.push("Le type de paiement est obligatoire.");
    if (!logoOk) errors.push("Le logo est obligatoire.");

    if (s.type === "ussd" && !safeString(s.ussdTemplate).trim()) {
      errors.push("Le modèle USSD est obligatoire pour un paiement USSD.");
    }

    // Ne pas bloquer : requiresMerchantCode, requiresPhoneNumber, instructions, active

    if (errors.length) {
      console.log("[AdminPaymentMethodsPage] validation errors", errors);
      toast.error("Veuillez corriger les champs obligatoires.");
      return false;
    }

    return true;
  };

  // Logo selection is done via ImageSelectorModal (platform source), no manual URL input.


  const handleCreate = async () => {
    console.log("[AdminPaymentMethodsPage] save clicked");

    if (saving) {
      console.log("[AdminPaymentMethodsPage] save aborted: already saving");
      return;
    }
    if (!validateForm(form)) {
      console.log("[AdminPaymentMethodsPage] save aborted: form invalid");
      return;
    }

    setSaving(true);
    try {
      // Construire le payload AVANT toute écriture Firestore
      const payload: Partial<PaymentMethodDoc> = {
        name: form.name.trim(),
        providerCode: form.providerCode.trim(),
        countryCode: form.countryCode.trim(),
        countryName: form.countryName.trim(),
        type: form.type,
        logoUrl: form.logoUrl.trim(),
        ussdTemplate: form.type === "ussd" ? form.ussdTemplate.trim() : "",
        requiresMerchantCode: form.type === "ussd" ? Boolean(form.requiresMerchantCode) : false,
        requiresPhoneNumber: form.type === "wallet_number" ? Boolean(form.requiresPhoneNumber) : false,
        instructions: form.instructions.trim(),
        active: Boolean(form.active),
        createdAt: undefined,
        updatedAt: undefined,
        // champs pays (ajout)
        currency: form.currency,
        phonePrefix: form.phonePrefix,
      };

      console.log("[AdminPaymentMethodsPage] payload", payload);

      console.log("[AdminPaymentMethodsPage] handleCreate payload (debug)", {
        ...form,
        logoUrl: form.logoUrl ? "<selected>" : "",
      });

      await addDoc(collection(db, "paymentMethods"), {
        ...payload,
        active: Boolean(form.active),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success("Moyen de paiement ajouté.");
      resetCreate();
    } catch (e) {
      console.error("[AdminPaymentMethodsPage] create failed", e);
      toast.error("Impossible d'ajouter le moyen de paiement.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingId || editSaving) return;
    if (!validateForm(editForm)) return;

    setEditSaving(true);
    try {
      await updateDoc(doc(db, "paymentMethods", editingId), {
        name: editForm.name.trim(),
        providerCode: editForm.providerCode.trim(),
        countryCode: editForm.countryCode.trim(),
        countryName: editForm.countryName.trim(),
        currency: editForm.currency,
        phonePrefix: editForm.phonePrefix,
        type: editForm.type,
        logoUrl: editForm.logoUrl.trim(),
        ussdTemplate: editForm.type === "ussd" ? editForm.ussdTemplate.trim() : "",
        requiresMerchantCode: editForm.type === "ussd" ? Boolean(editForm.requiresMerchantCode) : false,
        requiresPhoneNumber: editForm.type === "wallet_number" ? Boolean(editForm.requiresPhoneNumber) : false,
        instructions: editForm.instructions.trim(),
        updatedAt: serverTimestamp(),
        active: Boolean(editForm.active),
      });

      toast.success("Moyen de paiement mis à jour.");
      closeEdit();
    } catch (e) {
      console.error("[AdminPaymentMethodsPage] update failed", e);
      toast.error("Impossible de mettre à jour.");
    } finally {
      setEditSaving(false);
    }
  };

  const toggleActive = async (id: string, nextActive: boolean) => {
    try {
      await updateDoc(doc(db, "paymentMethods", id), {
        active: nextActive,
        updatedAt: serverTimestamp(),
      });
      toast.success(nextActive ? "Activé." : "Désactivé.");
    } catch (e) {
      console.error("[AdminPaymentMethodsPage] toggleActive failed", e);
      toast.error("Action impossible.");
    }
  };

  const renderTypeSpecific = (
    s: PaymentMethodFormState,
    onChange: (patch: Partial<PaymentMethodFormState>) => void
  ) => {

    if (s.type === "ussd") {
      return (
        <div className="space-y-3">
          <label className="space-y-1">
            <div className="text-xs font-semibold text-slate-700">Modèle USSD</div>
            <textarea
              className="min-h-[84px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none"
              value={s.ussdTemplate}
              onChange={(e) => onChange({ ussdTemplate: e.target.value })}
            />
            <div className="text-xs text-slate-500 mt-1 flex items-start gap-2">
              <Info className="h-3.5 w-3.5 mt-0.5" />
              <div>
                Utilisez <span className="font-semibold">MERCHANT</span> pour l’identifiant marchand et <span className="font-semibold">AMOUNT</span> pour le montant.
                <div className="mt-1 font-mono">Ex: #144#8*MERCHANT*AMOUNT#</div>
              </div>
            </div>
          </label>

          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-sm font-semibold text-slate-700">Code marchand requis</span>
            <input
              type="checkbox"
              checked={s.requiresMerchantCode}
              onChange={(e) => onChange({ requiresMerchantCode: e.target.checked })}
            />
          </label>
          <div className="text-xs text-slate-500">À activer si la compagnie doit saisir un code marchand.</div>
        </div>
      );
    }

    if (s.type === "wallet_number") {
      return (
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-sm font-semibold text-slate-700">Numéro de réception requis</span>
            <input
              type="checkbox"
              checked={s.requiresPhoneNumber}
              onChange={(e) => onChange({ requiresPhoneNumber: e.target.checked })}
            />
          </label>
          <div className="text-xs text-slate-500">À activer si la compagnie doit saisir un numéro mobile money.</div>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <div className="text-xs text-slate-500">
          Pour un type <span className="font-semibold">Lien de paiement</span>, aucun modèle USSD ni numéro de réception n’est nécessaire.
        </div>
      </div>
    );
  };

  const providerExamples = "sarali, orange_money, wave, moov_money";

  const CountriesSourceNote = () => {
    if (!countriesReady) return null;
    if (countries.length) return <span className="text-xs text-emerald-700">Liste pays contrôlée</span>;
    if (countriesError) return <span className="text-xs text-rose-700">Liste pays indisponible</span>;
    return <span className="text-xs text-slate-500">Saisie manuelle (V1)</span>;
  };

  const countriesList = countries;

  const updateCountryFromSelect = (code: string) => {
    const c = countriesList.find((x) => x.code === code);
    if (!c) return;

    const mapped = (WEST_AFRICA_COUNTRIES as any[]).find((x) => x.code === c.code);
    setForm((prev) => ({
      ...prev,
      countryCode: c.code,
      countryName: c.name,
      currency: mapped?.currency ?? prev.currency,
      phonePrefix: mapped?.phonePrefix ?? prev.phonePrefix,
    }));

    if (editingId) {
      setEditForm((prev) => ({
        ...prev,
        countryCode: c.code,
        countryName: c.name,
        currency: mapped?.currency ?? prev.currency,
        phonePrefix: mapped?.phonePrefix ?? prev.phonePrefix,
      }));
    }
  };

  const formLogoHelp = (
    <div className="text-xs text-slate-500 mt-1">
      Logo: sélection depuis <span className="font-semibold">/admin/media</span> (copiez le lien / identifiant du média).
    </div>
  );

  if (!ready) return <PageLoadingState blocks={2} />;

  return (
    <div className="space-y-6">
      {!isOnline && <PageOfflineState message="Connexion instable: certaines actions peuvent échouer." />}
      {error && <PageErrorState message={error} onRetry={() => window.location.reload()} />}


      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Moyens de paiement</h1>
          <p className="mt-1 text-sm text-slate-500">Back-office: configuration des types, exigences & disponibilité.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
        {/* Section 1: Liste propre */}
        <Card>
          <CardHeader>

            <CardTitle>Liste des moyens de paiement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {filteredRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
                Aucun moyen de paiement trouvé.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredRows.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="h-12 w-12 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                          {r.logoUrl ? (
                            <img src={r.logoUrl} alt={r.name} className="h-full w-full object-contain" />
                          ) : (
                            <ImageIcon className="h-5 w-5 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-950 truncate">{r.name}</div>
                          <div className="text-xs text-slate-500 truncate">{r.providerCode}</div>
                        </div>
                      </div>

                      <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold", statusPill(r.active))}>
                        {r.active ? "Actif" : "Inactif"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="text-xs text-slate-500">Pays</div>
                        <div className="font-medium text-slate-900">{r.countryName || "—"}</div>
                        <div className="text-xs text-slate-500">{r.countryCode || ""}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Type</div>
                        <div className="font-medium text-slate-900">{typeLabel(r.type)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" onClick={() => openEdit(r.id)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Modifier
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => toggleActive(r.id, !r.active)}
                      >
                        {r.active ? (
                          <>
                            <ToggleRight className="h-4 w-4 mr-2" />
                            Désactiver
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-4 w-4 mr-2" />
                            Activer
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Section 2: Ajouter */}
        <Card>
          <CardHeader>
            <CardTitle>Ajouter un moyen de paiement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!createOpen ? null : (
              <div className="space-y-4">
                <div className="space-y-3">
                  <label className="space-y-1 block">
                    <div className="text-xs font-semibold text-slate-700">Nom du moyen de paiement</div>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                      value={form.name}
                      onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Ex: Orange Money (TMB)"
                    />
                  </label>

                  <div>
                    <label className="space-y-1 block">
                      <div className="text-xs font-semibold text-slate-700">Pays</div>
                      <select
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                        value={form.countryCode}
                        onChange={(e) => {
                          const selectedCode = e.target.value;
                          const selected = (WEST_AFRICA_COUNTRIES as any[]).find(
                            (c) => c.code === selectedCode
                          );
                          console.log("[AdminPaymentMethodsPage] selected country", selected);

                          if (!selected) return;

                          setForm((prev) => ({
                            ...prev,
                            countryCode: selected.code,
                            countryName: selected.name,
                            currency: selected.currency ?? "",
                            phonePrefix: selected.phonePrefix ?? "",
                          }));
                        }}
                      >
                        <option value="">Choisir...</option>
                        {WEST_AFRICA_COUNTRIES.map((c: any) => (
                          <option key={c.code} value={c.code}>
                            {c.countryName ?? c.name}
                          </option>
                        ))}
                      </select>
                      <div className="mt-1">
                        <CountriesSourceNote />
                      </div>
                    </label>
                  </div>

                  <label className="space-y-1 block">
                    <div className="text-xs font-semibold text-slate-700">Identifiant technique fournisseur</div>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                      value={form.providerCode}
                      onChange={(e) => setForm((s) => ({ ...s, providerCode: e.target.value }))}
                      placeholder={providerExamples}
                    />
                    <div className="text-xs text-slate-500">
                      Code interne stable utilisé par la plateforme : {providerExamples}.
                    </div>
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-xs font-semibold text-slate-700">Type de paiement</div>
                    <select
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                      value={form.type}
                      onChange={(e) => {
                        const t = e.target.value as PaymentMethodType;
                        setForm((s) => ({
                          ...s,
                          type: t,
                          // reset irrelevant fields
                          ussdTemplate: t === "ussd" ? s.ussdTemplate : DEFAULT_FORM.ussdTemplate,
                          requiresMerchantCode: t === "ussd" ? s.requiresMerchantCode : false,
                          requiresPhoneNumber: t === "wallet_number" ? s.requiresPhoneNumber : false,
                        }));
                      }}
                    >
                      <option value="ussd">USSD</option>
                      <option value="wallet_number">Numéro Mobile Money</option>
                      <option value="payment_link">Lien de paiement</option>
                    </select>
                  </label>

                  {/* Logo selection placeholder */}
                  <label className="space-y-1 block">
                    <div className="text-xs font-semibold text-slate-700">Logo</div>
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden">
                        {form.logoUrl ? (
                          <img src={form.logoUrl} alt={form.name || "logo"} className="h-full w-full object-contain" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" variant="secondary" onClick={() => setLogoModalOpen(true)}>
                            Choisir un logo
                          </Button>
                          {form.logoUrl ? (
                            <Button type="button" size="sm" variant="secondary" onClick={() => setForm((prev) => ({ ...prev, logoUrl: "" }))}>
                              Retirer
                            </Button>
                          ) : null}
                        </div>
                        {form.logoUrl ? (
                          <div className="text-xs text-slate-500 mt-1">Logo sélectionné ✅</div>
                        ) : (
                          <div className="text-xs text-slate-500 mt-1">Aucun logo sélectionné</div>
                        )}
                      </div>
                    </div>
                  </label>

                  {logoModalOpen && (
                    <ImageSelectorModal
                      source="platform"
                      title="Choisir un logo"
                      onSelect={(url) => {
                        if (editingId) {
                          setEditForm((prev) => ({ ...prev, logoUrl: url }));
                        } else {
                          setForm((prev) => ({ ...prev, logoUrl: url }));
                        }
                        setLogoModalOpen(false);
                      }}
                      onClose={() => setLogoModalOpen(false)}
                    />
                  )}



                  {renderTypeSpecific(form, (patch) => setForm((s) => ({ ...s, ...patch } as any)))}

                  <label className="space-y-1 block">
                    <div className="text-xs font-semibold text-slate-700">Instructions (affichées à la compagnie / client)</div>
                    <textarea
                      className="min-h-[110px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none"
                      value={form.instructions}
                      onChange={(e) => setForm((s) => ({ ...s, instructions: e.target.value }))}
                      placeholder="Ex: Choisissez votre moyen, puis validez..."
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-sm font-semibold text-slate-700">Actif</span>
                    <input type="checkbox" checked={form.active} onChange={(e) => setForm((s) => ({ ...s, active: e.target.checked }))} />
                  </label>
                </div>

                <div className="pt-2 flex gap-2">
                  <Button
                    type="button"
                    onClick={() => {
                      console.log("[AdminPaymentMethodsPage] add button clicked");
                      handleCreate();
                    }}
                    disabled={saving}
                  >
                    {saving ? (
                      <span className="inline-flex items-center">
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Ajout...
                      </span>
                    ) : (
                      <span className="inline-flex items-center">
                        <Plus className="h-4 w-4 mr-2" />
                        Ajouter
                      </span>
                    )}
                  </Button>
                  <Button variant="secondary" onClick={resetCreate} disabled={saving}>
                    Réinitialiser
                  </Button>
                </div>
              </div>
            )}

            {editingId ? (
              <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                Edition en cours. Sauvegardez depuis le panneau “Modifier”.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Edit */}
      {editingId ? (
        <Card>
          <CardHeader>
            <CardTitle>Modifier le moyen de paiement</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="space-y-1 block">
                    <div className="text-xs font-semibold text-slate-700">Nom du moyen de paiement</div>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                      value={editForm.name}
                      onChange={(e) => setEditForm((s) => ({ ...s, name: e.target.value }))}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1 block">
                      <div className="text-xs font-semibold text-slate-700">Pays</div>
                      <select
                        className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                        value={editForm.countryCode}
                        onChange={(e) => {
                          const code = e.target.value;
                          const mapped: any = (WEST_AFRICA_COUNTRIES as any[]).find((x) => x.code === code || x.countryCode === code);
                          if (!mapped) {
                            setEditForm((s) => ({ ...s, countryCode: code }));
                            return;
                          }
                          setEditForm((s) => ({
                            ...s,
                            countryCode: mapped.countryCode ?? mapped.code,
                            countryName: mapped.countryName ?? mapped.name ?? "",
                            currency: mapped.currency ?? "",
                            phonePrefix: mapped.phonePrefix ?? mapped.phone_prefix ?? "",
                          }));
                        }}
                      >
                        <option value="">Choisir...</option>
                        {WEST_AFRICA_COUNTRIES.map((c: any) => (
                          <option key={c.code} value={c.code}>
                            {c.countryName ?? c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="space-y-1 block">
                    <div className="text-xs font-semibold text-slate-700">Identifiant technique fournisseur</div>
                    <input
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                      value={editForm.providerCode}
                      onChange={(e) => setEditForm((s) => ({ ...s, providerCode: e.target.value }))}
                    />
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-xs font-semibold text-slate-700">Type de paiement</div>
                    <select
                      className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                      value={editForm.type}
                      onChange={(e) => {
                        const t = e.target.value as PaymentMethodType;
                        setEditForm((s) => ({
                          ...s,
                          type: t,
                          ussdTemplate: t === "ussd" ? s.ussdTemplate : DEFAULT_FORM.ussdTemplate,
                          requiresMerchantCode: t === "ussd" ? s.requiresMerchantCode : false,
                          requiresPhoneNumber: t === "wallet_number" ? s.requiresPhoneNumber : false,
                        }));
                      }}
                    >
                      <option value="ussd">USSD</option>
                      <option value="wallet_number">Numéro Mobile Money</option>
                      <option value="payment_link">Lien de paiement</option>
                    </select>
                  </label>

                  <label className="space-y-1 block">
                    <div className="text-xs font-semibold text-slate-700">Logo</div>
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-lg border border-slate-100 bg-slate-50 flex items-center justify-center overflow-hidden">
                        {editForm.logoUrl ? (
                          <img src={editForm.logoUrl} alt={editForm.name || "logo"} className="h-full w-full object-contain" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Button type="button" size="sm" variant="secondary" onClick={() => setLogoModalOpen(true)}>
                            Choisir un logo
                          </Button>
                          {editForm.logoUrl ? (
                            <Button type="button" size="sm" variant="secondary" onClick={() => setEditForm((prev) => ({ ...prev, logoUrl: "" }))}>
                              Retirer
                            </Button>
                          ) : null}
                        </div>
                        {editForm.logoUrl ? (
                          <div className="text-xs text-slate-500 mt-1">Logo sélectionné ✅</div>
                        ) : (
                          <div className="text-xs text-slate-500 mt-1">Aucun logo sélectionné</div>
                        )}
                      </div>

                    </div>
                  </label>
                </div>

                <div className="space-y-3">
                  {renderTypeSpecific(editForm, (patch) => setEditForm((s) => ({ ...s, ...patch } as any)))}

                  <label className="space-y-1 block">
                    <div className="text-xs font-semibold text-slate-700">Instructions</div>
                    <textarea
                      className="min-h-[110px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none"
                      value={editForm.instructions}
                      onChange={(e) => setEditForm((s) => ({ ...s, instructions: e.target.value }))}
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-sm font-semibold text-slate-700">Actif</span>
                    <input type="checkbox" checked={editForm.active} onChange={(e) => setEditForm((s) => ({ ...s, active: e.target.checked }))} />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="text-xs text-slate-500">ID: {editingId}</div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={closeEdit} disabled={editSaving}>
                    Annuler
                  </Button>
                  <Button onClick={handleUpdate} disabled={editSaving}>
                    {editSaving ? (
                      <span className="inline-flex items-center">
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Sauvegarde...
                      </span>
                    ) : (
                      <span className="inline-flex items-center">
                        <Pencil className="h-4 w-4 mr-2" />
                        Enregistrer
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

