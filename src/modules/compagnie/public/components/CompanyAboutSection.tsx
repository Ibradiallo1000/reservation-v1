// Section "Pourquoi choisir {company} ?" — accueil, métriques uniquement (confiance)
import React from "react";
import { Bus, MapPin, Star, HeadphonesIcon } from "lucide-react";
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
  const s = about.description?.trim();
  const y = about.yearsExperience;
  const d = about.destinationsCount;
  const r = about.satisfactionRate;
  const h = about.support24h;
  return Boolean(s || (y !== undefined && y !== null) || (d !== undefined && d !== null) || (r !== undefined && r !== null) || h === true);
}

const CompanyAboutSection: React.FC<CompanyAboutSectionProps> = ({
  about,
  companyName,
  primaryColor,
  secondaryColor,
}) => {
  const { t } = useTranslation();

  if (!hasAnyAbout(about)) return null;

  const metrics: { value: string; icon: React.ElementType }[] = [];
  if (about!.yearsExperience != null && about!.yearsExperience > 0) {
    metrics.push({
      value: t("aboutYearsExperience", { count: about!.yearsExperience }),
      icon: Bus,
    });
  }
  if (about!.destinationsCount != null && about!.destinationsCount > 0) {
    metrics.push({
      value: t("aboutDestinationsCount", { count: about!.destinationsCount }),
      icon: MapPin,
    });
  }
  if (about!.satisfactionRate != null && about!.satisfactionRate >= 0) {
    metrics.push({
      value: t("aboutSatisfactionRate", { rate: about!.satisfactionRate }),
      icon: Star,
    });
  }
  if (about!.support24h === true) {
    metrics.push({
      value: t("aboutSupport24h"),
      icon: HeadphonesIcon,
    });
  }

  return (
    <section
      className="py-6 px-4"
      style={{ backgroundColor: `${secondaryColor}08` }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-4">
          <div className="flex justify-center items-center gap-2">
            <Bus size={20} style={{ color: primaryColor }} />
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
              {t("whyChooseCompany", { companyName })}
            </h2>
          </div>
        </div>

        {metrics.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
            {metrics.map((m, i) => {
              const Icon = m.icon;
              return (
                <div
                  key={i}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border min-w-0"
                  style={{
                    borderColor: `${primaryColor}25`,
                    backgroundColor: `${secondaryColor}12`,
                  }}
                >
                  <Icon size={18} style={{ color: secondaryColor }} />
                  <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
                    {m.value}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default CompanyAboutSection;
