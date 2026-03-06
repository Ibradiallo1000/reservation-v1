import React from "react";
import { useTranslation } from "react-i18next";
import { Bus, Building2, Activity, Zap } from "lucide-react";

const SECTION_PADDING = "py-[40px] md:py-[70px]";
const cards = [
  { key: "1", icon: Bus },
  { key: "2", icon: Building2 },
  { key: "3", icon: Activity },
  { key: "4", icon: Zap },
];

const TrustSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section className={SECTION_PADDING + " bg-[#f9fafb] dark:bg-slate-800/50"}>
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-[32px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white text-center mb-3">
          {t("landing.trustTitle")}
        </h2>
        <p className="text-base text-[#6b7280] dark:text-slate-400 text-center max-w-2xl mx-auto mb-8 md:mb-10">
          {t("landing.trustSubtitle")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
          {cards.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="flex items-start gap-3 p-3.5 md:p-5 rounded-[14px] md:rounded-[18px] border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-200 ease-out hover:-translate-y-[3px] hover:shadow-[0_18px_40px_rgba(0,0,0,0.08)] dark:hover:shadow-xl"
              style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}
            >
              <span className="w-8 h-8 shrink-0 rounded-[10px] bg-[rgba(255,115,0,0.1)] dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  {t("landing.whyCard" + key + "Title")}
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">
                  {t("landing.whyCard" + key + "Desc")}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustSection;
