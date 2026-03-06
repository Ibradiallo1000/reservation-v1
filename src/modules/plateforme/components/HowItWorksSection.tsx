/**
 * Section "Comment TELIYA fonctionne" — 3 cartes horizontales (icône à gauche), sans numéros.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { Settings, Users, Play } from "lucide-react";

const SECTION_PADDING = "py-6 md:py-12";

const steps = [
  { key: "1", icon: Settings },
  { key: "2", icon: Users },
  { key: "3", icon: Play },
];

const HowItWorksSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section id="comment-ca-marche" className={`${SECTION_PADDING} bg-white dark:bg-slate-900`}>
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.02em] text-gray-900 dark:text-white text-center mb-2 md:mb-3">
          {t("landing.howItWorksTitle")}
        </h2>
        <p className="text-base text-[#6b7280] dark:text-slate-400 text-center max-w-2xl mx-auto mb-4 md:mb-6">
          {t("landing.howItWorksSubtitle")}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
          {steps.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="flex items-start gap-3 p-4 md:p-5 rounded-[14px] md:rounded-[18px] border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-200 ease-out hover:-translate-y-[3px] hover:shadow-[0_18px_40px_rgba(0,0,0,0.08)] dark:hover:shadow-xl"
              style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}
            >
              <span className="w-8 h-8 md:w-9 md:h-9 shrink-0 rounded-[10px] bg-[rgba(255,115,0,0.1)] dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h3 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">
                  {t(`landing.howItWorksStep${key}Title`)}
                </h3>
                <p className="text-base text-gray-600 dark:text-slate-400 leading-relaxed">
                  {t(`landing.howItWorksStep${key}Desc`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
