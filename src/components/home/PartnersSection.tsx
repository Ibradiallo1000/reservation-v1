import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

interface Company {
  publicVisible: boolean;
  status: string;
  id: string;
  nom: string;
  logoUrl: string;
  slug: string;
  pays: string;
  plan: string;
}

const PartnersSection: React.FC = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const snapshot = await getDocs(collection(db, "companies"));
        const list: Company[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Company[];

        const filtered = list.filter((c) => c.status === "actif" && c.publicVisible !== false);
        setCompanies(filtered);
      } catch (err) {
        console.error("Erreur chargement compagnies:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, []);

  if (loading) {
    return <p className="text-center py-10">Chargement des compagnies...</p>;
  }

  if (companies.length === 0) {
    return <p className="text-center py-10 text-gray-500">Aucune compagnie partenaire visible.</p>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 text-center">
      <h2 className="text-2xl font-bold mb-6 text-orange-600">
        Nos compagnies partenaires
      </h2>

      {/* Carrousel compact */}
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
                onError={(e: any) => (e.target.src = "/default-logo.png")}
              />
            </div>
            <p className="text-xs font-semibold text-gray-800 truncate">{c.nom}</p>
            <p className="text-[11px] text-gray-500">{c.pays}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default PartnersSection;
