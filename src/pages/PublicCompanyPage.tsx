import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { MapPin, Search, Menu, X, ChevronDown, ChevronUp, Settings, Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { useTranslation } from 'react-i18next';
import { useDebounce } from 'use-debounce';
import { getThemeConfig } from '../theme/themes';
import { hexToRgba, safeTextColor } from '../utils/color';
import { Company } from '@/types';
import SocialIcon from '../components/SocialIcon';
import ContactForm from '../components/ui/ContactForm';
import SimpleContactInfo from '../components/ui/SimpleContactInfo';
import AvisClientForm from '../components/ui/AvisClientForm';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';

interface Agence {
  id: string;
  nomAgence: string;
  ville: string;
  pays: string;
  quartier?: string;
  adresse?: string;
  telephone?: string;
  companyId: string;
}

interface MobileMenuProps {
  onClose: () => void;
  onNavigate: (path: string) => void;
  onShowAgencies: () => void;
  slug: string;
  colors: {
    primary: string;
    background: string;
    [key: string]: string;
  };
  classes: {
    card: string;
    animations: string;
    [key: string]: string;
  };
  config: {
    animations: string;
    [key: string]: any;
  };
  t: (key: string) => string;
}

interface HeroSectionProps {
  company: Company;
  departure: string;
  arrival: string;
  suggestions: {
    departure: string[];
    arrival: string[];
  };
  setDeparture: (value: string) => void;
  setArrival: (value: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  colors: {
    primary: string;
    text: string;
    [key: string]: string;
  };
  classes: {
    button: string;
    input: string;
    [key: string]: string;
  };
  t: (key: string) => string;
  setSuggestions: 
  React.Dispatch<React.SetStateAction<{ departure: string[]; arrival: string[] }>>;
}

interface CityInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  onSelectSuggestion: (city: string) => void;
  icon: React.ReactNode;
  placeholder: string;
  classes: {
    input: string;
    [key: string]: string;
  };
}

interface ImageSliderProps {
  images: string[];
  sliderIndex: number;
  setSliderIndex: (index: number) => void;
  primaryColor: string;
  companyName?: string;
  config: {
    effects: string;
    borders: string;
    [key: string]: any;
  };
}

interface AgencyListProps {
  groupedByVille: Record<string, Agence[]>;
  openVilles: Record<string, boolean>;
  toggleVille: (ville: string) => void;
  onClose: () => void;
  primaryColor: string;
  classes: {
    card: string;
    animations: string;
    [key: string]: string;
  };
  t: (key: string) => string;
}

interface AgencyItemProps {
  agence: Agence;
  primaryColor: string;
  classes: {
    card: string;
    [key: string]: string;
  };
  t: (key: string) => string;
}

interface FooterProps {
  company: Company;
  slug?: string;
  primaryColor: string;
  t: (key: string) => string;
}

/**
 * Page publique d'une compagnie de transport
 * @component
 * @returns {JSX.Element} La page publique de la compagnie
 */
const PublicCompanyPage = () => {
  const { slug } = useParams<{ slug: string }>();
  console.log("📦 Slug extrait via useParams:", slug);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [company, setCompany] = useState<Company | null>(null);
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [agences, setAgences] = useState<Agence[]>([]);
  const [sliderIndex, setSliderIndex] = useState(0);
  const [openVilles, setOpenVilles] = useState<Record<string, boolean>>({});
  const [showAgences, setShowAgences] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{departure: string[], arrival: string[]}>({
    departure: [],
    arrival: []
  });
  const [debouncedDeparture] = useDebounce(departure, 300);
  const [debouncedArrival] = useDebounce(arrival, 300);

  const fetchData = useCallback(async () => {
  console.log("Valeur du slug reçue :", slug);

  if (!slug || slug.trim() === '') {
    console.warn('Le slug est manquant ou vide');
    setError(t('companyNotFound'));
    setLoading(false);
    return;
  }

  try {
    setLoading(true);

    const q = query(collection(db, 'companies'), where('slug', '==', slug));
    const snap = await getDocs(q);

    if (snap.empty) {
      console.warn(`Aucune compagnie trouvée pour le slug : ${slug}`);
      setError(t('companyNotFound'));
      return;
    }

    const doc = snap.docs[0];
    const data = doc.data();

    if (!data || typeof data !== 'object') {
      console.warn('Données de compagnie invalides');
      setError(t('loadingError'));
      return;
    }
    const companyData = { id: doc.id, ...data } as Company;
    setCompany(companyData);

    const agQ = query(collection(db, 'agences'), where('companyId', '==', doc.id));
    const agSnap = await getDocs(agQ);
    setAgences(agSnap.docs.map(d => ({ id: d.id, ...d.data() } as Agence)));

  } catch (err) {
    console.error('Erreur de chargement:', err);
    setError(t('loadingError'));
  } finally {
    setLoading(false);
  }
}, [slug, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
  const images = company?.imagesSlider;
  if (!Array.isArray(images) || images.length === 0) return;

  const interval = setInterval(() => {
    setSliderIndex(prev => (prev + 1) % images.length);
  }, 5000);

  return () => clearInterval(interval);
}, [company]);

  useEffect(() => {
    if (debouncedDeparture.length > 1) {
      const mockSuggestions = ['Abidjan', 'Abobo', 'Adjamé', 'Bouaké', 'Bondoukou'];
      setSuggestions(prev => ({
        ...prev,
        departure: mockSuggestions.filter(city => 
          city.toLowerCase().includes(debouncedDeparture.toLowerCase())
        )
      }));
    } else {
      setSuggestions(prev => ({...prev, departure: []}));
    }
  }, [debouncedDeparture]);

  useEffect(() => {
    if (debouncedArrival.length > 1) {
      const mockSuggestions = ['Ouagadougou', 'Odienné', 'Ouangolodougou', 'Bobo-Dioulasso', 'Banfora'];
      setSuggestions(prev => ({
        ...prev,
        arrival: mockSuggestions.filter(city => 
          city.toLowerCase().includes(debouncedArrival.toLowerCase())
        )
      }));
    } else {
      setSuggestions(prev => ({...prev, arrival: []}));
    }
  }, [debouncedArrival]);

  const { colors, classes, config } = useCompanyTheme(company);

  const validateInput = (value: string) => {
    const forbiddenChars = /[<>$]/;
    if (forbiddenChars.test(value)) {
      return false;
    }
    return value.trim().length > 1;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateInput(departure) || !validateInput(arrival)) {
      setError(t('invalidCity'));
      return;
    }
    
    const dep = encodeURIComponent(departure.trim());
    const arr = encodeURIComponent(arrival.trim());
    navigate(`/compagnie/${slug}/resultats?departure=${dep}&arrival=${arr}`);
  };

  const toggleVille = (ville: string) => {
    setOpenVilles(prev => ({ ...prev, [ville]: !prev[ville] }));
  };

  const groupedByVille = useMemo(() => 
    agences.reduce((acc: Record<string, Agence[]>, agence) => {
      if (!acc[agence.ville]) acc[agence.ville] = [];
      acc[agence.ville].push(agence);
      return acc;
    }, {}),
    [agences]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: colors.background }}>
        <div
          className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2"
          style={{ borderColor: colors.primary }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen p-4 text-center"
        style={{ background: colors.background, color: colors.text }}
      >
        <div className={`p-4 rounded-lg max-w-md ${classes.card}`}>
          <h2 className="text-xl font-bold mb-2">{t('error')}</h2>
          <p>{error}</p>
          <button
            onClick={() => navigate('/')}
            className={`mt-4 px-4 py-2 rounded ${classes.button}`}
            style={{ backgroundColor: colors.primary, color: colors.text }}
          >
            {t('backToHome')}
          </button>
        </div>
      </div>
    );
  }

  if (!company) {
  console.log('⛔ Company est null. Pas de rendu possible.');
  return (
    <div className="text-center p-10 text-red-500">
      Impossible de charger les données. Vérifiez le lien ou réessayez plus tard.
    </div>
  );
}

  if (!slug) {
  return (
    <div className="text-center p-8">
      <p>Slug manquant. Veuillez réessayer plus tard.</p>
    </div>
  );
}

  return (
    <div
      className={`min-h-screen flex flex-col ${config.typography}`}
      style={{
        background: colors.background,
        color: colors.text
      }}
    >
      {/* Header */}
      <header 
        className={`sticky top-0 z-50 px-4 py-3 ${classes.header}`}
        style={{
          backgroundColor: hexToRgba(colors.primary, 0.95),
          backdropFilter: 'blur(10px)'
        }}
      >
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <LazyLoadImage 
              src={company.logoUrl} 
              alt={`Logo ${company.nom?.trim() || t('unavailable')}`} 
              effect="blur"
              className="h-10 w-10 rounded-full object-cover border-2"
              style={{ 
                borderColor: safeTextColor(colors.primary),
                backgroundColor: hexToRgba(colors.primary, 0.2)
              }}
            />
            <h1 
              className="text-xl font-bold tracking-tight"
              style={{ 
                color: safeTextColor(colors.primary),
                textShadow: '0 1px 3px rgba(0,0,0,0.5)'
              }}
            >
              {company.nom?.trim() || t('unavailable')}
            </h1>

            <div className="ml-4 hidden md:block">
              <LanguageSwitcher />
            </div>
          </div>

          <div className="md:hidden flex items-center">
            <button 
              onClick={() => setMenuOpen(!menuOpen)} 
              className={`p-2 rounded-md transition-all ${menuOpen ? 'bg-white/10' : ''}`}
              style={{
                color: safeTextColor(colors.primary),
                border: `1px solid ${hexToRgba(safeTextColor(colors.primary), 0.2)}`
              }}
              aria-label="Menu"
            >
              {menuOpen ? (
                <X className="h-6 w-6" strokeWidth={2.5} />
              ) : (
                <Menu className="h-6 w-6" strokeWidth={2.5} />
              )}
            </button>
          </div>

          <nav className="hidden md:flex gap-6 items-center text-sm">
            <button 
              onClick={() => setShowAgences(true)} 
              className={`font-medium ${config.animations}`}
              style={{ color: safeTextColor(colors.primary) }}
            >
              {t('ourAgencies')}
            </button>
            <button 
              onClick={() => navigate(`/compagnie/${slug}/mes-reservations`)} 
              className={`font-medium ${config.animations}`}
              style={{ color: safeTextColor(colors.primary) }}
            >
              {t('myBookings')}
            </button>
            <button 
              onClick={() => navigate(`/compagnie/${slug}/contact`)} 
              className={`font-medium ${config.animations}`}
              style={{ color: safeTextColor(colors.primary) }}
            >
              {t('contact')}
            </button>
            <button 
              onClick={() => navigate('/login')} 
              className={`p-2 rounded-full ${classes.button}`}
              style={{ 
                backgroundColor: colors.secondary || hexToRgba(safeTextColor(colors.primary), 0.2),
                color: safeTextColor(colors.primary)
              }}
              aria-label={t('login')}
              title={t('login')}
            >
              <Settings className="h-5 w-5" />
            </button>
          </nav>
        </div>

        <AnimatePresence>
          {menuOpen && (
            <MobileMenu 
              onClose={() => setMenuOpen(false)}
              onNavigate={(path) => {
                navigate(path);
                setMenuOpen(false);
              }}
              onShowAgencies={() => {
                setShowAgences(true);
                setMenuOpen(false);
              }}
              slug={slug || ''}
              colors={colors}
              classes={classes}
              config={config}
              t={t}
            />
          )}
        </AnimatePresence>
      </header>

      {/* Hero Section */}
      
      <HeroSection 
        company={company}
        departure={departure}
        arrival={arrival}
        suggestions={suggestions}
        setDeparture={setDeparture}
        setArrival={setArrival}
        handleSubmit={handleSubmit}
        colors={colors}
        classes={classes}
        t={t}
        setSuggestions={setSuggestions}
      />

      {/* Gallery Slider */}
      {company.imagesSlider && company.imagesSlider.length > 0 && (
        <ImageSlider 
          images={company.imagesSlider}
          sliderIndex={sliderIndex}
          setSliderIndex={setSliderIndex}
          primaryColor={colors.primary}
          companyName={company.nom}
          config={config}
        />
      )}

      {/* Agencies Section */}
      <AnimatePresence>
        {showAgences && (
          <AgencyList 
            groupedByVille={groupedByVille}
            openVilles={openVilles}
            toggleVille={toggleVille}
            onClose={() => setShowAgences(false)}
            primaryColor={colors.primary}
            classes={classes}
            t={t}
          />
        )}
      </AnimatePresence>

      {/* Footer */}
      <Footer 
        company={company}
        slug={slug}
        primaryColor={colors.primary}
        t={t}
      />
    </div>
  );
};

