import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { useTranslation } from 'react-i18next';
import { hexToRgba, safeTextColor } from '@/utils/color';
import { ChevronLeft } from 'lucide-react';

interface CompanyInfo {
  id: string;
  name: string;
  couleurPrimaire?: string;
  logoUrl?: string;
  politiqueCookies?: { fr?: string; en?: string };
}

const CookiesPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const currentLang = i18n.language === 'en' ? 'en' : 'fr';

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCompany = async () => {
      const q = query(collection(db, 'companies'), where('slug', '==', slug));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data() as CompanyInfo;
        setCompany({
          id: snap.docs[0].id,
          name: data.name,
          couleurPrimaire: data.couleurPrimaire || '#3B82F6',
          logoUrl: data.logoUrl,
          politiqueCookies: data.politiqueCookies,
        });
      }
      setLoading(false);
    };

    fetchCompany();
  }, [slug]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">Chargement...</div>;
  }

  const primaryColor = company?.couleurPrimaire || '#3B82F6';
  const textColor = safeTextColor(primaryColor);
  const content = company?.politiqueCookies?.[currentLang] || 'Politique de cookies non disponible.';

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="px-6 py-4 shadow-sm"
        style={{ backgroundColor: primaryColor, color: textColor }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center">
            {/* 🔙 Bouton flèche retour */}
            <button
              onClick={() => navigate(`/${slug}`)}
              className="mr-4 text-white hover:text-gray-200"
              title="Retour à la page d'accueil"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h1 className="text-xl font-bold">Politique des cookies</h1>
          </div>

          {company?.logoUrl && (
            <img
              src={company.logoUrl}
              alt="Logo"
              className="h-10 w-10 object-contain rounded-full border bg-white"
              style={{ borderColor: hexToRgba(primaryColor, 0.2) }}
            />
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 text-gray-800">
        <p className="whitespace-pre-wrap leading-relaxed text-justify text-sm md:text-base">
          {content}
        </p>
      </main>
    </div>
  );
};

export default CookiesPage;
