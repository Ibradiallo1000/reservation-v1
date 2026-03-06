import React from "react";
import { useTranslation } from "react-i18next";

const FloatingDemoButton: React.FC = () => {
  const { t } = useTranslation();

  const scrollToLead = () => {
    document.getElementById("lead-form")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 md:bottom-8 md:right-8">
      <button
        type="button"
        onClick={scrollToLead}
        className="px-[22px] py-3.5 rounded-[10px] font-semibold text-white bg-orange-500 hover:bg-orange-600 shadow-lg hover:shadow-xl transition-all"
        aria-label={t("landing.floatingDemo")}
      >
        {t("landing.floatingDemo")}
      </button>
    </div>
  );
};

export default FloatingDemoButton;
