import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

type Company = {
  id: string;
  nom: string;
  logoUrl?: string;
  slug: string;
  pays?: string;
  status?: string;
  publicVisible?: boolean;
};

const PartnersSection: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loaded, setLoaded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, "companies"));
        const all = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })) as Company[];
        const filtered = all.filter(c => (c.status ?? "actif") === "actif" && c.publicVisible !== false);
        if (mounted) setCompanies(filtered);
      } catch {
        // silent fail en public
      } finally {
        if (mounted) setLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // si rien ou erreur → ne rien afficher
  if (!loaded || companies.length === 0) return null;

  return (
    <div className="max-w-6xl mx-auto px-4 text-center">
      <h2 className="text-2xl font-bold mb-6 text-orange-600">Nos compagnies partenaires</h2>
      <div className="flex gap-4 overflow-x-auto scrollbar-thin scrollbar-thumb-orange-500 scrollbar-track-gray-200 py-3">
        {companies.map((c) => (
          <motion.div
            key={c.id}
            whileHover={{ scale: 1.05 }}
            onClick={() => navigate(`/${c.slug}`)}
            className="min-w-[120px] max-w-[120px] bg-white rounded-lg shadow-md border-t-4 border-orange-500 p-3 cursor-pointer hover:shadow-lg transition-all"
          >
            <div className="w-16 h-16 mx-auto rounded-full overflow-hidden border-2 border-orange-500 shadow-sm mb-2">
              <img
                src={c.logoUrl || "/default-logo.png"}
                alt={c.nom}
                className="w-full h-full object-cover"
                onError={(e: any) => (e.currentTarget.src = "/default-logo.png")}
                loading="lazy"
                decoding="async"
              />
            </div>
            <p className="text-xs font-semibold text-gray-800 truncate">{c.nom}</p>
            {c.pays && <p className="text-[11px] text-gray-500">{c.pays}</p>}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default PartnersSection;
