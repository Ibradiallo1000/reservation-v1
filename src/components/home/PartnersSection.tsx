import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

interface Company {
  id: string; nom: string; slug: string;
  status?: string; publicVisible?: boolean;
  logoUrl?: string; pays?: string;
}

const SkeletonCard = () => (
  <div className="min-w-[120px] max-w-[120px] p-3">
    <div className="skeleton rounded-full w-16 h-16 mx-auto mb-2" />
    <div className="skeleton h-3 w-20 mx-auto rounded" />
  </div>
);

const PartnersSection: React.FC = () => {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // laisse le 1er rendu passer, puis charge
    const id = requestIdleCallback(async () => {
      try {
        const snap = await getDocs(collection(db, "companies"));
        const list = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Company[];
        setCompanies(list.filter(c => c.status === "actif" && c.publicVisible !== false));
      } catch {
        setCompanies([]); // ne bloque jamais l’affichage
      }
    });
    return () => cancelIdleCallback(id);
  }, []);

  const preload = (url?: string) => {
    if (!url) return;
    const l = document.createElement("link");
    l.rel = "preload"; l.as = "image"; l.href = url;
    document.head.appendChild(l);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 text-center">
      <h2 className="section-title">Nos compagnies partenaires</h2>

      <div className="flex gap-4 overflow-x-auto py-3">
        {companies === null
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : companies.length === 0
            ? null
            : companies.map((c) => (
                <motion.button
                  key={c.id}
                  whileHover={{ scale: 1.03 }}
                  onMouseEnter={() => preload(c.logoUrl)}
                  onTouchStart={() => preload(c.logoUrl)}
                  onClick={() => navigate(`/${c.slug}`)}
                  className="min-w-[120px] max-w-[120px] bg-white rounded-2xl shadow-sm border p-3 hover:shadow-md transition"
                >
                  <div className="w-16 h-16 mx-auto rounded-full overflow-hidden border-2 border-orange-500 shadow-sm mb-2">
                    <img
                      src={c.logoUrl || "/default-logo.png"}
                      alt={c.nom}
                      className="w-full h-full object-cover img-fade logo"
                      onLoad={(e: any) => e.currentTarget.classList.add("is-loaded")}
                      onError={(e: any) => (e.currentTarget.src = "/default-logo.png")}
                      loading="eager"
                      decoding="async"
                    />
                  </div>
                  <p className="text-xs font-semibold text-gray-800 truncate">{c.nom}</p>
                  {c.pays && <p className="text-[11px] text-gray-500">{c.pays}</p>}
                </motion.button>
              ))}
      </div>
    </div>
  );
};

export default PartnersSection;
