/**
 * Marketing hero for TELIYA landing: banner image from settings, overlay, CTAs (demo + how it works).
 * No search form; used on main domain "/" only.
 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const ORANGE = "#FF6600";
const ORANGE_DARK = "#E55400";
const LEAD_FORM_ID = "lead-form";
const HOW_IT_WORKS_ID = "comment-ca-marche";
const OVERLAY = "linear-gradient(rgba(0,0,0,0.6), rgba(0,0,0,0.6))";

function scrollToLeadForm() {
  document.getElementById(LEAD_FORM_ID)?.scrollIntoView({ behavior: "smooth" });
}

function scrollToHowItWorks() {
  document.getElementById(HOW_IT_WORKS_ID)?.scrollIntoView({ behavior: "smooth" });
}

const HeroSection: React.FC = () => {
  const { t } = useTranslation();
  const [bannerImage, setBannerImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "platform", "settings"))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as { banniereUrl?: string; hero?: { bannerImage?: string } };
        const url =
          data?.hero?.bannerImage?.trim() ||
          data?.banniereUrl?.trim() ||
          null;
        if (url) setBannerImage(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const backgroundImage = bannerImage
    ? `${OVERLAY}, url(${bannerImage})`
    : `${OVERLAY}, url(/images/hero-bus.jpg), linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 100%)`;

  return (
    <section
      id="hero"
      className="relative overflow-hidden text-white min-h-[60vh] md:min-h-[70vh] flex flex-col justify-center dark:bg-slate-950"
      style={{
        backgroundImage,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="relative z-10 max-w-[1200px] mx-auto px-6 py-[40px] md:py-[70px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div className="text-center lg:text-left">
            <h1 className="text-2xl sm:text-3xl md:text-[32px] font-bold tracking-[-0.02em] drop-shadow-[0_2px_8px_rgba(0,0,0,.5)]">
              {t("landing.heroTitle")}
            </h1>
            <p className="mt-3 md:mt-4 text-base md:text-lg text-white/90 max-w-xl mx-auto lg:mx-0">
              {t("landing.heroSubtitle")}
            </p>
            <div className="mt-[18px] md:mt-8 pb-8 md:pb-0 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 md:gap-4">
              <button
                type="button"
                onClick={scrollToLeadForm}
                className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-[10px] font-semibold text-white transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 shadow-lg hover:shadow-xl text-sm md:text-base"
                style={{ background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE_DARK})` }}
              >
                {t("landing.ctaDemo")}
              </button>
              <button
                type="button"
                onClick={scrollToHowItWorks}
                className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3 rounded-[10px] font-semibold bg-white/15 backdrop-blur border border-white/30 text-white hover:bg-white/25 transition-all duration-200 hover:-translate-y-0.5 text-sm md:text-base"
              >
                {t("landing.ctaHowItWorks")}
              </button>
            </div>
          </div>
          <div className="hidden lg:flex flex-1 justify-center items-center">
            <div
              className="w-full max-w-md aspect-video rounded-[18px] border border-white/20 bg-white/5 backdrop-blur-sm overflow-hidden"
              style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}
            >
              <img
                src={bannerImage || "/images/hero-bus.jpg"}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
