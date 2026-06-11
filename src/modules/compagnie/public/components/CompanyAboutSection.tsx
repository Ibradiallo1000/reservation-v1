import React from "react";
import { Armchair, Clock3, HeadphonesIcon, ShieldCheck } from "lucide-react";
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
  primaryColor,
  secondaryColor,
}) => {
  const { t } = useTranslation();
  if (!hasAnyAbout(about)) return null;

  const advantages = [
    { title: t("security", { defaultValue: "Sécurité" }), text: t("safetyShort"), icon: ShieldCheck, color: primaryColor },
    { title: t("punctuality", { defaultValue: "Ponctualité" }), text: t("punctualityShort"), icon: Clock3, color: secondaryColor },
    { title: t("aboutSupport24h", { defaultValue: "Support 24/7" }), text: t("supportShort"), icon: HeadphonesIcon, color: primaryColor },
    { title: t("comfort", { defaultValue: "Confort" }), text: t("comfortShort"), icon: Armchair, color: secondaryColor },
  ];

  return (
    <section className="public-premium-section">
      <div className="public-premium-container">
        <div className="public-premium-card p-4 sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--public-primary-soft)] sm:h-11 sm:w-11 sm:rounded-2xl">
              <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6" style={{ color: primaryColor }} aria-hidden />
            </span>
            <div className="min-w-0">
              <h2 className="public-premium-heading text-xl sm:text-2xl">
                {t("whyChooseUs")}
              </h2>
              <p className="mt-1 text-xs text-[var(--public-muted)] sm:text-sm">
                {t("whyChooseUsSubtitle")}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {advantages.map((advantage) => {
                const Icon = advantage.icon;
                return (
                  <div
                    key={advantage.title}
                    className="flex min-w-0 items-center gap-2.5 rounded-xl border border-[var(--public-line)] bg-[var(--public-surface)] px-3 py-2.5 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9"
                      style={{ color: advantage.color, backgroundColor: `color-mix(in srgb, ${advantage.color} 12%, white)` }}
                    >
                      <Icon size={18} />
                    </span>
                    <span>
                      <strong className="block text-sm font-extrabold text-[var(--public-ink)]">{advantage.title}</strong>
                      <span className="mt-0.5 hidden text-xs leading-snug text-[var(--public-muted)] sm:block">{advantage.text}</span>
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CompanyAboutSection;
