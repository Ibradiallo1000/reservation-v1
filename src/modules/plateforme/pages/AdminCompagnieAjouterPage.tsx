import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { createInvitationDoc } from "@/shared/invitations/createInvitationDoc";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { formatCurrency, getCurrencySymbol } from "@/shared/utils/formatCurrency";
import {
  Building2,
  UserCog,
  CreditCard,
  Settings2,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from "lucide-react";

/* ====================================================================
   TYPES
==================================================================== */
type SupportLevel = "basic" | "standard" | "priority" | "premium" | "enterprise";

type PlanDoc = {
  name: string;
  priceMonthly: number;
  quotaReservations?: number;
  digitalFeePercent: number;
  feeGuichet: number;
  minimumMonthly: number;
  maxAgences: number;
  supportLevel: SupportLevel;
  isTrial?: boolean;
  trialDurationDays?: number;
  brandingLocked?: boolean;
  features: {
    publicPage: boolean;
    onlineBooking: boolean;
    guichet: boolean;
  };
};

type SubscriptionSnapshot = {
  priceMonthly: number;
  quotaReservations: number;
  digitalFeePercent: number;
  feeGuichet: number;
  minimumMonthly: number;
  maxAgences: number;
  supportLevel: SupportLevel;
  features: {
    publicPage: true;
    onlineBooking: true;
    guichet: true;
  };
};

type SubscriptionObject = {
  status: "trial" | "active";
  planId: string;
  planName: string;
  planType: "trial" | "paid";
  isFree: boolean;
  currentPeriodStart: Timestamp;
  currentPeriodEnd: Timestamp;
  trialEndsAt?: Timestamp;
  gracePeriodEnd?: Timestamp;
  lastPaymentAt?: Timestamp;
  paymentMethod?: "invoice" | "mobile_money";
  snapshot: SubscriptionSnapshot;
};

type SubscriptionStatus = "active" | "grace" | "restricted" | "suspended";

type PlanOption = {
  id: string;
  name: string;
  priceMonthly: number;
  isTrial?: boolean;
  trialDurationDays?: number;
};

/* ====================================================================
   CONSTANTS
==================================================================== */
const nf = new Intl.NumberFormat("fr-FR");

interface WestAfricaCountry {
  name: string;
  code: string;
  phone: string;
  currency: string;
  currencySymbol: string;
}

const WEST_AFRICA_COUNTRIES: WestAfricaCountry[] = [
  { name: "Bénin",          code: "BJ", phone: "+229", currency: "XOF", currencySymbol: "FCFA" },
  { name: "Burkina Faso",   code: "BF", phone: "+226", currency: "XOF", currencySymbol: "FCFA" },
  { name: "Cap-Vert",       code: "CV", phone: "+238", currency: "CVE", currencySymbol: "CVE"  },
  { name: "Côte d'Ivoire",  code: "CI", phone: "+225", currency: "XOF", currencySymbol: "FCFA" },
  { name: "Gambie",          code: "GM", phone: "+220", currency: "GMD", currencySymbol: "GMD"  },
  { name: "Ghana",           code: "GH", phone: "+233", currency: "GHS", currencySymbol: "GH₵" },
  { name: "Guinée",          code: "GN", phone: "+224", currency: "GNF", currencySymbol: "GNF"  },
  { name: "Guinée-Bissau",   code: "GW", phone: "+245", currency: "XOF", currencySymbol: "FCFA" },
  { name: "Libéria",         code: "LR", phone: "+231", currency: "LRD", currencySymbol: "LRD"  },
  { name: "Mali",            code: "ML", phone: "+223", currency: "XOF", currencySymbol: "FCFA" },
  { name: "Mauritanie",      code: "MR", phone: "+222", currency: "MRU", currencySymbol: "MRU"  },
  { name: "Niger",           code: "NE", phone: "+227", currency: "XOF", currencySymbol: "FCFA" },
  { name: "Nigéria",         code: "NG", phone: "+234", currency: "NGN", currencySymbol: "₦"    },
  { name: "Sénégal",         code: "SN", phone: "+221", currency: "XOF", currencySymbol: "FCFA" },
  { name: "Sierra Leone",    code: "SL", phone: "+232", currency: "SLE", currencySymbol: "SLE"  },
  { name: "Togo",            code: "TG", phone: "+228", currency: "XOF", currencySymbol: "FCFA" },
];

/* ====================================================================
   UTILS
==================================================================== */
function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--btn-primary,#FF6600)] focus:outline-none focus:ring-2 focus:ring-[var(--btn-primary,#FF6600)]/20 disabled:opacity-50";

const selectClass = `${inputClass} appearance-none`;

/* ====================================================================
   COMPONENT
==================================================================== */
const AdminCompagnieAjouterPage: React.FC = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();

  /* ── Section 1 – Company Information ── */
  const [nom, setNom] = useState("");
  const [slug, setSlug] = useState("");
  const [pays, setPays] = useState("");
  const [phoneCountryCode, setPhoneCountryCode] = useState("");
  const [devise, setDevise] = useState("");
  const [deviseSymbol, setDeviseSymbol] = useState("");
  const [telephonePrincipal, setTelephonePrincipal] = useState("");
  const [telephoneSecondaire, setTelephoneSecondaire] = useState("");
  const [emailVitrine, setEmailVitrine] = useState("");

  /* ── Section 2 – CEO Account ── */
  const [ceoFullName, setCeoFullName] = useState("");
  const [ceoEmail, setCeoEmail] = useState("");
  const [ceoPhone, setCeoPhone] = useState("");

  /* ── Section 3 – Plan & Trial ── */
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<PlanDoc | null>(null);
  const [trialEnabled, setTrialEnabled] = useState(false);
  const [status, setStatus] = useState<"actif" | "inactif">("actif");

  /* ── UI State ── */
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<null | { type: "success" | "error"; text: string }>(null);
  const [slugError, setSlugError] = useState("");
  const [ceoEmailError, setCeoEmailError] = useState("");

  /* ================================================================
     LOAD PLANS
  ================================================================ */
  useEffect(() => {
    (async () => {
      const snap = await getDocs(
        query(collection(db, "plans"), orderBy("priceMonthly", "asc")),
      );
      setPlans(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name,
            priceMonthly: data.priceMonthly,
            isTrial: Boolean(data.isTrial),
            trialDurationDays: Number(data.trialDurationDays) || 0,
          };
        }),
      );
    })();
  }, []);

  /* ================================================================
     LOAD COMPANY (edit mode)
  ================================================================ */
  useEffect(() => {
    if (!isEdit) {
      setLoading(false);
      return;
    }

    (async () => {
      const snap = await getDoc(doc(db, "companies", id!));
      if (!snap.exists()) {
        navigate("/admin/compagnies");
        return;
      }

      const d = snap.data();
      setNom(d.nom ?? "");
      setSlug(d.slug ?? "");
      setPays(d.pays ?? "");
      setPhoneCountryCode(d.phoneCountryCode ?? "");
      setTelephonePrincipal(d.telephonePrincipal ?? d.telephone ?? "");
      setTelephoneSecondaire(d.telephoneSecondaire ?? "");
      setEmailVitrine(d.emailVitrine ?? d.email ?? "");
      setDevise(d.devise ?? "");
      setDeviseSymbol(d.deviseSymbol ?? "");
      setStatus(d.status ?? "actif");
      setSelectedPlanId(d.planId ?? "");
      setLoading(false);
    })();
  }, [id, isEdit, navigate]);

  /* ================================================================
     LOAD SELECTED PLAN details
  ================================================================ */
  useEffect(() => {
    if (!selectedPlanId) {
      setSelectedPlan(null);
      return;
    }
    (async () => {
      const snap = await getDoc(doc(db, "plans", selectedPlanId));
      if (snap.exists()) {
        const data = snap.data() as PlanDoc;
        setSelectedPlan(data);
        // Auto-enable trial toggle if plan is flagged as trial
        if (data.isTrial && !isEdit) {
          setTrialEnabled(true);
        }
      } else {
        setSelectedPlan(null);
      }
    })();
  }, [selectedPlanId, isEdit]);

  /* ================================================================
     AUTO SLUG from company name
  ================================================================ */
  useEffect(() => {
    if (!isEdit && nom) setSlug(slugify(nom));
  }, [nom, isEdit]);

  /* ================================================================
     AUTO PHONE CODE + CURRENCY from pays
  ================================================================ */
  useEffect(() => {
    const country = WEST_AFRICA_COUNTRIES.find((c) => c.name === pays);
    if (country) {
      setPhoneCountryCode(country.phone);
      setDevise(country.currency);
      setDeviseSymbol(country.currencySymbol);
    } else {
      setPhoneCountryCode("");
      setDevise("");
      setDeviseSymbol("");
    }
  }, [pays]);

  /* ================================================================
     VALIDATION
  ================================================================ */
  const canSubmit = useMemo(() => {
    const baseValid =
      nom.trim() &&
      slug.trim() &&
      pays.trim() &&
      telephonePrincipal.trim() &&
      selectedPlanId &&
      !saving &&
      !slugError;

    if (isEdit) return !!baseValid;

    return !!(baseValid && ceoFullName.trim() && ceoEmail.trim() && !ceoEmailError);
  }, [
    nom, slug, pays, telephonePrincipal, selectedPlanId, saving,
    slugError, isEdit, ceoFullName, ceoEmail, ceoEmailError,
  ]);

  /* ── Slug uniqueness check (debounced) ── */
  useEffect(() => {
    if (!slug.trim()) {
      setSlugError("");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const q = query(
          collection(db, "companies"),
          where("slug", "==", slug.trim()),
          limit(1),
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const existingId = snap.docs[0].id;
          if (isEdit && existingId === id) {
            setSlugError("");
          } else {
            setSlugError("Ce slug est déjà utilisé par une autre compagnie.");
          }
        } else {
          setSlugError("");
        }
      } catch {
        setSlugError("");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [slug, isEdit, id]);

  /* ── CEO email uniqueness check (debounced) ── */
  useEffect(() => {
    if (isEdit || !ceoEmail.trim()) {
      setCeoEmailError("");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const email = ceoEmail.trim().toLowerCase();

        const invQ = query(
          collection(db, "invitations"),
          where("email", "==", email),
          limit(1),
        );
        const invSnap = await getDocs(invQ);
        if (!invSnap.empty) {
          setCeoEmailError("Cet email a déjà une invitation en cours.");
          return;
        }

        const usrQ = query(
          collection(db, "users"),
          where("email", "==", email),
          limit(1),
        );
        const usrSnap = await getDocs(usrQ);
        if (!usrSnap.empty) {
          setCeoEmailError("Un utilisateur existe déjà avec cet email.");
          return;
        }

        setCeoEmailError("");
      } catch {
        setCeoEmailError("");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [ceoEmail, isEdit]);

  /* ================================================================
     BUILD SUBSCRIPTION OBJECT
  ================================================================ */
  function buildSubscription(plan: PlanDoc, planId: string, trial: boolean): SubscriptionObject {
    const now = new Date();
    const trialDays = plan.trialDurationDays ?? 30;
    const PERIOD_MS = (trial ? trialDays : 30) * 24 * 60 * 60 * 1000;

    const periodStart = Timestamp.fromDate(now);
    const periodEnd = Timestamp.fromDate(new Date(now.getTime() + PERIOD_MS));

    const snapshot: SubscriptionSnapshot = {
      priceMonthly: plan.priceMonthly ?? 0,
      quotaReservations: plan.quotaReservations ?? 0,
      digitalFeePercent: plan.digitalFeePercent ?? 0,
      feeGuichet: plan.feeGuichet ?? 0,
      minimumMonthly: plan.minimumMonthly ?? 0,
      maxAgences: plan.maxAgences ?? 0,
      supportLevel: plan.supportLevel ?? "basic",
      // All features always included
      features: {
        publicPage: true as const,
        onlineBooking: true as const,
        guichet: true as const,
      },
    };

    const isFree = (plan.priceMonthly ?? 0) === 0;

    if (trial) {
      return {
        status: "trial",
        planId,
        planName: plan.name,
        planType: "trial",
        isFree,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        trialEndsAt: periodEnd,
        snapshot,
      };
    }

    return {
      status: "active",
      planId,
      planName: plan.name,
      planType: "paid",
      isFree,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      snapshot,
    };
  }

  /* ================================================================
     SUBMIT
  ================================================================ */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !selectedPlan) return;

    setSaving(true);
    setMessage(null);

    let createdCompanyId: string | null = null;

    try {
      /* ── Build subscription ── */
      const subscription = buildSubscription(selectedPlan, selectedPlanId, trialEnabled);

      const resolvedStatus = trialEnabled ? "actif" : status;

      /* ── Build company payload ── */
      const companyPayload: Record<string, unknown> = {
        nom: nom.trim(),
        slug: slug.trim(),
        pays: pays.trim(),
        phoneCountryCode,
        devise,
        deviseSymbol,
        telephonePrincipal: telephonePrincipal.trim(),
        telephoneSecondaire: telephoneSecondaire.trim() || null,
        emailVitrine: emailVitrine.trim() || null,
        status: resolvedStatus,

        // Backward-compatible flat fields
        planId: selectedPlanId,
        plan: selectedPlan.name,
        digitalFeePercent: subscription.snapshot.digitalFeePercent,
        feeGuichet: subscription.snapshot.feeGuichet,
        minimumMonthly: subscription.snapshot.minimumMonthly,
        maxAgences: subscription.snapshot.maxAgences,
        supportLevel: subscription.snapshot.supportLevel,
        planType: subscription.planType,
        // Online booking is ALWAYS enabled
        publicPageEnabled: true,
        onlineBookingEnabled: true,
        guichetEnabled: true,

        // New subscription lifecycle object
        subscription,

        // Payment lifecycle fields (structured, not yet automated)
        subscriptionStatus: trialEnabled ? ("trial" as SubscriptionStatus) : ("active" as SubscriptionStatus),
        nextBillingDate: subscription.currentPeriodEnd,

        updatedAt: serverTimestamp(),
      };

      if (trialEnabled) {
        companyPayload.trialEndsAt = subscription.trialEndsAt ?? null;
      }

      /* Section 4 – Default System Configuration (creation only) */
      if (!isEdit) {
        Object.assign(companyPayload, {
          couleurPrimaire: "#FF6600",
          couleurSecondaire: "#FFFFFF",
          imagesSlider: [],
          createdAt: serverTimestamp(),
        });
      }

      /* ── Persist company ── */
      if (isEdit) {
        await updateDoc(doc(db, "companies", id!), companyPayload);
        createdCompanyId = id!;
      } else {
        const docRef = await addDoc(collection(db, "companies"), companyPayload);
        createdCompanyId = docRef.id;
      }

      /* ── Section 2 – Create CEO invitation (Spark-compatible, no Cloud Function) ── */
      let activationUrl = "";
      if (!isEdit && ceoEmail.trim()) {
        try {
          const result = await createInvitationDoc({
            email: ceoEmail,
            role: "company_ceo",
            companyId: createdCompanyId,
            fullName: ceoFullName,
            phone: ceoPhone || undefined,
            createdBy: "admin_platform",
          });
          activationUrl = result.activationUrl;
        } catch (inviteErr: unknown) {
          console.error("CEO invitation failed, rolling back company:", inviteErr);
          if (createdCompanyId) {
            try {
              await deleteDoc(doc(db, "companies", createdCompanyId));
            } catch (deleteErr) {
              console.error("Rollback delete failed, marking as pending_setup:", deleteErr);
              await updateDoc(doc(db, "companies", createdCompanyId), {
                status: "pending_setup",
                updatedAt: serverTimestamp(),
              });
            }
          }
          const errMsg =
            inviteErr instanceof Error ? inviteErr.message : "Erreur lors de l'envoi de l'invitation CEO.";
          setMessage({
            type: "error",
            text: `L'invitation CEO a échoué : ${errMsg}. La compagnie a été annulée. Veuillez réessayer.`,
          });
          setSaving(false);
          return;
        }
      }

      setMessage({
        type: "success",
        text: isEdit
          ? "Compagnie mise à jour avec succès."
          : activationUrl
            ? `Compagnie créée ! Lien d'activation CEO : ${activationUrl}`
            : "Compagnie créée avec succès.",
      });

      setTimeout(() => navigate("/admin/compagnies"), 1500);
    } catch (err: unknown) {
      console.error(err);
      const errorMessage =
        err instanceof Error ? err.message : "Erreur lors de l'enregistrement.";
      setMessage({ type: "error", text: errorMessage });
    } finally {
      setSaving(false);
    }
  }

  /* ================================================================
     RENDER
  ================================================================ */
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        <span className="ml-2 text-gray-500">Chargement…</span>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Page Header ── */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? "Modifier la compagnie" : "Configuration initiale d'une compagnie"}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isEdit
            ? "Modifiez les informations de la compagnie ci-dessous."
            : "Remplissez les 4 sections ci-dessous pour créer et configurer une nouvelle compagnie."}
        </p>
      </div>

      {/* ── Global Message ── */}
      {message && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-4 text-sm ${
            message.type === "error"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {message.type === "error" ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ============================================================
            SECTION 1 – Company Information
        ============================================================ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-gray-600" />
              1. Informations de la compagnie
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nom */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Nom de la compagnie <span className="text-red-500">*</span>
                </label>
                <input
                  className={inputClass}
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  placeholder="Ex: Transport Express Mali"
                  required
                />
              </div>

              {/* Slug */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Slug (URL) <span className="text-red-500">*</span>
                </label>
                <input
                  className={`${inputClass} ${slugError ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""}`}
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  placeholder="transport-express-mali"
                  required
                />
                {slugError && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> {slugError}
                  </p>
                )}
                {!slugError && slug && (
                  <p className="text-xs text-gray-400 mt-1">
                    URL : teliya.com/<span className="font-medium">{slug}</span>
                  </p>
                )}
              </div>

              {/* Pays */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Pays <span className="text-red-500">*</span>
                </label>
                <select
                  className={selectClass}
                  value={pays}
                  onChange={(e) => setPays(e.target.value)}
                  required
                >
                  <option value="">— Sélectionner un pays —</option>
                  {WEST_AFRICA_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.name}>
                      {c.name} ({c.phone}) — {getCurrencySymbol(c.currency)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Devise (auto-dérivée du pays) */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Devise
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 text-sm text-gray-600 bg-gray-100 border border-r-0 border-gray-300 rounded-l-xl select-none min-w-[4rem] justify-center font-medium">
                    {deviseSymbol || "—"}
                  </span>
                  <input
                    className="flex-1 rounded-r-xl border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700"
                    value={devise ? `${devise} (${deviseSymbol})` : "Sélectionnez un pays"}
                    readOnly
                    tabIndex={-1}
                  />
                </div>
                {pays && (
                  <p className="text-xs text-gray-400 mt-1">
                    Devise automatique pour <strong>{pays}</strong>
                  </p>
                )}
              </div>

              {/* Telephone principal */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Téléphone principal <span className="text-red-500">*</span>
                </label>
                <div className="flex">
                  <span className="inline-flex items-center px-3 text-sm text-gray-600 bg-gray-100 border border-r-0 border-gray-300 rounded-l-xl select-none min-w-[4rem] justify-center">
                    {phoneCountryCode || "—"}
                  </span>
                  <input
                    type="tel"
                    className="flex-1 rounded-r-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[var(--btn-primary,#FF6600)] focus:outline-none focus:ring-2 focus:ring-[var(--btn-primary,#FF6600)]/20"
                    value={telephonePrincipal}
                    onChange={(e) => setTelephonePrincipal(e.target.value)}
                    placeholder="76 12 34 56"
                    required
                  />
                </div>
              </div>

              {/* Telephone secondaire */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Téléphone secondaire
                </label>
                <input
                  className={inputClass}
                  value={telephoneSecondaire}
                  onChange={(e) => setTelephoneSecondaire(e.target.value)}
                  placeholder="Optionnel"
                />
              </div>

              {/* Email vitrine */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Email vitrine / contact
                </label>
                <input
                  className={inputClass}
                  type="email"
                  value={emailVitrine}
                  onChange={(e) => setEmailVitrine(e.target.value)}
                  placeholder="contact@compagnie.com (optionnel)"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ============================================================
            SECTION 2 – CEO Account (creation only)
        ============================================================ */}
        {!isEdit && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-gray-600" />
                2. Compte du dirigeant (CEO)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* CEO Name */}
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Nom complet <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={inputClass}
                    value={ceoFullName}
                    onChange={(e) => setCeoFullName(e.target.value)}
                    placeholder="Prénom et nom du CEO"
                    required
                  />
                </div>

                {/* CEO Email */}
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Email du CEO <span className="text-red-500">*</span>
                  </label>
                  <input
                    className={`${inputClass} ${ceoEmailError ? "border-red-400 focus:border-red-500 focus:ring-red-200" : ""}`}
                    type="email"
                    value={ceoEmail}
                    onChange={(e) => setCeoEmail(e.target.value)}
                    placeholder="ceo@compagnie.com"
                    required
                  />
                  {ceoEmailError && (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> {ceoEmailError}
                    </p>
                  )}
                </div>

                {/* CEO Phone */}
                <div>
                  <label className="text-sm font-medium text-gray-700">
                    Téléphone du CEO
                  </label>
                  <input
                    className={inputClass}
                    value={ceoPhone}
                    onChange={(e) => setCeoPhone(e.target.value)}
                    placeholder="Optionnel"
                  />
                </div>
              </div>

              <p className="text-xs text-gray-500 flex items-center gap-1 mt-2">
                <AlertCircle className="h-3 w-3 text-gray-400" />
                Un email d'activation sera envoyé à cette adresse.
              </p>
            </CardContent>
          </Card>
        )}

        {/* ============================================================
            SECTION 3 – Plan & Trial
        ============================================================ */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-gray-600" />
              {isEdit ? "2" : "3"}. Plan & Période d'essai
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Plan selector */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Plan <span className="text-red-500">*</span>
                </label>
                <select
                  className={selectClass}
                  value={selectedPlanId}
                  onChange={(e) => setSelectedPlanId(e.target.value)}
                  required
                >
                  <option value="">— Sélectionner un plan —</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} • {formatCurrency(p.priceMonthly)}/mois
                    </option>
                  ))}
                </select>
              </div>

              {/* Status (when no trial) */}
              {!trialEnabled && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Statut</label>
                  <select
                    className={selectClass}
                    value={status}
                    onChange={(e) => setStatus(e.target.value as "actif" | "inactif")}
                  >
                    <option value="actif">Actif</option>
                    <option value="inactif">Inactif</option>
                  </select>
                </div>
              )}
            </div>

            {/* Trial toggle */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                role="switch"
                aria-checked={trialEnabled}
                onClick={() => setTrialEnabled(!trialEnabled)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
                  trialEnabled ? "bg-[var(--btn-primary,#FF6600)]" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5 ${
                    trialEnabled ? "translate-x-5 ml-0.5" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-sm text-gray-700">
                Activer période d'essai (30 jours)
              </span>
            </div>

            {trialEnabled && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                La compagnie sera automatiquement <strong>active</strong> pendant{" "}
                <strong>
                  {selectedPlan?.trialDurationDays && selectedPlan.trialDurationDays > 0
                    ? `${selectedPlan.trialDurationDays} jours`
                    : "30 jours"}
                </strong>{" "}
                à compter de la création. À l'issue de cette période, une
                action manuelle sera nécessaire.
              </div>
            )}

            {/* Plan details preview */}
            {selectedPlan && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-700">
                    Détails du plan : {selectedPlan.name}
                  </h4>
                  {selectedPlan.isTrial && (
                    <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Essai
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm text-gray-600">
                  <div>
                    Prix : <strong>{formatCurrency(selectedPlan.priceMonthly)}/mois</strong>
                  </div>
                  <div>
                    Frais canal digital :{" "}
                    <strong className="text-[var(--btn-primary,#FF6600)]">
                      {selectedPlan.digitalFeePercent ?? 0}%
                    </strong>
                  </div>
                  <div>
                    Frais guichet :{" "}
                    <strong>{formatCurrency(selectedPlan.feeGuichet ?? 0)}</strong>
                  </div>
                  <div>
                    Max agences :{" "}
                    <strong>
                      {(selectedPlan.maxAgences ?? 0) === 0 ? "Illimité" : selectedPlan.maxAgences}
                    </strong>
                  </div>
                  <div>
                    Quota réservations :{" "}
                    <strong>
                      {(selectedPlan.quotaReservations ?? 0) === 0
                        ? "Illimité"
                        : nf.format(selectedPlan.quotaReservations ?? 0)}
                    </strong>
                  </div>
                  <div>
                    Support :{" "}
                    <strong className="capitalize">{selectedPlan.supportLevel ?? "basic"}</strong>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    <CheckCircle2 className="h-3 w-3" /> Page publique
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    <CheckCircle2 className="h-3 w-3" /> Réservation en ligne
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                    <CheckCircle2 className="h-3 w-3" /> Guichet
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ============================================================
            SECTION 4 – Default System Configuration
        ============================================================ */}
        {!isEdit && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-gray-600" />
                4. Configuration système par défaut
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 space-y-2">
                <p className="font-medium text-gray-700">Thème & Galerie</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    Couleur primaire :{" "}
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-3 w-3 rounded-full border"
                        style={{ backgroundColor: "#FF6600" }}
                      />
                      <code className="text-xs bg-white px-1 rounded">#FF6600</code>
                    </span>
                  </li>
                  <li>
                    Couleur secondaire :{" "}
                    <span className="inline-flex items-center gap-1">
                      <span
                        className="inline-block h-3 w-3 rounded-full border"
                        style={{ backgroundColor: "#FFFFFF" }}
                      />
                      <code className="text-xs bg-white px-1 rounded">#FFFFFF</code>
                    </span>
                  </li>
                  <li>Galerie d'images : vide (à configurer ultérieurement)</li>
                </ul>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 space-y-2">
                <p className="font-medium text-gray-700">Objet Subscription</p>
                <p>Un objet <code className="text-xs bg-white px-1 rounded border">subscription</code> sera créé avec :</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    Statut :{" "}
                    <code className="text-xs bg-white px-1 rounded border">
                      {trialEnabled ? "trial" : "active"}
                    </code>
                  </li>
                  <li>
                    Type :{" "}
                    <code className="text-xs bg-white px-1 rounded border">
                      {trialEnabled ? "trial" : "paid"}
                    </code>
                  </li>
                  <li>
                    Période : {trialEnabled && selectedPlan?.trialDurationDays
                      ? `${selectedPlan.trialDurationDays} jours`
                      : "30 jours"} à compter de la création
                    {trialEnabled && " (essai)"}
                  </li>
                  <li>
                    Frais canal digital :{" "}
                    <strong>{selectedPlan?.digitalFeePercent ?? 0}%</strong> sur les réservations en ligne
                  </li>
                  <li>
                    Niveau de support :{" "}
                    <strong className="capitalize">{selectedPlan?.supportLevel ?? "basic"}</strong>
                  </li>
                  <li>
                    Snapshot du plan : tarification et limites figées au moment de la création
                  </li>
                  <li>
                    Fonctionnalités : toutes incluses (page publique, réservation en ligne, guichet)
                  </li>
                </ul>
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 space-y-2">
                <p className="font-medium text-gray-700">Cycle de paiement</p>
                <p>Les champs de cycle de vie seront préparés :</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>
                    <code className="text-xs bg-white px-1 rounded border">subscriptionStatus</code> :{" "}
                    <code className="text-xs bg-white px-1 rounded border">active</code>
                  </li>
                  <li>
                    <code className="text-xs bg-white px-1 rounded border">nextBillingDate</code> : fin de période
                  </li>
                  <li className="text-gray-400">
                    <code className="text-xs bg-white px-1 rounded border">lastPaymentDate</code>,{" "}
                    <code className="text-xs bg-white px-1 rounded border">graceUntil</code> : à remplir ultérieurement
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ============================================================
            ACTIONS
        ============================================================ */}
        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving
              ? "Enregistrement…"
              : isEdit
                ? "Mettre à jour"
                : "Créer la compagnie"}
          </Button>
          <Link to="/admin/compagnies">
            <Button type="button" variant="secondary">
              Annuler
            </Button>
          </Link>
        </div>
      </form>
    </div>
  );
};

export default AdminCompagnieAjouterPage;