const MobileMenu: React.FC<MobileMenuProps> = React.memo(({ 
  onClose, 
  onNavigate, 
  onShowAgencies, 
  slug, 
  colors, 
  classes, 
  config,
  t
}) => (
  <motion.div
    initial={{ opacity: 0, y: -20 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -20 }}
    transition={{ duration: 0.2 }}
    className="md:hidden absolute top-16 right-4 w-64 z-50"
  >
    <div 
      className={`rounded-lg shadow-xl p-4 ${classes.card}`}
      style={{
        backgroundColor: hexToRgba(colors.background, 0.95),
        backdropFilter: 'blur(10px)',
        border: `1px solid ${hexToRgba(colors.primary, 0.1)}`
      }}
    >
      <nav className="flex flex-col gap-3">
        <button
          onClick={onShowAgencies}
          className={`text-left px-4 py-2 rounded-md font-medium ${config.animations}`}
          style={{
            color: colors.primary,
            backgroundColor: hexToRgba(colors.primary, 0.1)
          }}
        >
          {t('ourAgencies')}
        </button>
        <button
          onClick={() => onNavigate(`/compagnie/${slug}/mes-reservations`)}
          className={`text-left px-4 py-2 rounded-md font-medium ${config.animations}`}
          style={{
            color: colors.primary,
            backgroundColor: hexToRgba(colors.primary, 0.1)
          }}
        >
          {t('myBookings')}
        </button>
        <button
          onClick={() => onNavigate(`/compagnie/${slug}/contact`)}
          className={`text-left px-4 py-2 rounded-md font-medium ${config.animations}`}
          style={{
            color: colors.primary,
            backgroundColor: hexToRgba(colors.primary, 0.1)
          }}
        >
          {t('contact')}
        </button>
        <div className="border-t my-2" style={{ borderColor: hexToRgba(colors.primary, 0.1) }} />
        <button
          onClick={() => onNavigate('/login')}
          className={`text-left px-4 py-2 rounded-md font-medium ${config.animations}`}
          style={{
            color: safeTextColor(colors.primary),
            backgroundColor: colors.primary
          }}
        >
          {t('login')}
        </button>
      </nav>
    </div>
  </motion.div>
));

