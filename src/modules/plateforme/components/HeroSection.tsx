/**
 * Marketing hero for TELIYA landing: strong typography, CTAs, trust indicators, optional banner image.
 * B2B SaaS-style hero with two-column layout on desktop, stacked centered on mobile.
 */
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { doc, getDoc } from "firebase/firestore";
import { Building2, Globe, Ticket, BarChart3 } from "lucide-react";
import { db } from "@/firebaseConfig";

const ORANGE = "#FF6600";
const ORANGE_DARK = "#E55400";
const LEAD_FORM_ID = "lead-form";
const HOW_IT_WORKS_ID = "comment-ca-marche";
const OVERLAY =
  "linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.5) 50%, rgba(15,15,15,0.85) 100%)";

function scrollToLeadForm() {
  document.getElementById(LEAD_FORM_ID)?.scrollIntoView({ behavior: "smooth" });
}

function scrollToHowItWorks() {
  document.getElementById(HOW_IT_WORKS_ID)?.scrollIntoView({ behavior: "smooth" });
}

const HERO_CACHE_KEY = "teliya:heroBannerUrl";

const TRUST_ITEMS = [
  { key: "1", icon: Building2 },
  { key: "2", icon: Globe },
  { key: "3", icon: Ticket },
  { key: "4", icon: BarChart3 },
];

const HeroSection: React.FC = () => {
  const { t } = useTranslation();
  const [bannerImage, setBannerImage] = useState<string | null>(() => {
    try {
      return localStorage.getItem(HERO_CACHE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "platform", "settings"))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data() as { banniereUrl?: string; hero?: { bannerImage?: string } };
        const url =
          data?.hero?.bannerImage?.trim() || data?.banniereUrl?.trim() || null;
        if (url) {
          setBannerImage(url);
          try {
            localStorage.setItem(HERO_CACHE_KEY, url);
          } catch {}
        } else {
          try {
            localStorage.removeItem(HERO_CACHE_KEY);
          } catch {}
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const backgroundImage = bannerImage
    ? `${OVERLAY}, url(${bannerImage})`
    : `${OVERLAY}, url(/images/hero-bus.jpg), linear-gradient(180deg, #0c0c0c 0%, #1a1a1a 50%, #141414 100%)`;

  return (
    <section
      id="hero"
      className="relative overflow-hidden text-white min-h-[70vh] md:min-h-[75vh] flex flex-col justify-center dark:bg-slate-950"
      style={{
        backgroundImage,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="relative z-10 max-w-[1200px] mx-auto px-6 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left: title, subtitle, CTAs — centered on mobile, left on desktop */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-[-0.02em] drop-shadow-[0_2px_12px_rgba(0,0,0,0.4)] leading-tight">
              {t("landing.heroTitle")}
            </h1>
            <p className="mt-4 md:mt-5 text-lg md:text-xl text-white/90 max-w-2xl leading-relaxed">
              {t("landing.heroSubtitle")}
            </p>
            <div className="mt-6 md:mt-8 flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3 md:gap-4 w-full sm:w-auto">
              <button
                type="button"
                onClick={scrollToLeadForm}
                className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-[10px] font-semibold text-white transition-all duration-300 ease-out hover:brightness-110 hover:-translate-y-0.5 shadow-lg hover:shadow-xl text-base"
                style={{ background: `linear-gradient(90deg, ${ORANGE}, ${ORANGE_DARK})` }}
              >
                {t("landing.ctaDemo")}
              </button>
              <button
                type="button"
                onClick={scrollToHowItWorks}
                className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-[10px] font-semibold bg-white/15 backdrop-blur-sm border border-white/30 text-white hover:bg-white/25 transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg text-base"
              >
                {t("landing.ctaHowItWorks")}
              </button>
            </div>
          </div>

          {/* Right: dashboard / hero image — desktop only, SaaS-style with floating effect */}
          <div className="hidden lg:flex flex-1 justify-center items-center">
            <motion.div
              className="w-full max-w-md"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="w-full aspect-video rounded-xl shadow-2xl ring-1 ring-black/10 dark:ring-white/10 bg-white/5 backdrop-blur-sm overflow-hidden transition-all duration-300 ease-out hover:scale-[1.02] hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.4)]">
                <img
                  src={bannerImage || "/images/hero-bus.jpg"}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          </div>
        </div>

        {/* Trust indicators — subtle row below hero content */}
        <div className="mt-8 md:mt-10 pt-5 md:pt-6 border-t border-white/10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {TRUST_ITEMS.map(({ key, icon: Icon }) => (
              <div
                key={key}
                className="flex items-center gap-2.5 text-white/70"
              >
                <span className="w-8 h-8 rounded-lg bg-white/5 ring-1 ring-white/10 flex items-center justify-center text-white/80 shrink-0">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-medium">
                  {t(`landing.heroTrust${key}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
