// Page dédiée "À propos" — contenu complet depuis company.about
import React from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Bus, MapPin, Star, HeadphonesIcon, ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Company } from "@/types/companyTypes";

interface CompanyAboutPageProps {
  company: Company | null;
}

export default function CompanyAboutPage({ company }: CompanyAboutPageProps) {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const about = company?.about;
  const primaryColor = company?.couleurPrimaire ?? "#3B82F6";
  const secondaryColor = company?.couleurSecondaire ?? "#10B981";

  const hasContent =
    about &&
    (about.description?.trim() ||
      (about.yearsExperience != null && about.yearsExperience > 0) ||
      (about.destinationsCount != null && about.destinationsCount > 0) ||
      (about.satisfactionRate != null && about.satisfactionRate >= 0) ||
      about.support24h === true);

  const metrics: { value: string; icon: React.ElementType }[] = [];
  if (about?.yearsExperience != null && about.yearsExperience > 0) {
    metrics.push({
      value: t("aboutYearsExperience", { count: about.yearsExperience }),
      icon: Bus,
    });
  }
  if (about?.destinationsCount != null && about.destinationsCount > 0) {
    metrics.push({
      value: t("aboutDestinationsCount", { count: about.destinationsCount }),
      icon: MapPin,
    });
  }
  if (about?.satisfactionRate != null && about.satisfactionRate >= 0) {
    metrics.push({
      value: t("aboutSatisfactionRate", { rate: about.satisfactionRate }),
      icon: Star,
    });
  }
  if (about?.support24h === true) {
    metrics.push({
      value: t("aboutSupport24h"),
      icon: HeadphonesIcon,
    });
  }

  return (
    <div className="min-h-screen pb-24 md:pb-0" style={{ backgroundColor: `${secondaryColor}08` }}>
      <header className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur" style={{ borderColor: `${primaryColor}15` }}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(slug ? `/${slug}` : "/")}
            className="p-2 rounded-lg hover:opacity-80 transition"
            style={{ color: primaryColor }}
            aria-label={t("backToHome")}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight text-gray-900">
            {t("aboutCompanyTitle")}
          </h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-8 pb-10">
        {!hasContent ? (
          <p className="text-center text-gray-600 py-8">
            {t("defaultAbout")}
          </p>
        ) : (
          <div className="space-y-8">
            <div className="text-center">
              <div className="flex justify-center items-center gap-2 mb-4">
                <Bus size={24} style={{ color: primaryColor }} />
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                  {t("aboutCompanyTitle")}
                </h2>
              </div>

              {about?.description?.trim() && (
                <p className="text-gray-700 text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
                  {about.description.trim()}
                </p>
              )}
            </div>

            {metrics.length > 0 && (
              <>
                <div
                  className="h-px w-full max-w-xs mx-auto"
                  style={{ backgroundColor: `${primaryColor}25` }}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {metrics.map((m, i) => {
                    const Icon = m.icon;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-4 rounded-xl border"
                        style={{
                          borderColor: `${primaryColor}25`,
                          backgroundColor: `${secondaryColor}12`,
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${primaryColor}18` }}
                        >
                          <Icon size={20} style={{ color: secondaryColor }} />
                        </div>
                        <span className="text-sm font-medium text-gray-800">
                          {m.value}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div
              className="h-px w-full max-w-xs mx-auto"
              style={{ backgroundColor: `${primaryColor}25` }}
            />
            <div className="text-center">
              <button
                type="button"
                onClick={() => navigate(slug ? `/${slug}` : "/")}
                className="min-h-[48px] px-6 py-3 rounded-xl text-sm font-semibold transition"
                style={{
                  color: "white",
                  backgroundColor: primaryColor,
                }}
              >
                {t("backToHome")}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