const HeroSection: React.FC<HeroSectionProps> = React.memo(({
  company,
  departure,
  arrival,
  suggestions,
  setDeparture,
  setArrival,
  setSuggestions,
  handleSubmit,
  colors,
  classes,
  t
}) => (
  <section 
    className="relative bg-cover bg-center h-[400px] md:h-[500px]" 
    style={{ backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.4)), url(${company.banniereUrl})` }}
  >
    <div className="absolute inset-0 flex flex-col justify-center items-center text-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="max-w-3xl"
      >
        <h2 className="text-3xl md:text-5xl font-bold mb-3 text-white drop-shadow-md">
          {t('searchTitle')}
        </h2>
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
        className="bg-white/00 backdrop-blur-md shadow-lg rounded-xl p-6 w-full max-w-md mx-4 mt-4 border border-white/20"
      >
        <div className="space-y-4">
          <CityInput 
            label={t('departureCity')}
            value={departure}
            onChange={setDeparture}
            suggestions={suggestions.departure}
            onSelectSuggestion={(city) => {
              setDeparture(city);
              setSuggestions((prev: {departure: string[]; arrival: string[]}) => ({
                ...prev,
                departure: []
              }));

            }}
            icon={<MapPin className="h-5 w-5 text-white/80" />}
            placeholder={t('departurePlaceholder')}
            classes={classes}
          />

          <CityInput 
            label={t('arrivalCity')}
            value={arrival}
            onChange={setArrival}
            suggestions={suggestions.arrival}
            onSelectSuggestion={(city) => {
              setArrival(city);
              setSuggestions((prev: {departure: string[]; arrival: string[]}) => ({
                ...prev,
                departure: []
              }));

            }}
            icon={<MapPin className="h-5 w-5 text-white/80" />}
            placeholder={t('arrivalPlaceholder')}
            classes={classes}
          />

          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full py-3 font-bold flex items-center justify-center rounded-lg ${classes.button}`}
            style={{ 
              backgroundColor: colors.primary,
              color: colors.text,
              boxShadow: `0 4px 14px 0 ${hexToRgba(colors.primary, 0.4)}`
            }}
          >
            <Search className="h-5 w-5 mr-2" />
            {t('searchTrip')}
          </motion.button>
        </div>
      </motion.form>
    </div>
  </section>
));

