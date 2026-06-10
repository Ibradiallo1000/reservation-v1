import React, { useEffect, useState } from "react";
import { collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { MessageCircle, Star } from "lucide-react";
import { useTranslation } from "react-i18next";

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

const AvisListePublic: React.FC<Props> = ({ companyId, primaryColor, secondaryColor }) => {
  const [avis, setAvis] = useState<Avis[]>([]);
  const { t } = useTranslation();

  useEffect(() => {
    if (!companyId) return;

    const fetchAvis = async () => {
      try {
        const qRef = query(
          collection(db, `companies/${companyId}/avis`),
          where("visible", "==", true),
          orderBy("createdAt", "desc"),
          limit(5)
        );
        const snap = await getDocs(qRef);
        const data = snap.docs.map((reviewDoc) => {
          const review = reviewDoc.data() as any;
          return {
            id: reviewDoc.id,
            nom: review.nom,
            note: review.note,
            commentaire: review.commentaire,
          };
        });
        setAvis(data);
      } catch (err: any) {
        if (err?.code === "permission-denied" || err?.message?.includes("permissions")) {
          console.warn("AvisListePublic: lecture avis refusée (règles Firestore ou index manquant). Déployer firestore.rules et firestore.indexes.json.");
        }
        setAvis([]);
      }
    };

    fetchAvis();
  }, [companyId]);

  if (avis.length === 0) return null;

  const average = avis.reduce((total, review) => total + review.note, 0) / avis.length;
  const featuredReview = avis[0];

  return (
    <section className="public-premium-section relative z-10 pb-4 pt-12 sm:pt-16">
      <div className="public-premium-container">
        <div className="mb-5 flex items-center gap-3 text-white">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
            <MessageCircle size={20} style={{ color: secondaryColor }} />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
            {t("customerReviews")}
          </h2>
        </div>

        <div
          className="overflow-hidden rounded-[1.75rem] border border-white/15 text-white shadow-2xl"
          style={{ background: `linear-gradient(120deg, ${primaryColor}, ${secondaryColor})` }}
        >
          <div className="grid sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="flex flex-col items-center justify-center border-b border-white/15 p-7 text-center sm:border-b-0 sm:border-r sm:p-9">
              <p className="text-5xl font-black tracking-tight">{average.toFixed(1)}</p>
              <div className="mt-3 flex gap-1">
                {[...Array(5)].map((_, index) => (
                  <Star
                    key={index}
                    size={18}
                    className={index < Math.round(average) ? "fill-current" : "opacity-35"}
                  />
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold text-white/75">
                {t("basedOnReviews", {
                  count: avis.length,
                  defaultValue: `Basé sur ${avis.length} avis`,
                })}
              </p>
            </div>
            <div className="flex min-h-52 flex-col justify-center p-7 sm:p-9">
              <p className="text-lg font-medium italic leading-relaxed text-white/95 sm:text-xl">
                “{featuredReview.commentaire}”
              </p>
              <p className="mt-5 text-sm font-bold text-white/75">— {featuredReview.nom}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-center gap-2">
          {avis.slice(0, 3).map((review, index) => (
            <span
              key={review.id}
              className={`h-2 rounded-full bg-white transition-all ${index === 0 ? "w-6" : "w-2 opacity-35"}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default AvisListePublic;
