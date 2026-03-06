/**
 * Section "Une solution pensée pour le transport" — cartes avec icône à gauche.
 */
import React from "react";
import { useTranslation } from "react-i18next";
import { LayoutDashboard, Radio, Rocket } from "lucide-react";

const SECTION_PADDING = "py-[40px] md:py-[70px]";

const items = [
  { key: "1", icon: LayoutDashboard },
  { key: "2", icon: Radio },
  { key: "3", icon: Rocket },
];

const SolutionSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section className={`${SECTION_PADDING} bg-[#f9fafb] dark:bg-slate-800/50`}>
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-[32px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white text-center mb-3">
          {t("landing.solutionTitle")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6 mt-6 md:mt-8">
          {items.map(({ key, icon: Icon }) => (
            <div
              key={key}
              className="flex items-start gap-3 p-5 rounded-[18px] border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-200 ease-out hover:-translate-y-[3px] hover:shadow-[0_18px_40px_rgba(0,0,0,0.08)] dark:hover:shadow-xl"
              style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}
            >
              <span className="w-10 h-10 shrink-0 rounded-[10px] bg-[rgba(255,115,0,0.1)] dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  {t(`landing.solution${key}Title`)}
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">
                  {t(`landing.solution${key}Desc`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default SolutionSection;
