import { useLocation } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense, useRef, useMemo } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

import PageLoader from '@/components/PageLoaderComponent';
import PageNotFound from '@/components/ui/PageNotFound';
import ErrorBoundary from '@/components/ErrorBoundary';
import MobileErrorScreen from '@/components/ui/MobileErrorScreen';

import { Company } from '@/types/companyTypes';

// Lazy-loaded components
const PublicCompanyPage = lazy(() => import('./PublicCompanyPage'));
const ResultatsAgencePage = lazy(() => import('./ResultatsAgencePage'));
const ReservationClientPage = lazy(() => import('./ReservationClientPage'));
const ClientMesReservationsPage = lazy(() => import('./ClientMesReservationsPage'));
const MentionsPage = lazy(() => import('./MentionsPage'));
const ConfidentialitePage = lazy(() => import('./ConfidentialitePage'));
const ReceiptEnLignePage = lazy(() => import('./ReceiptEnLignePage'));
const UploadPreuvePage = lazy(() => import('./UploadPreuvePage'));
const ReservationDetailsPage = lazy(() => import('./ReservationDetailsPage'));

const reservedPaths = [
  'login', 'register', 'admin', 'agence', 'villes', 'reservation', 'contact', 'compagnie',
];

const companyCache = new Map<string, Company>();

export default function RouteResolver() {
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const fetchController = useRef<AbortController>();
  const [cacheBuster, setCacheBuster] = useState(Date.now());
  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const slugIndex = pathParts.findIndex(part => !reservedPaths.includes(part));
  const slug = slugIndex !== -1 ? pathParts[slugIndex] : null;
  const subPath = pathParts.length > slugIndex + 1 ? pathParts[slugIndex + 1] : null;

  const isMobile = useMemo(() => {
    return typeof window !== 'undefined' && 
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
       window.innerWidth <= 768);
  }, []);

  useEffect(() => {
    setCacheBuster(Date.now());
  }, [location.pathname]);

  useEffect(() => {
    const fetchCompany = async () => {
      if (!slug || reservedPaths.includes(slug.toLowerCase())) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      try {
        if (fetchController.current) {
          fetchController.current.abort();
        }
        fetchController.current = new AbortController();

        // 1. Essayer par slug
        const q = query(collection(db, 'companies'), where('slug', '==', slug));
        const snap = await getDocs(q);

        let validatedData: Company | null = null;

        if (!snap.empty) {
          const docSnap = snap.docs[0];
          validatedData = validateCompanyData(docSnap.data(), docSnap.id, slug);
        } else {
          console.warn(`Aucune compagnie trouvée avec le slug "${slug}". On tente avec l'ID.`);
          // 2. Essayer par ID direct
          const docRef = doc(db, 'companies', slug);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            validatedData = validateCompanyData(docSnap.data(), docSnap.id, slug);
          }
        }

        if (!validatedData) {
          throw new Error(`Aucune compagnie trouvée pour "${slug}". Vérifie le champ slug ou l'ID dans Firestore.`);
        }

        companyCache.set(slug, validatedData);
        try {
          sessionStorage.setItem(`company-${slug}`, JSON.stringify(validatedData));
        } catch {
          console.warn('sessionStorage non disponible');
        }

        setCompanyData(validatedData);
      } catch (err) {
        console.error('Erreur chargement compagnie:', err);
        setError(err instanceof Error ? err : new Error('Erreur inconnue'));
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    if (slug) fetchCompany();

    return () => {
      if (fetchController.current) {
        fetchController.current.abort();
      }
    };
  }, [slug, cacheBuster]);

  function validateCompanyData(raw: any, id: string, slug: string): Company {
    if (!raw || typeof raw !== 'object') throw new Error('Données compagnie invalides');

    return {
      id,
      slug,
      nom: raw.nom || 'Compagnie',
      themeStyle: raw.themeStyle || 'clair',
      imagesSlider: Array.isArray(raw.imagesSlider) ? raw.imagesSlider : [],
      footerConfig: {
        customLinks: (raw.footerConfig?.customLinks || []).map((link: any) => ({
          label: link.label || 'Lien',
          url: link.url || '#',
          external: !!link.external
        }))
      },
      ...raw
    };
  }

  if (loading) return <PageLoader fullScreen />;
  if (notFound || !companyData) return <PageNotFound />;
  if (error) return <MobileErrorScreen error={error} />;

  const commonProps = { company: companyData };
  let Content;

  switch (subPath) {
    case 'resultats':
      Content = <ResultatsAgencePage {...commonProps} />;
      break;
    case 'booking':
      Content = <ReservationClientPage />;
      break;
    case 'mes-reservations':
      Content = <ClientMesReservationsPage />;
      break;
    case 'mentions':
      Content = <MentionsPage />;
      break;
    case 'confidentialite':
      Content = <ConfidentialitePage />;
      break;
    case 'receipt':
      Content = <ReceiptEnLignePage />;
      break;
    case 'upload-preuve':
      Content = <UploadPreuvePage />;
      break;
    case 'details':
    case 'reservation':  
      Content = <ReservationDetailsPage />;
      break;
    case 'confirmation':
      Content = <ReceiptEnLignePage />;
      break;
    case null:
      Content = <PublicCompanyPage {...commonProps} isMobile={isMobile} />;
      break;
    default:
      Content = <PageNotFound />;
  }

  return (
    <ErrorBoundary fallback={<MobileErrorScreen />}>
      <Suspense fallback={<PageLoader fullScreen />}>
        {Content}
      </Suspense>
    </ErrorBoundary>
  );
}
