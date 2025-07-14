import { useLocation } from 'react-router-dom';
import { useEffect, useState, lazy, Suspense, useRef, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import PageLoader from '@/components/PageLoaderComponent';
import PageNotFound from '@/components/ui/PageNotFound';
import { Company } from '@/types/companyTypes';
import ErrorBoundary from '@/components/ErrorBoundary';
import MobileErrorScreen from '@/components/ui/MobileErrorScreen';

// Configuration mobile
const MOBILE_MAX_WIDTH = 768;
const isMobileViewport = () => window.innerWidth <= MOBILE_MAX_WIDTH;

// Types pour les composants lazy
interface PublicCompanyPageProps {
  company: Company;
  isMobile?: boolean;
}

// ✅ Lazy load standard
const PublicCompanyPage = lazy(() => import('./PublicCompanyPage'));
const ResultatsAgencePage = lazy(() => import('./ResultatsAgencePage'));
const FormulaireReservationClient = lazy(() => import('./FormulaireReservationClient'));
const ClientMesReservationsPage = lazy(() => import('./ClientMesReservationsPage'));
const MentionsPage = lazy(() => import('./MentionsPage'));
const ConfidentialitePage = lazy(() => import('./ConfidentialitePage'));
const ReceiptEnLignePage = lazy(() => import('./ReceiptEnLignePage'));
const UploadPreuvePage = lazy(() => import('./UploadPreuvePage'));
const ReservationDetailsPage = lazy(() => import('./ReservationDetailsPage'));

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
  | 'upload-preuve'
  | 'details'
  | 'confirmation'
  | string
  | null;

export default function RouteResolver() {
  const location = useLocation();
  const pathParts = location.pathname.split('/').filter(Boolean);
  const fetchController = useRef<AbortController>();
  const [cacheBuster, setCacheBuster] = useState(Date.now());

  // 🚫 Redirection automatique des anciens chemins
  if (pathParts[0] === 'compagnie') {
    const slug = pathParts[1];
    const rest = pathParts.slice(2).join('/');
    if (slug) {
      const newPath = `/${slug}${rest ? '/' + rest : ''}`;
      console.warn('[RouteResolver] 🚧 Redirection automatique');
      window.location.replace(newPath);
      return null;
    }
    return <PageNotFound />;
  }

  // ✅ Extraire le slug dynamique et sous-chemin
  const slugIndex = pathParts.findIndex(part => !reservedPaths.includes(part));
  const slug = slugIndex !== -1 ? pathParts[slugIndex] : null;
  const subPath: SubPath = pathParts.length > slugIndex + 1 ? pathParts[slugIndex + 1] : null;

  const [companyData, setCompanyData] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const isMobile = useMemo(() => {
    return /Android|webOS|iPhone|iPad/i.test(navigator.userAgent) || isMobileViewport();
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

      // Annule la requête précédente
      if (fetchController.current) {
        fetchController.current.abort();
      }
      fetchController.current = new AbortController();

      try {
        console.log('[RouteResolver] 🔍 Recherche compagnie:', slug);
        const q = query(
          collection(db, 'companies'),
          where('slug', '==', slug)
        );
        
        const snap = await getDocs(q);

        if (snap.empty) {
          throw new Error('Aucune compagnie trouvée');
        }

        const docSnap = snap.docs[0];
        const raw = docSnap.data();
        const validatedData = validateCompanyData(raw, docSnap.id, slug);
        
        setCompanyData(validatedData);
      } catch (error) {
        const err = error instanceof Error 
          ? error 
          : new Error(typeof error === 'string' ? error : 'Erreur inconnue');
        
        console.error('[RouteResolver] Erreur:', err.message);
        setError(err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
    return () => fetchController.current?.abort();
  }, [slug, cacheBuster]);

  function validateCompanyData(raw: any, id: string, slug: string): Company {
    if (!raw || typeof raw !== 'object') {
      throw new Error('Données compagnie invalides');
    }

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

  const renderContent = () => {
    const commonProps = { company: companyData };
    
    switch (subPath) {
      case 'resultats': return <ResultatsAgencePage {...commonProps} />;
      case 'booking': return <FormulaireReservationClient {...commonProps} />;
      case 'mes-reservations': return <ClientMesReservationsPage />;
      case 'mentions': return <MentionsPage />;
      case 'confidentialite': return <ConfidentialitePage />;
      case 'receipt': return <ReceiptEnLignePage />;
      case 'upload-preuve': return <UploadPreuvePage />;
      case 'details': return <ReservationDetailsPage />;
      case 'confirmation': return <ReceiptEnLignePage />;
      case null: return <PublicCompanyPage {...commonProps} isMobile={isMobile} />;
      default: return <PageNotFound />;
    }
  };

  return (
    <ErrorBoundary fallback={<MobileErrorScreen />}>
      <Suspense fallback={<PageLoader fullScreen />}>
        {isMobile ? (
          <MobileViewportHandler>
            {renderContent()}
          </MobileViewportHandler>
        ) : renderContent()}
      </Suspense>
    </ErrorBoundary>
  );
}

function MobileViewportHandler({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    
    document.head.appendChild(meta);
    
    return () => {
      document.head.removeChild(meta);
    };
  }, []);

  return <div className="mobile-container">{children}</div>;
}