const CityInput: React.FC<CityInputProps> = React.memo(({
  label,
  value,
  onChange,
  suggestions,
  onSelectSuggestion,
  icon,
  placeholder,
  classes
}) => (
  <div>
    <label className="block text-sm font-medium text-white/90 mb-1">{label}</label>
    <div className="relative">
      <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
        {icon}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        placeholder={placeholder}
        className={`pl-10 w-full bg-white/20 h-12 rounded-lg text-base text-white placeholder-white/60 ${classes.input}`}
      />
      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg max-h-60 overflow-auto">
          {suggestions.map((city, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => onSelectSuggestion(city)}
                className="w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-800"
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
));

const ImageSlider: React.FC<ImageSliderProps> = React.memo(({
  images,
  sliderIndex,
  setSliderIndex,
  primaryColor,
  companyName,
  config
}) => (
  <section className="w-full max-w-6xl mx-auto mt-12 px-4">
    <h2 
      className="text-2xl font-bold mb-6 text-center"
      style={{ color: primaryColor }}
    >
      {companyName ? `Découvrez ${companyName}` : 'Découvrez notre compagnie'}
    </h2>
    <div className={`relative overflow-hidden rounded-xl ${config.effects} h-80`}>
      {images.map((img, index) => (
        <div 
          key={index}
          className={`absolute inset-0 transition-opacity duration-1000 ${index === sliderIndex ? 'opacity-100' : 'opacity-0'}`}
        >
          <LazyLoadImage
            src={img}
            alt={`Slide ${index + 1}`}
            effect="blur"
            className="w-full h-full object-cover"
          />
        </div>
      ))}
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2">
        {images.map((_, index) => (
          <button
            key={index}
            onClick={() => setSliderIndex(index)}
            className={`w-3 h-3 rounded-full transition ${index === sliderIndex ? 'bg-white' : 'bg-white/50'}`}
            aria-label={`Aller au slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  </section>
));

const AgencyList: React.FC<AgencyListProps> = React.memo(({
  groupedByVille,
  openVilles,
  toggleVille,
  onClose,
  primaryColor,
  classes,
  t
}) => (
  <motion.section 
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="max-w-6xl mx-auto mt-12 px-4 pb-12"
  >
    <div className={`${classes.card} p-6`}>
      <div className="flex justify-between items-center mb-6">
        <h2 
          className="text-2xl font-bold"
          style={{ color: primaryColor }}
        >
          {t('ourAgencies')}
        </h2>
        <button 
          onClick={onClose}
          className={`p-2 rounded-full ${classes.animations}`}
          style={{ color: primaryColor }}
          aria-label={t('close')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="space-y-6">
        {Object.entries(groupedByVille).map(([ville, agencesDansVille]) => (
          <div key={ville} className="mb-4">
            <button
              onClick={() => toggleVille(ville)}
              className={`flex items-center justify-between w-full text-left px-5 py-3 ${classes.animations} ${
                openVilles[ville] ? classes.card : `hover:${classes.card}`
              }`}
              style={{ 
                border: `1px solid ${openVilles[ville] ? primaryColor : hexToRgba(primaryColor, 0.2)}`,
                backgroundColor: openVilles[ville] 
                  ? hexToRgba(primaryColor, 0.1) 
                  : 'transparent'
              }}
            >
              <span className="font-semibold text-lg">{ville}</span>
              {openVilles[ville] ? (
                <ChevronUp style={{ color: primaryColor }} />
              ) : (
                <ChevronDown style={{ color: primaryColor }} />
              )}
            </button>
            
            <AnimatePresence>
              {openVilles[ville] && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-3 pl-4">
                    {agencesDansVille.map((agence) => (
                      <AgencyItem 
                        key={agence.id}
                        agence={agence}
                        primaryColor={primaryColor}
                        classes={classes}
                        t={t}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  </motion.section>
));

const AgencyItem: React.FC<AgencyItemProps> = React.memo(({
  agence,
  primaryColor,
  classes,
  t
}) => (
  <motion.div
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: 0.1 }}
    className={`${classes.card} p-4 cursor-pointer`}
  >
    <h3 className="font-semibold text-lg flex items-center gap-2">
      <span 
        className="w-2 h-2 rounded-full" 
        style={{ backgroundColor: primaryColor }} 
      />
      {agence.nomAgence}
    </h3>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2 text-sm">
      <p><span className="font-medium">{t('country')}:</span> {agence.pays}</p>
      <p><span className="font-medium">{t('district')}:</span> {agence.quartier || '—'}</p>
      <p><span className="font-medium">{t('address')}:</span> {agence.adresse || t('notSpecified')}</p>
      <p className="flex items-center gap-1">
        <Phone className="h-4 w-4" />
        <span className="font-medium">{t('phone')}:</span> {agence.telephone || '—'}
      </p>
    </div>
  </motion.div>
));

const Footer: React.FC<FooterProps> = React.memo(({
  company,
  slug,
  primaryColor,
  t
}) => (
  <footer className="mt-auto bg-gray-50 dark:bg-gray-900">
    <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-4 gap-8">
      <div>
        <h4 className="font-semibold mb-2">{t('about')}</h4>
        <p>{company.description || t('welcomeTransport')}</p>
      </div>

      {company.footerConfig?.showSocialMedia && (
        <div>
          <h4 className="font-semibold mb-2">{t('followUs')}</h4>
          <div className="flex gap-4 flex-wrap">
            {company.socialMedia?.facebook && (
              <SocialIcon url={company.socialMedia.facebook} platform="facebook" primaryColor={primaryColor} />
            )}
            {company.socialMedia?.instagram && (
              <SocialIcon url={company.socialMedia.instagram} platform="instagram" primaryColor={primaryColor} />
            )}
            {company.socialMedia?.tiktok && (
              <SocialIcon url={company.socialMedia.tiktok} platform="tiktok" primaryColor={primaryColor} />
            )}
            {company.socialMedia?.linkedin && (
              <SocialIcon url={company.socialMedia.linkedin} platform="linkedin" primaryColor={primaryColor} />
            )}
            {company.socialMedia?.twitter && (
              <SocialIcon url={company.socialMedia.twitter} platform="twitter" primaryColor={primaryColor} />
            )}
            {company.socialMedia?.youtube && (
              <SocialIcon url={company.socialMedia.youtube} platform="youtube" primaryColor={primaryColor} />
            )}
          </div>
        </div>
      )}

      {company.footerConfig?.showTestimonials && (
        <div>
          <h4 className="font-semibold mb-2">{t('customerReviews')}</h4>
          <AvisClientForm companyId={company.id} onSuccess={() => {}} />
        </div>
      )}

      <div>
        <h4 className="font-semibold mb-2">{t('contact')}</h4>
        {company.footerConfig?.showContactForm ? (
          <ContactForm primaryColor={primaryColor} />
        ) : (
          <SimpleContactInfo
            contacts={{
              email: company.email,
              phone: company.telephone,
              socialMedia: company.socialMedia,
            }}
          />
        )}
      </div>
    </div>

    {company.footerConfig?.showLegalLinks && (
      <div className="border-t mt-8 pt-4 text-center text-sm text-gray-500">
        <div className="flex justify-center gap-6 flex-wrap">
          <a href={`/compagnie/${slug}/mentions`} className="hover:underline">
            {t('legalMentions')}
          </a>
          <a href={`/compagnie/${slug}/confidentialite`} className="hover:underline">
            {t('privacyPolicy')}
          </a>
        </div>
        <p className="mt-2">&copy; {new Date().getFullYear()} {company.nom || t('ourCompany')} — {t('allRightsReserved')}</p>
      </div>
    )}
  </footer>
));

const useCompanyTheme = (company?: Company | null) => {
  return useMemo(() => {
    const themeConfig = getThemeConfig(company?.themeStyle || 'moderne');
    const primaryColor = company?.couleurPrimaire || themeConfig.colors.primary;
    const secondaryColor = company?.couleurSecondaire || themeConfig.colors.secondary;

    return {
      config: themeConfig,
      colors: {
        primary: primaryColor,
        secondary: secondaryColor,
        text: safeTextColor(primaryColor),
        background: themeConfig.colors.background
      },
      classes: {
        background: themeConfig.colors.background,
        text: themeConfig.colors.text,
        card: themeConfig.effects.includes('bg-opacity')
          ? `${themeConfig.effects} ${themeConfig.borders}`
          : `bg-white ${themeConfig.effects} ${themeConfig.borders}`,
        button: `${themeConfig.buttons} ${themeConfig.animations}`,
        input: `${themeConfig.borders} ${themeConfig.animations}`,
        header: themeConfig.effects.includes('backdrop-filter')
          ? `${themeConfig.effects} ${themeConfig.borders}`
          : `bg-white ${themeConfig.effects} ${themeConfig.borders}`,
          animations: themeConfig.animations
      }
    };
  }, [company]);
};

export default PublicCompanyPage;

