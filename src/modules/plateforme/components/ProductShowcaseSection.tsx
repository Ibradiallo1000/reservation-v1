import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  LayoutDashboard,
  Building2,
  Ticket,
  Globe,
  ClipboardCheck,
  Package,
  Truck,
  Calculator,
  type LucideIcon,
} from "lucide-react";
import { DEFAULT_PRODUCT_PRESENTATION, type ProductPresentationModule } from "../types/productPresentation";

const MODULE_ICONS: Record<string, LucideIcon> = {
  direction: LayoutDashboard,
  agences: Building2,
  guichet: Ticket,
  "reservation-en-ligne": Globe,
  embarquement: ClipboardCheck,
  courrier: Package,
  flotte: Truck,
  comptabilite: Calculator,
};

const ProductShowcaseSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [modules, setModules] = useState<ProductPresentationModule[]>(DEFAULT_PRODUCT_PRESENTATION);
  const isEn = (i18n.language || "fr").toLowerCase().startsWith("en");

  useEffect(() => {
    let c = false;
    getDoc(doc(db, "platform", "settings")).then((snap) => {
      if (c || !snap.exists()) return;
      const d = snap.data() as { productPresentation?: ProductPresentationModule[] };
      if (Array.isArray(d?.productPresentation) && d.productPresentation.length > 0) {
        const sorted = [...d.productPresentation].filter((m) => m?.enabled !== false).sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
        if (sorted.length) setModules(sorted);
      }
    }).catch(() => {});
    return () => { c = true; };
  }, []);

  const getModuleTitle = (mod: ProductPresentationModule) => {
    if (isEn && mod.titleEn?.trim()) return mod.titleEn.trim();
    return t(`landing.showcase.${mod.id}.title`, { defaultValue: mod.title });
  };
  const getModuleDescription = (mod: ProductPresentationModule) => {
    if (isEn && mod.descriptionEn?.trim()) return mod.descriptionEn.trim();
    return t(`landing.showcase.${mod.id}.description`, { defaultValue: mod.description });
  };
  const getModuleFeatures = (mod: ProductPresentationModule): string[] => {
    if (isEn && mod.featuresEn?.length) return mod.featuresEn;
    const fromI18n = [1, 2, 3, 4]
      .map((i) => t(`landing.showcase.${mod.id}.feature${i}`, { defaultValue: "" }))
      .filter(Boolean);
    if (fromI18n.length > 0) return fromI18n;
    return mod.features ?? [];
  };

  return (
    <section className="py-6 md:py-12 bg-[#f9fafb] dark:bg-slate-800/50">
      <div className="max-w-[1200px] mx-auto px-6">
        <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.02em] text-gray-900 dark:text-white mb-2 md:mb-3 text-center md:text-left">
          {t("landing.showcase.sectionTitle")}
        </h2>
        <p className="text-base text-[#6b7280] dark:text-slate-400 max-w-2xl mb-4 md:mb-6 text-center md:text-left">
          {t("landing.showcase.sectionSubtitle", { defaultValue: "TELIYA centralise l'ensemble de votre réseau de transport." })}
        </p>
        {modules.map((mod, idx) => {
          const features = getModuleFeatures(mod);
          const Icon = MODULE_ICONS[mod.id];
          return (
            <div key={mod.id} className={"flex flex-col gap-4 md:gap-6 py-6 md:py-10 " + (idx > 0 ? "border-t border-gray-200 dark:border-slate-700" : "")}>
              <div className={"grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 items-center " + (idx % 2 === 1 ? "" : "")}>
                <div className={idx % 2 === 1 ? "lg:order-2" : ""}>
                  <div className="flex items-start gap-3 mb-2 md:mb-3">
                    {Icon && (
                      <span className="w-9 h-9 md:w-10 md:h-10 shrink-0 rounded-[10px] bg-[rgba(255,115,0,0.1)] dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400">
                        <Icon className="h-4 w-4 md:h-5 md:w-5" />
                      </span>
                    )}
                    <h3 className="text-xl md:text-2xl font-semibold text-gray-900 dark:text-white pt-0.5">{getModuleTitle(mod)}</h3>
                  </div>
                  <p className="text-base text-gray-600 dark:text-slate-400 mb-3 md:mb-4">{getModuleDescription(mod)}</p>
                  {features.length > 0 && (
                    <ul className="space-y-1.5 md:space-y-2">
                      {features.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 text-base text-gray-700 dark:text-slate-300">
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className={idx % 2 === 1 ? "lg:order-1" : ""}>
                  <div className="rounded-[14px] md:rounded-[18px] border border-gray-200 dark:border-slate-700 overflow-hidden" style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}>
                    {mod.imageUrl ? (
                      <img src={mod.imageUrl} alt="" className="w-full aspect-video object-cover" />
                    ) : (
                      <div className="w-full aspect-video bg-gradient-to-br from-orange-100 to-amber-100 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
                        <span className="text-3xl md:text-4xl font-bold text-orange-400/50">{getModuleTitle(mod).charAt(0)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default ProductShowcaseSection;
