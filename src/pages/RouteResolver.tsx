import { useLocation } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import PageLoader from '@/components/PageLoaderComponent';
import PageNotFound from '@/components/ui/PageNotFound';
import { Company } from '@/types/companyTypes';

// ✅ Lazy load des pages publiques
const PublicCompanyPage = lazy(() => import('./PublicCompanyPage'));
const ResultatsAgencePage = lazy(() => import('./ResultatsAgencePage'));
const FormulaireReservationClient = lazy(() => import('./FormulaireReservationClient'));
const ClientMesReservationsPage = lazy(() => import('./ClientMesReservationsPage'));
const MentionsPage = lazy(() => import('./MentionsPage'));
const ConfidentialitePage = lazy(() => import('./ConfidentialitePage'));
const ReceiptEnLignePage = lazy(() => import('./ReceiptEnLignePage'));

// 🔒 Chemins réservés
const reservedPaths = [
  'login', 'register', 'admin', 'agence', 'villes', 'reservation', 'contact', 'compagnie',
];

type SubPath =
  | 'resultats'
  | 'booking'
  | 'mes-reservations'
  | 'mentions'
  | 'confidentialite'
  | 'receipt'
  | string
  | null;

export default function RouteResolver() {
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);

  // 🚫 Blocage des anciens chemins contenant /compagnie/
  if (pathParts[0] === 'compagnie') {
    const slug = pathParts[1];
    const rest = pathParts.slice(2).join('/');
    if (slug) {
      const newPath = `/${slug}${rest ? '/' + rest : ''}`;
      console.warn('[RouteResolver] 🚧 Redirection automatique depuis /compagnie/... vers /:slug/...');
      window.location.replace(newPath);
      return null;
    } else {
      return <PageNotFound />;
    }
  }

  // ✅ Trouver le slug
  const slugIndex = pathParts.findIndex(part => !reservedPaths.includes(part));
  const slug = slugIndex !== -1 ? pathParts[slugIndex] : null;
  const subPath: SubPath = pathParts.length > slugIndex + 1 ? pathParts[slugIndex + 1] : null;

  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    console.log('[RouteResolver] SLUG DÉTECTÉ :', slug);
    console.log('[RouteResolver] Sous-chemin détecté :', subPath);

    if (!slug || reservedPaths.includes(slug.toLowerCase())) {
      console.warn('[RouteResolver] ❌ Slug invalide ou réservé :', slug);
      setNotFound(true);
      setLoading(false);
      return;
    }

    const fetchCompany = async () => {
      console.log('[RouteResolver] 🔍 Recherche compagnie par slug:', slug);
      try {
        const q = query(collection(db, 'companies'), where('slug', '==', slug));
        const snap = await getDocs(q);

        if (snap.empty) {
          console.error('[RouteResolver] ❌ Aucune compagnie trouvée avec slug:', slug);
          setNotFound(true);
          return;
        }

        const docSnap = snap.docs[0];
        const raw = docSnap.data();
        console.log('[RouteResolver] ✅ Compagnie trouvée :', raw);

        const fixedCompany: Company = {
          id: docSnap.id,
          ...raw,
          footerConfig: raw.footerConfig
            ? {
                ...raw.footerConfig,
                customLinks: Array.isArray(raw.footerConfig.customLinks)
                  ? raw.footerConfig.customLinks.map((link: any) => ({
                      label: link.label || link.title || '',
                      url: link.url,
                      external: link.external ?? false,
                    }))
                  : [],
              }
            : undefined,
          nom: '',
          slug: ''
        };

        setCompanyData(fixedCompany);
      } catch (error) {
        console.error('[RouteResolver] 💥 Erreur chargement Firestore :', error);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [slug]);

  if (loading) return <PageLoader fullScreen />;
  if (notFound || !companyData) {
    console.warn('[RouteResolver] 🚫 Données introuvables, affichage page 404');
    return <PageNotFound />;
  }

  return (
    <Suspense fallback={<PageLoader fullScreen />}>
      {(() => {
        switch (subPath) {
          case 'resultats':
            return <ResultatsAgencePage company={companyData} />;
          case 'booking':
            return <FormulaireReservationClient company={companyData} />;
          case 'mes-reservations':
            return <ClientMesReservationsPage />;
          case 'mentions':
            return <MentionsPage />;
          case 'confidentialite':
            return <ConfidentialitePage />;
          case 'receipt':
            return <ReceiptEnLignePage />;
          case null:
            return <PublicCompanyPage company={companyData} />;
          default:
            console.warn('[RouteResolver] ❓ Sous-chemin non reconnu :', subPath);
            return <PublicCompanyPage company={companyData} />;
        }
      })()}
    </Suspense>
  );
}
