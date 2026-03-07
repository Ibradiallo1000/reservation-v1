import React from "react";
import { useTranslation } from "react-i18next";

const ORANGE = "#FF6600";
const ORANGE_DARK = "#E55400";

const FinalCTASection: React.FC = () => {
  const { t } = useTranslation();

  const scrollToLead = () => {
    document.getElementById("lead-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className="py-20 md:py-28 text-white" style={{ background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE_DARK})` }}>
      <div className="max-w-[1200px] mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.02em] mb-2 md:mb-3">
          {t("landing.finalCtaTitle")}
        </h2>
        <p className="text-base md:text-lg text-white/80 max-w-xl mx-auto mb-4 md:mb-6">
          {t("landing.finalCtaSubtitle")}
        </p>
        <button
          type="button"
          onClick={scrollToLead}
          className="inline-flex items-center justify-center px-5 py-3 rounded-[10px] font-semibold bg-white text-orange-600 hover:bg-white/95 transition-all duration-300 ease-out hover:-translate-y-0.5 shadow-lg hover:shadow-xl"
        >
          {t("landing.ctaDemo")}
        </button>
      </div>
    </section>
  );
};

export default FinalCTASection;
