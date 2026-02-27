// Page Aide du module public — contenu minimal, à enrichir (FAQ, contact, etc.)
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, HelpCircle, Phone, Mail, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AidePageProps {
  company?: { nom?: string; telephone?: string; email?: string; couleurPrimaire?: string };
}

export default function AidePage({ company }: AidePageProps) {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const primary = company?.couleurPrimaire ?? "#ea580c";

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-0">
      <header
        className="sticky top-0 z-10 border-b bg-white"
        style={{ borderColor: "#e5e7eb" }}
      >
        <div className="max-w-3xl mx-auto px-3 py-3 flex items-center gap-2">
          <button
            onClick={() => navigate(slug ? `/${slug}` : "/")}
            className="p-2 rounded-lg hover:bg-gray-100"
            aria-label={t("backToHome")}
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="font-semibold text-gray-900">{t("helpTitle")}</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-3 p-4 rounded-xl bg-white border border-gray-200">
          <div
            className="p-2 rounded-full"
            style={{ backgroundColor: `${primary}20` }}
          >
            <HelpCircle className="w-6 h-6" style={{ color: primary }} />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">
              {t("helpSubtitle", { companyName: company?.nom ?? t("ourCompany") })}
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              {t("helpComingSoon")}
            </p>
          </div>
        </div>

        <section className="rounded-xl bg-white border border-gray-200 overflow-hidden">
          <h3 className="px-4 py-3 text-sm font-medium text-gray-500 border-b border-gray-100">
            {t("contact")}
          </h3>
          <div className="divide-y divide-gray-100">
            {company?.telephone && (
              <a
                href={`tel:${company.telephone}`}
                className="flex items-center gap-3 px-4 py-3 text-gray-900 hover:bg-gray-50"
              >
                <Phone className="w-5 h-5 text-gray-400" />
                <span>{company.telephone}</span>
              </a>
            )}
            {company?.email && (
              <a
                href={`mailto:${company.email}`}
                className="flex items-center gap-3 px-4 py-3 text-gray-900 hover:bg-gray-50"
              >
                <Mail className="w-5 h-5 text-gray-400" />
                <span>{company.email}</span>
              </a>
            )}
            {!company?.telephone && !company?.email && (
              <div className="px-4 py-3 flex items-center gap-3 text-gray-500">
                <MessageCircle className="w-5 h-5" />
                <span className="text-sm">{t("contactToConfigure")}</span>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
