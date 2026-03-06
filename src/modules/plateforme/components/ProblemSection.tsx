import React from "react";
import { useTranslation } from "react-i18next";
import { Database, ClipboardList, BarChart3 } from "lucide-react";

const SECTION_PADDING = "py-[40px] md:py-[70px]";
const items = [
  { key: "1", icon: Database },
  { key: "2", icon: ClipboardList },
  { key: "3", icon: BarChart3 },
];

const ProblemSection: React.FC = () => {
  const { t } = useTranslation();
  return (
    <section className={`${SECTION_PADDING} bg-white dark:bg-slate-900`}>
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-[32px] font-bold tracking-[-0.02em] text-gray-900 dark:text-white text-center mb-3">
          {t("landing.problemTitle")}
        </h2>
        <p className="text-base text-[#6b7280] dark:text-slate-400 text-center max-w-2xl mx-auto mb-8 md:mb-10">
          {t("landing.problemSubtitle")}
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
          {items.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="flex items-start gap-3 p-5 rounded-[18px] border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-200 ease-out hover:-translate-y-[3px] hover:shadow-[0_18px_40px_rgba(0,0,0,0.08)] dark:hover:shadow-xl"
              style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}
            >
              <span className="w-10 h-10 shrink-0 rounded-[10px] bg-[rgba(255,115,0,0.1)] dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  {t("landing.problem" + key + "Title")}
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 leading-relaxed">
                  {t("landing.problem" + key + "Desc")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

export default ProblemSection;
