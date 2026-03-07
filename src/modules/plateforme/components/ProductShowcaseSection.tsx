/**
 * Alternating zigzag product showcase (Stripe/Notion style).
 * Each module is a full-width horizontal section: text + image, alternating left/right on desktop.
 * Data from platform/settings.productPresentation with DEFAULT_PRODUCT_PRESENTATION fallback.
 * Scroll reveal animations; sticky image on desktop (lg+).
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion, useInView } from "framer-motion";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  LayoutDashboard,
  Building2,
  Ticket,
  ClipboardCheck,
  Package,
  Truck,
  Calculator,
  type LucideIcon,
} from "lucide-react";
import {
  DEFAULT_PRODUCT_PRESENTATION,
  type ProductPresentationModule,
} from "../types/productPresentation";

const MODULE_ICONS: Record<string, LucideIcon> = {
  direction: LayoutDashboard,
  agences: Building2,
  guichet: Ticket,
  "reservation-en-ligne": Ticket,
  embarquement: ClipboardCheck,
  courrier: Package,
  flotte: Truck,
  comptabilite: Calculator,
};

const ProductShowcaseSection: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [modules, setModules] = useState<ProductPresentationModule[]>(
    DEFAULT_PRODUCT_PRESENTATION
  );

  const isEn = (i18n.language || "fr").toLowerCase().startsWith("en");

  useEffect(() => {
    let c = false;
    getDoc(doc(db, "platform", "settings"))
      .then((snap) => {
        if (c || !snap.exists()) return;
        const d = snap.data() as {
          productPresentation?: ProductPresentationModule[];
        };
        if (
          Array.isArray(d?.productPresentation) &&
          d.productPresentation.length > 0
        ) {
          const sorted = [...d.productPresentation]
            .filter((m) => m?.enabled !== false)
            .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
          if (sorted.length) setModules(sorted);
        }
      })
      .catch(() => {});
    return () => {
      c = true;
    };
  }, []);

  const getModuleTitle = useCallback(
    (mod: ProductPresentationModule) => {
      if (isEn && mod.titleEn?.trim()) return mod.titleEn.trim();
      return t(`landing.showcase.${mod.id}.title`, { defaultValue: mod.title });
    },
    [isEn, t]
  );

  const getModuleDescription = useCallback(
    (mod: ProductPresentationModule) => {
      if (isEn && mod.descriptionEn?.trim())
        return mod.descriptionEn.trim();
      return t(`landing.showcase.${mod.id}.description`, {
        defaultValue: mod.description,
      });
    },
    [isEn, t]
  );

  const getModuleFeatures = useCallback(
    (mod: ProductPresentationModule): string[] => {
      if (isEn && mod.featuresEn?.length) return mod.featuresEn;
      const fromI18n = [1, 2, 3, 4]
        .map((i) =>
          t(`landing.showcase.${mod.id}.feature${i}`, { defaultValue: "" })
        )
        .filter(Boolean);
      if (fromI18n.length > 0) return fromI18n;
      return mod.features ?? [];
    },
    [isEn, t]
  );

  if (modules.length === 0) return null;

  return (
    <section className="py-20 md:py-28 bg-[#f9fafb] dark:bg-slate-800/50">
      <div className="max-w-[1200px] mx-auto px-6">
        <SectionHeader t={t} />
        <div className="space-y-16 md:space-y-24 lg:space-y-28">
          {modules.map((mod, index) => (
            <ShowcaseModule
              key={mod.id}
              mod={mod}
              index={index}
              getModuleTitle={getModuleTitle}
              getModuleDescription={getModuleDescription}
              getModuleFeatures={getModuleFeatures}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const SECTION_HEADER_VARIANTS = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0 },
};

function SectionHeader({ t }: { t: (key: string, opts?: { defaultValue?: string }) => string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={SECTION_HEADER_VARIANTS}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.02em] text-gray-900 dark:text-white mb-2 md:mb-3 text-center md:text-left">
        {t("landing.showcase.sectionTitle")}
      </h2>
      <p className="text-base text-[#6b7280] dark:text-slate-400 max-w-2xl mb-12 md:mb-16 text-center md:text-left">
        {t("landing.showcase.sectionSubtitle", {
          defaultValue:
            "TELIYA centralise toutes vos opérations : agences, ventes (guichet et en ligne), embarquement, courrier, flotte et comptabilité.",
        })}
      </p>
    </motion.div>
  );
}

const MODULE_TRANSITION = { duration: 0.7, ease: "easeOut" as const };

function ShowcaseModule({
  mod,
  index,
  getModuleTitle,
  getModuleDescription,
  getModuleFeatures,
}: {
  mod: ProductPresentationModule;
  index: number;
  getModuleTitle: (m: ProductPresentationModule) => string;
  getModuleDescription: (m: ProductPresentationModule) => string;
  getModuleFeatures: (m: ProductPresentationModule) => string[];
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  const title = getModuleTitle(mod);
  const description = getModuleDescription(mod);
  const features = getModuleFeatures(mod);
  const Icon = MODULE_ICONS[mod.id];
  const imageLeft = index % 2 === 1;

  const textFromX = imageLeft ? 40 : -40;
  const imageFromX = imageLeft ? -40 : 40;

  const textBlock = (
    <motion.div
      initial={{ opacity: 0, x: textFromX }}
      animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: textFromX }}
      transition={MODULE_TRANSITION}
      className={`flex flex-col justify-center ${
        imageLeft ? "md:order-2" : "md:order-1"
      } order-1`}
    >
      <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mb-3 md:mb-4 flex items-center gap-3">
        {Icon && (
          <span className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
            <Icon className="h-5 w-5 md:h-6 md:w-6" />
          </span>
        )}
        {title}
      </h3>
      <p className="text-base md:text-lg text-gray-600 dark:text-slate-400 mb-5 md:mb-6 max-w-xl">
        {description}
      </p>
      {features.length > 0 && (
        <ul className="space-y-2 md:space-y-2.5">
          {features.map((f, i) => (
            <li
              key={i}
              className="flex items-center gap-2.5 text-base text-gray-700 dark:text-slate-300"
            >
              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );

  const imageBlock = (
    <motion.div
      initial={{ opacity: 0, x: imageFromX }}
      animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: imageFromX }}
      transition={MODULE_TRANSITION}
      className={`flex items-center justify-center ${
        imageLeft ? "order-2 md:order-1" : "order-2 md:order-2"
      } lg:self-start lg:sticky lg:top-[120px]`}
    >
      <div className="w-full rounded-2xl overflow-hidden shadow-xl ring-1 ring-black/5 dark:ring-white/10 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-slate-700 dark:to-slate-600 aspect-[4/3] md:aspect-[16/10] max-h-[360px] md:max-h-[420px] transition-all duration-300 ease-out hover:scale-[1.01]">
        {mod.imageUrl ? (
          <img
            src={mod.imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            {Icon ? (
              <span className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-white/90 dark:bg-slate-800/90 flex items-center justify-center text-orange-500 dark:text-orange-400 shadow-lg">
                <Icon className="h-10 w-10 md:h-12 md:w-12" />
              </span>
            ) : (
              <span className="text-5xl md:text-6xl font-bold text-orange-400/50">
                {title.charAt(0)}
              </span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );

  return (
    <article
      ref={ref}
      className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center"
    >
      {imageLeft ? (
        <>
          {imageBlock}
          {textBlock}
        </>
      ) : (
        <>
          {textBlock}
          {imageBlock}
        </>
      )}
    </article>
  );
}

export default ProductShowcaseSection;
