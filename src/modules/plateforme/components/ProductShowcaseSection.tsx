import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { DEFAULT_PRODUCT_PRESENTATION, type ProductPresentationModule } from "../types/productPresentation";

const ProductShowcaseSection: React.FC = () => {
  const [modules, setModules] = useState<ProductPresentationModule[]>(DEFAULT_PRODUCT_PRESENTATION);

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

  return (
    <section className="py-[40px] md:py-[70px] bg-[#f9fafb] dark:bg-slate-800/50">
      <div className="max-w-[1200px] mx-auto px-6">
        {modules.map((mod, idx) => (
          <div key={mod.id} className={"flex flex-col gap-6 md:gap-8 py-8 md:py-12 " + (idx > 0 ? "border-t border-gray-200 dark:border-slate-700" : "")}>
            <div className={"grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-center " + (idx % 2 === 1 ? "" : "")}>
              <div className={idx % 2 === 1 ? "lg:order-2" : ""}>
                <h3 className="text-[32px] font-bold text-gray-900 dark:text-white mb-3">{mod.title}</h3>
                <p className="text-[15px] text-gray-600 dark:text-slate-400 mb-4">{mod.description}</p>
                {mod.features?.length > 0 && (
                  <ul className="space-y-2">
                    {mod.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 text-[15px] text-gray-700 dark:text-slate-300">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={idx % 2 === 1 ? "lg:order-1" : ""}>
                <div className="rounded-[18px] border border-gray-200 dark:border-slate-700 overflow-hidden" style={{ boxShadow: "0 10px 30px rgba(0,0,0,0.05)" }}>
                  {mod.imageUrl ? (
                    <img src={mod.imageUrl} alt="" className="w-full aspect-video object-cover" />
                  ) : (
                    <div className="w-full aspect-video bg-gradient-to-br from-orange-100 to-amber-100 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
                      <span className="text-4xl font-bold text-orange-400/50">{mod.title.charAt(0)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProductShowcaseSection;
