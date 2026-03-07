/**
 * Section "TELIYA en chiffres" — 3 cartes compactes (icône, nombre, libellé).
 */
import React, { useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, useInView } from "framer-motion";
import { usePlatformStats } from "../hooks/usePlatformStats";
import { Building2, MapPin, CalendarCheck } from "lucide-react";

const blocks = [
  {
    key: "companies",
    icon: Building2,
    labelKeyOne: "landing.statsCompany",
    labelKeyMany: "landing.statsCompanies",
    getValue: (s: { companies: number }) => s.companies,
  },
  {
    key: "agencies",
    icon: MapPin,
    labelKeyOne: "landing.statsAgency",
    labelKeyMany: "landing.statsAgencies",
    getValue: (s: { agencies: number }) => s.agencies,
  },
  {
    key: "reservations",
    icon: CalendarCheck,
    labelKeyOne: "landing.statsReservation",
    labelKeyMany: "landing.statsReservations",
    getValue: (s: { reservations: number }) => s.reservations,
  },
];

const PlatformStatsSection: React.FC = () => {
  const { t } = useTranslation();
  const stats = usePlatformStats();
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const showLowStatsMessage =
    !stats.loading && stats.companies === 0 && stats.agencies === 0 && stats.reservations === 0;

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 40 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="py-20 md:py-28 bg-white dark:bg-slate-900 border-t border-b border-gray-200 dark:border-slate-700"
    >
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.02em] text-gray-900 dark:text-white text-center mb-2 md:mb-3">
          {t("landing.statsTitle")}
        </h2>
        {stats.error && (
          <p className="text-center text-sm text-amber-600 dark:text-amber-400 mb-3 md:mb-4">
            {stats.error}
          </p>
        )}
        {showLowStatsMessage && (
          <p className="text-base text-[#6b7280] dark:text-slate-400 text-center mb-4 md:mb-6">
            {t("landing.statsLowMessage")}
          </p>
        )}
        <div className="grid grid-cols-3 gap-3 mt-4 md:mt-6">
          {blocks.map(({ key: blockKey, icon: Icon, labelKeyOne, labelKeyMany, getValue }) => {
            const value = getValue(stats);
            const label = value <= 1 ? t(labelKeyOne) : t(labelKeyMany);
            return (
              <div
                key={blockKey}
                className="flex flex-col items-center justify-center text-center p-3.5 rounded-[14px] border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg dark:hover:shadow-xl"
                style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}
              >
                <span className="w-7 h-7 md:w-8 md:h-8 rounded-[8px] bg-[rgba(255,115,0,0.1)] dark:bg-orange-500/20 flex items-center justify-center mb-2 text-orange-600 dark:text-orange-400">
                  <Icon className="h-3.5 w-3.5 md:h-4 md:w-4" />
                </span>
                <span className="text-[26px] font-bold text-gray-900 dark:text-white tabular-nums leading-none">
                  {stats.loading ? "—" : value}
                </span>
                <span className="mt-1 text-xs md:text-sm text-gray-600 dark:text-slate-400 font-medium leading-tight">
                  {label}
                </span>
            </div>
          );
        })}
        </div>
      </div>
    </motion.section>
  );
};

export default PlatformStatsSection;
