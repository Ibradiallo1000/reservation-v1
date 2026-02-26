// src/components/public/AvisListePublic.tsx

import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Star, MessageCircle } from "lucide-react";

interface Avis {
  id: string;
  nom: string;
  note: number;
  commentaire: string;
}

interface Props {
  companyId: string;
  primaryColor: string;
  secondaryColor: string;
}

const AvisListePublic: React.FC<Props> = ({
  companyId,
  primaryColor,
  secondaryColor,
}) => {
  const [avis, setAvis] = useState<Avis[]>([]);

  useEffect(() => {
    if (!companyId) return;

    const fetchAvis = async () => {
      const qRef = query(
        collection(db, `companies/${companyId}/avis`),
        where("visible", "==", true),
        orderBy("createdAt", "desc"),
        limit(5)
      );

      const snap = await getDocs(qRef);

      const data = snap.docs.map((doc) => {
        const d = doc.data() as any;
        return {
          id: doc.id,
          nom: d.nom,
          note: d.note,
          commentaire: d.commentaire,
        };
      });

      setAvis(data);
    };

    fetchAvis();
  }, [companyId]);

  if (avis.length === 0) return null;

  return (
    <section
      className="py-5 px-4"
      style={{
        backgroundColor: `${secondaryColor}08`,
      }}
    >
      <div className="max-w-5xl mx-auto">

        {/* Titre harmonisé */}
        <div className="flex items-center justify-center gap-2 mb-4">
          <MessageCircle size={18} style={{ color: primaryColor }} />
          <h2 className="text-lg font-semibold text-gray-900 text-center">
            Avis clients
          </h2>
        </div>

        {/* Carte principale */}
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            borderColor: `${primaryColor}30`,
            boxShadow: `0 4px 15px ${primaryColor}10`,
            backgroundColor: "#ffffff",
          }}
        >
          <div className="grid sm:grid-cols-2 md:grid-cols-3 divide-x divide-y">

            {avis.map((a) => (
              <div key={a.id} className="p-4 flex flex-col">

                {/* étoiles */}
                <div className="flex gap-1 mb-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      size={14}
                      style={{
                        color:
                          i < a.note
                            ? secondaryColor
                            : "#e5e7eb",
                        fill:
                          i < a.note
                            ? secondaryColor
                            : "none",
                      }}
                    />
                  ))}
                </div>

                {/* commentaire */}
                <p className="text-sm text-gray-700 italic mb-3 line-clamp-3">
                  “{a.commentaire}”
                </p>

                {/* nom */}
                <p
                  className="text-sm font-medium mt-auto"
                  style={{ color: primaryColor }}
                >
                  {a.nom}
                </p>
              </div>
            ))}

          </div>
        </div>

      </div>
    </section>
  );
};

export default AvisListePublic;
