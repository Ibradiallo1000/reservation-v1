import React from "react";
import { useTranslation } from "react-i18next";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Database, ClipboardList, BarChart3 } from "lucide-react";

const SECTION_PADDING = "py-20 md:py-28";
const items = [
  { key: "1", icon: Database },
  { key: "2", icon: ClipboardList },
  { key: "3", icon: BarChart3 },
];

const ProblemSection: React.FC = () => {
  const { t } = useTranslation();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`${SECTION_PADDING} bg-white dark:bg-slate-900`}
    >
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.02em] text-gray-900 dark:text-white text-center mb-2 md:mb-3">
          {t("landing.problemTitle")}
        </h2>
        <p className="text-base text-[#6b7280] dark:text-slate-400 text-center max-w-2xl mx-auto mb-4 md:mb-6">
          {t("landing.problemSubtitle")}
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-6">
          {items.map(({ key, icon: Icon }) => (
            <li
              key={key}
              className="flex items-start gap-3 p-4 md:p-5 rounded-[14px] md:rounded-[18px] border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-xl"
              style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}
            >
              <span className="w-9 h-9 md:w-10 md:h-10 shrink-0 rounded-[10px] bg-[rgba(255,115,0,0.1)] dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                <Icon className="h-4 w-4 md:h-5 md:w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white mb-1">
                  {t("landing.problem" + key + "Title")}
                </h3>
                <p className="text-base text-gray-600 dark:text-slate-400 leading-relaxed">
                  {t("landing.problem" + key + "Desc")}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </motion.section>
  );
};

export default ProblemSection;
