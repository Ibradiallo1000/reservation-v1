import React from "react";
import { Bus, HeadphonesIcon, MapPin, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CompanyAbout } from "@/types/companyTypes";

interface CompanyAboutSectionProps {
  about?: CompanyAbout | null;
  companyName: string;
  primaryColor: string;
  secondaryColor: string;
}

function hasAnyAbout(about: CompanyAbout | null | undefined): boolean {
  if (!about) return false;
  return Boolean(
    about.description?.trim() ||
    about.yearsExperience != null ||
    about.destinationsCount != null ||
    about.satisfactionRate != null ||
    about.support24h === true
  );
}

const CompanyAboutSection: React.FC<CompanyAboutSectionProps> = ({
  about,
  companyName,
  primaryColor,
  secondaryColor,
}) => {
  const { t } = useTranslation();
  if (!hasAnyAbout(about)) return null;

  const metrics: { value: string; icon: React.ElementType; color: string }[] = [];
  if (about!.yearsExperience != null && about!.yearsExperience > 0) {
    metrics.push({ value: t("aboutYearsExperience", { count: about!.yearsExperience }), icon: Bus, color: primaryColor });
  }
  if (about!.destinationsCount != null && about!.destinationsCount > 0) {
    metrics.push({ value: t("aboutDestinationsCount", { count: about!.destinationsCount }), icon: MapPin, color: secondaryColor });
  }
  if (about!.satisfactionRate != null && about!.satisfactionRate >= 0) {
    metrics.push({ value: t("aboutSatisfactionRate", { rate: about!.satisfactionRate }), icon: Star, color: primaryColor });
  }
  if (about!.support24h === true) {
    metrics.push({ value: t("aboutSupport24h"), icon: HeadphonesIcon, color: secondaryColor });
  }

  return (
    <section className="public-premium-section pb-6 sm:pb-14">
      <div className="public-premium-container">
        <div className="public-premium-card p-4 sm:p-7">
          <div className="mb-3 flex items-center gap-3 sm:mb-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--public-primary-soft)]">
              <Bus size={20} style={{ color: primaryColor }} />
            </div>
            <h2 className="public-premium-heading text-lg sm:text-xl">
              {t("whyChooseCompany", { companyName })}
            </h2>
          </div>

          {metrics.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
              {metrics.map((metric, index) => {
                const Icon = metric.icon;
                return (
                  <div
                    key={index}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--public-line)] bg-[var(--public-surface)] px-3 py-2.5 sm:rounded-2xl sm:px-4 sm:py-3"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                      style={{ color: metric.color, backgroundColor: `color-mix(in srgb, ${metric.color} 12%, white)` }}
                    >
                      <Icon size={18} />
                    </span>
                    <span className="text-sm font-bold leading-snug text-[var(--public-ink)]">
                      {metric.value}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default CompanyAboutSection;
