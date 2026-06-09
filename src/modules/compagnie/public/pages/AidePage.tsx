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
  const bookingPath = pathBase ? `/${pathBase}/booking` : "/booking";
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
      onClick: () => navigate(bookingPath),
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
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-0">
      <ReservationStepHeader
        onBack={() => navigate(homePath)}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        title={t("helpTitle")}
        logoUrl={company?.logoUrl}
      />

      <main className="max-w-3xl mx-auto p-4 space-y-5 -mt-2">
        <section className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-gray-200 shadow-sm">
          <div className="p-2 rounded-full shrink-0" style={{ backgroundColor: `${primaryColor}18` }}>
            <HelpCircle className="w-6 h-6" style={{ color: primaryColor }} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">
              Besoin d’aide avec {company?.nom || "votre voyage"} ?
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Retrouvez votre billet, vérifiez les étapes de validation ou contactez directement la compagnie.
            </p>
            {support24h && (
              <p className="text-xs font-medium mt-2" style={{ color: primaryColor }}>
                Support indiqué comme disponible 24h/24
              </p>
            )}
          </div>
        </section>

        <section className="grid sm:grid-cols-2 gap-3">
          {quickActions.map(({ label, description, icon: Icon, onClick }) => (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="text-left rounded-2xl bg-white border border-gray-200 p-4 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="p-2 rounded-xl" style={{ backgroundColor: `${primaryColor}12` }}>
                  <Icon className="w-5 h-5" style={{ color: primaryColor }} />
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>
              <h3 className="mt-3 text-sm font-semibold text-gray-900">{label}</h3>
              <p className="mt-1 text-xs text-gray-500">{description}</p>
            </button>
          ))}
        </section>

        <section className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <KeyRound className="w-4 h-4" style={{ color: primaryColor }} />
            <h3 className="text-sm font-semibold text-gray-900">Comment retrouver mon billet ?</h3>
          </div>
          <ol className="p-4 space-y-3 text-sm text-gray-600">
            <li><strong className="text-gray-900">1.</strong> Ouvrez la page « Mes billets ».</li>
            <li><strong className="text-gray-900">2.</strong> Collez le lien privé reçu après votre réservation, ou saisissez son code privé.</li>
            <li><strong className="text-gray-900">3.</strong> Le billet sera ensuite conservé dans le portefeuille de cet appareil.</li>
          </ol>
        </section>

        <section className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
          <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">
            Problèmes fréquents
          </h3>
          <div className="divide-y divide-gray-100">
            {commonProblems.map((problem) => (
              <details key={problem.title} className="group px-4 py-3">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-medium text-gray-900">
                  {problem.title}
                  <ChevronRight className="w-4 h-4 text-gray-400 transition-transform group-open:rotate-90" />
                </summary>
                <p className="pt-2 pr-6 text-sm text-gray-600">{problem.text}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="rounded-2xl bg-white border border-gray-200 overflow-hidden shadow-sm">
          <h3 className="px-4 py-3 text-sm font-semibold text-gray-900 border-b border-gray-100">
            Contacter {company?.nom || "la compagnie"}
          </h3>
          <div className="divide-y divide-gray-100">
            {company?.telephone && (
              <a href={`tel:${company.telephone}`} className="flex items-center gap-3 px-4 py-3 text-sm text-gray-900 hover:bg-gray-50">
                <Phone className="w-5 h-5 text-gray-400" />
                <span className="flex-1">{company.telephone}</span>
                <span className="text-xs font-medium" style={{ color: primaryColor }}>Appeler</span>
              </a>
            )}
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-3 text-sm text-gray-900 hover:bg-gray-50">
                <MessageCircle className="w-5 h-5 text-green-600" />
                <span className="flex-1">WhatsApp</span>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </a>
            )}
            {company?.email && (
              <a href={`mailto:${company.email}`} className="flex items-center gap-3 px-4 py-3 text-sm text-gray-900 hover:bg-gray-50">
                <Mail className="w-5 h-5 text-gray-400" />
                <span className="flex-1 break-all">{company.email}</span>
                <span className="text-xs font-medium" style={{ color: primaryColor }}>Écrire</span>
              </a>
            )}
            {company?.adresse && (
              <div className="flex items-start gap-3 px-4 py-3 text-sm text-gray-700">
                <MapPin className="w-5 h-5 text-gray-400 shrink-0" />
                <span>{company.adresse}</span>
              </div>
            )}
            {company?.horaires && (
              <div className="flex items-start gap-3 px-4 py-3 text-sm text-gray-700">
                <Clock className="w-5 h-5 text-gray-400 shrink-0" />
                <span>{company.horaires}</span>
              </div>
            )}
            {!hasContact && (
              <div className="px-4 py-4 flex items-center gap-3 text-gray-500">
                <MessageCircle className="w-5 h-5" />
                <span className="text-sm">Les coordonnées de contact n’ont pas encore été configurées.</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
