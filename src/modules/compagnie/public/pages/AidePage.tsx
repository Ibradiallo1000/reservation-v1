import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Bus,
  ChevronRight,
  Clock,
  HelpCircle,
  KeyRound,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Ticket,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Company } from "@/types/companyTypes";
import ReservationStepHeader from "../components/ReservationStepHeader";
import { getPublicPathBase } from "../utils/subdomain";

interface AidePageProps {
  company?: Company | null;
}

function whatsappHref(value?: string): string | null {
  const configured = value?.trim();
  if (!configured) return null;
  if (/^https?:\/\//i.test(configured)) return configured;
  const digits = configured.replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : null;
}

export default function AidePage({ company }: AidePageProps) {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const primaryColor = company?.couleurPrimaire ?? "#ea580c";
  const secondaryColor = company?.couleurSecondaire ?? "#fdba74";
  const pathBase = getPublicPathBase(slug ?? company?.slug ?? "");
  const homePath = pathBase ? `/${pathBase}` : "/";
  const ticketsPath = pathBase ? `/${pathBase}/mes-billets` : "/mes-billets";
  const whatsapp = whatsappHref(company?.socialMedia?.whatsapp);
  const support24h = company?.about?.support24h === true;
  const hasContact = !!(company?.telephone || company?.email || whatsapp || company?.adresse || company?.horaires);

  const quickActions = [
    {
      label: "Voir mes billets",
      description: "Retrouvez les billets enregistrés sur cet appareil.",
      icon: Ticket,
      onClick: () => navigate(ticketsPath),
    },
    {
      label: "Faire une réservation",
      description: "Consultez les départs disponibles.",
      icon: Bus,
      onClick: () => navigate(homePath),
    },
  ];

  const commonProblems = [
    {
      title: "Je ne retrouve pas mon billet",
      text: "Ouvrez « Mes billets », puis collez le lien privé reçu après la réservation ou saisissez son code privé.",
    },
    {
      title: "Mon paiement est en attente",
      text: "Après l’envoi de la preuve, la compagnie doit vérifier le paiement. Le billet apparaît dès sa validation.",
    },
    {
      title: "Ma preuve de paiement a été refusée",
      text: "Vérifiez le montant, la lisibilité de la preuve et contactez directement la compagnie.",
    },
    {
      title: "Je souhaite modifier ou annuler mon voyage",
      text: "Une modification ou une annulation doit être traitée directement par la compagnie.",
    },
    {
      title: "Le QR code ne s’affiche pas",
      text: "Le QR code est disponible lorsque le paiement et le billet ont été validés.",
    },
  ];

  return (
    <div
      className="min-h-screen pb-24 md:pb-0"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${primaryColor} 6%, white) 0%, color-mix(in srgb, ${primaryColor} 2%, white) 22rem)`,
      }}
    >
      <ReservationStepHeader
        onBack={() => navigate(homePath)}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        title={t("helpTitle")}
        logoUrl={company?.logoUrl}
      />

      <main className="mx-auto max-w-3xl space-y-4 p-3 sm:space-y-5 sm:p-5">
        <section
          className="overflow-hidden rounded-3xl border bg-white p-5 shadow-[0_14px_35px_rgba(15,23,42,0.08)] sm:p-6"
          style={{ borderColor: `color-mix(in srgb, ${primaryColor} 18%, transparent)` }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
              style={{
                color: primaryColor,
                background: `linear-gradient(135deg, color-mix(in srgb, ${primaryColor} 16%, white), color-mix(in srgb, ${secondaryColor} 14%, white))`,
              }}
            >
              <HelpCircle className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: primaryColor }}>
                Centre d’aide
              </p>
              <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
                Besoin d’aide avec {company?.nom || "votre voyage"} ?
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Retrouvez votre billet, vérifiez les étapes de validation ou contactez directement la compagnie.
              </p>
              {support24h && (
                <p
                  className="mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ color: primaryColor, backgroundColor: `${primaryColor}12` }}
                >
                  Support indiqué comme disponible 24h/24
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          {quickActions.map(({ label, description, icon: Icon, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="group min-w-0 rounded-2xl border bg-white p-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md sm:p-4"
              style={{ borderColor: `${primaryColor}20` }}
            >
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${primaryColor}12` }}>
                    <Icon className="h-[18px] w-[18px]" style={{ color: primaryColor }} />
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5" />
                </div>
                <h2 className="mt-3 text-sm font-bold leading-tight text-slate-900">{label}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
              </div>
            </button>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${primaryColor}12` }}>
              <KeyRound className="h-[18px] w-[18px]" style={{ color: primaryColor }} />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-500">Guide rapide</p>
              <h2 className="text-sm font-bold text-slate-900">Comment retrouver mon billet ?</h2>
            </div>
          </div>
          <ol className="space-y-3 p-4 text-sm text-slate-600 sm:p-5">
            {[
              "Ouvrez la page « Mes billets ».",
              "Collez le lien privé reçu après votre réservation, ou saisissez son code privé.",
              "Le billet sera ensuite conservé dans le portefeuille de cet appareil.",
            ].map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold"
                  style={{ color: primaryColor, backgroundColor: `${primaryColor}12` }}
                >
                  {index + 1}
                </span>
                <span className="leading-6">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${secondaryColor}18` }}>
              <MessageCircle className="h-[18px] w-[18px]" style={{ color: secondaryColor }} />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-500">Questions fréquentes</p>
              <h2 className="text-sm font-bold text-slate-900">Problèmes fréquents</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {commonProblems.map((problem) => (
              <details key={problem.title} className="group px-4 py-3.5 sm:px-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900">
                  {problem.title}
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90" />
                </summary>
                <p className="pt-2 pr-6 text-sm leading-6 text-slate-600">{problem.text}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${primaryColor}12` }}>
              <Phone className="h-[18px] w-[18px]" style={{ color: primaryColor }} />
            </span>
            <div>
              <p className="text-xs font-semibold text-slate-500">Assistance directe</p>
              <h2 className="text-sm font-bold text-slate-900">Contacter {company?.nom || "la compagnie"}</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {company?.telephone && (
              <a href={`tel:${company.telephone}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm text-slate-900 transition hover:bg-slate-50 sm:px-5">
                <Phone className="h-5 w-5 shrink-0" style={{ color: primaryColor }} />
                <span className="flex-1">{company.telephone}</span>
                <span className="text-xs font-medium" style={{ color: primaryColor }}>Appeler</span>
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm text-slate-900 transition hover:bg-slate-50 sm:px-5">
                <MessageCircle className="h-5 w-5 shrink-0" style={{ color: primaryColor }} />
                <span className="flex-1">WhatsApp</span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </a>
            )}
            {company?.email && (
              <a href={`mailto:${company.email}`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm text-slate-900 transition hover:bg-slate-50 sm:px-5">
                <Mail className="h-5 w-5 shrink-0" style={{ color: primaryColor }} />
                <span className="flex-1 break-all">{company.email}</span>
                <span className="text-xs font-medium" style={{ color: primaryColor }}>Écrire</span>
              </a>
            )}
            {company?.adresse && (
              <div className="flex min-h-14 items-start gap-3 px-4 py-3 text-sm text-slate-700 sm:px-5">
                <MapPin className="h-5 w-5 shrink-0" style={{ color: primaryColor }} />
                <span>{company.adresse}</span>
              </div>
            )}
            {company?.horaires && (
              <div className="flex min-h-14 items-start gap-3 px-4 py-3 text-sm text-slate-700 sm:px-5">
                <Clock className="h-5 w-5 shrink-0" style={{ color: primaryColor }} />
                <span>{company.horaires}</span>
              </div>
            )}
            {!hasContact && (
              <div className="flex items-center gap-3 px-4 py-4 text-slate-500 sm:px-5">
                <MessageCircle className="h-5 w-5" />
                <span className="text-sm">Les coordonnées de contact n’ont pas encore été configurées.</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
