// src/pages/HomePage.tsx - Version Sci-Fi Ultra Premium
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Bus, MapPin, Search, User, Ticket, Navigation, 
  HelpCircle, Shield, Clock, Headphones, Award,
  ChevronDown, Menu, X, Smartphone, Globe, ShieldCheck,
  Star, TrendingUp, Zap, CheckCircle, ArrowRight
} from 'lucide-react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { fadeIn } from '@/utils/animations';

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    departure: '',
    arrival: '',
  });
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeFeature, setActiveFeature] = useState(0);
  const featureTimer = useRef<NodeJS.Timeout>();
  const auth = getAuth();

  // Animation auto des features
  useEffect(() => {
    featureTimer.current = setInterval(() => {
      setActiveFeature(prev => (prev + 1) % 4);
    }, 5000);
    return () => clearInterval(featureTimer.current);
  }, []);

  // Vérification auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
    });
    return () => unsubscribe();
  }, [auth]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const departure = formData.departure?.trim();
    const arrival = formData.arrival?.trim();

    if (!departure || !arrival) {
      showNotification("Veuillez saisir une ville de départ et d'arrivée valides.");
      return;
    }

    navigate('/resultats', { state: { departure, arrival } });
  };

  const showNotification = (message: string) => {
    // Implémentation moderne avec toast
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-xl z-50 animate-fade-in-up';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.classList.add('animate-fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  };

  // Données dynamiques
  const partners = [
    { name: "STC", logo: "/logos/stc.png", routes: ["Bamako", "Dakar", "Abidjan"] },
    { name: "SOTRA", logo: "/logos/sotra.png", routes: ["Abidjan", "Ouagadougou", "Lomé"] },
    { name: "UAT", logo: "/logos/uat.png", routes: ["Tous les trajets"] },
    { name: "Africa Tours", logo: "/logos/africa-tours.png", routes: ["Dakar", "Bamako", "Conakry"] },
    { name: "TCV", logo: "/logos/tcv.png", routes: ["Côte d'Ivoire", "Burkina"] },
    { name: "STL", logo: "/logos/stl.png", routes: ["Togo", "Ghana", "Bénin"] },
  ];

  const popularCities = [
    { name: "Bamako", country: "Mali", flag: "🇲🇱" },
    { name: "Dakar", country: "Sénégal", flag: "🇸🇳" },
    { name: "Abidjan", country: "Côte d'Ivoire", flag: "🇨🇮" },
    { name: "Ouagadougou", country: "Burkina Faso", flag: "🇧🇫" },
    { name: "Lomé", country: "Togo", flag: "🇹🇬" },
    { name: "Accra", country: "Ghana", flag: "🇬🇭" },
    { name: "Conakry", country: "Guinée", flag: "🇬🇳" },
    { name: "Niamey", country: "Niger", flag: "🇳🇪" },
  ];

  const features = [
    {
      icon: <ShieldCheck className="h-8 w-8" />,
      title: "Sécurité absolue",
      description: "Paiements cryptés et protection des données certifiée ISO 27001",
      highlight: "Garantie de remboursement à 100%"
    },
    {
      icon: <Zap className="h-8 w-8" />,
      title: "Rapidité extrême",
      description: "Réservation en moins de 30 secondes avec notre AI",
      highlight: "Temps record en Afrique"
    },
    {
      icon: <Globe className="h-8 w-8" />,
      title: "Couverture totale",
      description: "Plus de 200 villes connectées dans 15 pays",
      highlight: "Le plus grand réseau"
    },
    {
      icon: <TrendingUp className="h-8 w-8" />,
      title: "Économie intelligente",
      description: "Notre algorithme trouve toujours les meilleurs prix",
      highlight: "Jusqu'à 40% d'économie"
    }
  ];

  

  const staggerContainer = {
    visible: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  // Hook d'intersection pour les animations
  const [heroRef, heroInView] = useInView({ threshold: 0.1, triggerOnce: true });
  const [statsRef, statsInView] = useInView({ threshold: 0.1, triggerOnce: true });
  const [featuresRef, featuresInView] = useInView({ threshold: 0.1, triggerOnce: true });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 overflow-x-hidden">

      {/* Header futuriste */}
      <motion.header 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className="bg-white/90 backdrop-blur-md shadow-sm sticky top-0 z-50 border-b border-gray-100"
      >
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div 
            className="flex items-center space-x-2 cursor-pointer group"
            onClick={() => navigate('/')}
          >
            <div className="relative">
              <Bus className="h-8 w-8 text-yellow-600 transition-transform group-hover:rotate-12" />
              <div className="absolute -inset-1 bg-yellow-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
            </div>
            <span className="text-2xl font-bold text-yellow-600 font-sans bg-gradient-to-r from-yellow-600 to-yellow-400 bg-clip-text text-transparent">
              TIKETA<span className="text-yellow-400">+</span>
            </span>
            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full ml-2 hidden sm:inline border border-yellow-200">
              <span className="relative flex h-2 w-2 mr-1 inline-block">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              LIVE
            </span>
          </div>
          
          {/* Navigation desktop */}
          <nav className="hidden md:flex items-center space-x-8">
            <button
              onClick={() => navigate('/trajets')}
              className="text-gray-700 hover:text-yellow-700 transition-colors text-sm font-medium flex items-center group"
            >
              Trajets
              <ChevronDown className="ml-1 h-4 w-4 text-gray-400 group-hover:text-yellow-600 transition-transform group-hover:rotate-180 duration-200" />
            </button>
            <button
              onClick={() => navigate('/destinations')}
              className="text-gray-700 hover:text-yellow-700 transition-colors text-sm font-medium"
            >
              Destinations
            </button>
            <button
              onClick={() => navigate('/services')}
              className="text-gray-700 hover:text-yellow-700 transition-colors text-sm font-medium"
            >
              Services
            </button>
            <button
              onClick={() => navigate('/entreprise')}
              className="text-gray-700 hover:text-yellow-700 transition-colors text-sm font-medium"
            >
              Entreprise
            </button>
          </nav>

          <div className="flex items-center space-x-4">
            {isAuthenticated ? (
              <button
                onClick={() => navigate('/login')}
                className="flex items-center space-x-1 text-gray-600 hover:text-yellow-700 transition-colors text-sm md:text-base group"
              >
                <div className="relative">
                  <User className="h-5 w-5 group-hover:scale-110 transition-transform" />
                  <span className="absolute -right-1 -top-1 bg-yellow-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    3
                  </span>
                </div>
                <span className="hidden sm:inline">Mon compte</span>
              </button>
            ) : (
              <button
                onClick={() => navigate('/login')}
                className="flex items-center space-x-1 text-gray-600 hover:text-yellow-700 transition-colors text-sm md:text-base group"
              >
                <User className="h-5 w-5 group-hover:scale-110 transition-transform" />
                <span className="hidden sm:inline">Connexion</span>
              </button>
            )}
            
            {/* Bouton mobile */}
            <button 
              className="md:hidden text-gray-600 focus:outline-none"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>

        {/* Menu mobile */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="md:hidden overflow-hidden"
            >
              <div className="px-4 py-3 space-y-4 bg-white border-t border-gray-100">
                <MobileNavItem 
                  icon={<Navigation className="h-5 w-5" />} 
                  text="Rechercher un trajet" 
                  onClick={() => {
                    navigate('/trajets');
                    setMobileMenuOpen(false);
                  }}
                />
                <MobileNavItem 
                  icon={<MapPin className="h-5 w-5" />} 
                  text="Destinations" 
                  onClick={() => {
                    navigate('/destinations');
                    setMobileMenuOpen(false);
                  }}
                />
                <MobileNavItem 
                  icon={<Ticket className="h-5 w-5" />} 
                  text="Mes réservations" 
                  onClick={() => {
                    navigate('/mes-reservations');
                    setMobileMenuOpen(false);
                  }}
                />
                <MobileNavItem 
                  icon={<HelpCircle className="h-5 w-5" />} 
                  text="Aide" 
                  onClick={() => {
                    navigate('/aide');
                    setMobileMenuOpen(false);
                  }}
                />
                <div className="pt-2 border-t border-gray-100">
                  <MobileNavItem 
                    icon={<User className="h-5 w-5" />} 
                    text={isAuthenticated ? "Mon compte" : "Connexion"} 
                    onClick={() => {
                      navigate(isAuthenticated ? '/mon-compte' : '/login');
                      setMobileMenuOpen(false);
                    }}
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* Hero section futuriste */}
      <motion.section
        ref={heroRef}
        initial="hidden"
        animate={heroInView ? "visible" : "hidden"}
        variants={staggerContainer}
        className="relative bg-cover bg-center flex-grow flex items-center"
        style={{
          backgroundImage: 'linear-gradient(rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.85)), url(https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=1600&q=80)',
        }}
      >
        {/* Effet particules */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-0 left-0 w-full h-full bg-[url('/images/particles.png')] bg-cover animate-particles"></div>
        </div>

        <div className="container mx-auto px-4 py-5 md:py-9 relative z-10">
          <motion.div 
            variants={fadeIn}
            className="max-w-4xl mx-auto text-center text-white mb-12 md:mb-16"
          >
            <h1 className="text-4xl md:text-6xl font-bold mb-4 leading-tight bg-gradient-to-r from-yellow-400 to-yellow-200 bg-clip-text text-transparent">
              <span className="inline-block">Réserver vos billets</span>
              <span className="inline-block">en un Clic</span>
            </h1>
          </motion.div>

          {/* Formulaire de recherche holographique */}
          <motion.div 
            variants={fadeIn}
            className="bg-white/10 backdrop-blur-lg rounded-xl shadow-2xl p-6 max-w-4xl mx-auto border border-white/10 relative overflow-hidden -mt -4"
          >
            {/* Effet de bordure animée */}
            <div className="absolute inset-0 rounded-xl overflow-hidden">
              <div className="absolute inset-0 bg-[conic-gradient(from_90deg_at_50%_50%,#f59e0b00_0%,#f59e0b_25%,#f59e0b00_50%)] opacity-30 animate-rotate-border"></div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">Départ</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-5 w-5 text-yellow-400" />
                    <input
                      type="text"
                      name="departure"
                      value={formData.departure}
                      onChange={handleChange}
                      required
                      placeholder="Ex: Bamako"
                      className="pl-10 w-full border border-gray-300/30 bg-white/10 text-white rounded-lg py-3 px-4 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder-white/60 backdrop-blur-sm"
                      list="departure-suggestions"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">Destination</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 h-5 w-5 text-yellow-400" />
                    <input
                      type="text"
                      name="arrival"
                      value={formData.arrival}
                      onChange={handleChange}
                      required
                      placeholder="Ex: Dakar"
                      className="pl-10 w-full border border-gray-300/30 bg-white/10 text-white rounded-lg py-3 px-4 focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 placeholder-white/60 backdrop-blur-sm"
                      list="arrival-suggestions"
                    />
                  </div>
                </div>
              </div>

              <datalist id="departure-suggestions">
                {popularCities.map((city, index) => (
                  <option key={`dep-${index}`} value={`${city.name}, ${city.country}`} />
                ))}
              </datalist>
              <datalist id="arrival-suggestions">
                {popularCities.map((city, index) => (
                  <option key={`arr-${index}`} value={`${city.name}, ${city.country}`} />
                ))}
              </datalist>

              <div className="flex flex-col sm:flex-row justify-between items-center mt-2 gap-4">
                <div className="flex items-center text-xs text-white/70">
                  <CheckCircle className="h-4 w-4 mr-1 text-yellow-400" />
                  <span>+50 compagnies comparées en temps réel</span>
                </div>
                <button
                  type="submit"
                  className="flex items-center justify-center bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white font-medium py-3 px-8 rounded-lg shadow-lg transition-all duration-300 transform hover:scale-105 w-full sm:w-auto"
                >
                  <Search className="h-5 w-5 mr-2" />
                  <span>Rechercher des trajets</span>
                  <div className="ml-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </button>
              </div>
            </form>
          </motion.div>

          {/* Villes populaires */}
          <motion.div 
            variants={fadeIn}
            className="mt-8"
          >
            <h3 className="text-sm font-medium text-white/80 text-center mb-3">Destinations populaires</h3>
            <div className="flex flex-wrap justify-center gap-2">
              {popularCities.slice(0, 6).map((city, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setFormData({
                      departure: 'Bamako, Mali',
                      arrival: `${city.name}, ${city.country}`
                    });
                  }}
                  className="flex items-center bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs md:text-sm px-3 py-2 rounded-full transition-all duration-200"
                >
                  <span className="mr-1">{city.flag}</span>
                  <span>{city.name}</span>
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* Section Features animée */}
      <section className="py-16 bg-gradient-to-b from-gray-900 to-gray-800 relative overflow-hidden">
        {/* Effet de fond futuriste */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[url('/images/tech-grid.png')] bg-cover bg-center"></div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <motion.div
            ref={featuresRef}
            initial="hidden"
            animate={featuresInView ? "visible" : "hidden"}
            variants={staggerContainer}
            className="text-center mb-12"
          >
            <motion.div variants={fadeIn} className="inline-flex items-center bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs md:text-sm px-3 py-1 rounded-full mb-4">
              TECHNOLOGIE
            </motion.div>
            <motion.h2 variants={fadeIn} className="text-3xl md:text-4xl font-bold text-white mb-4">
              Voyagez avec la puissance de l'innovation
            </motion.h2>
            <motion.p variants={fadeIn} className="text-lg text-gray-300 max-w-2xl mx-auto">
              Nous combinons les dernières technologies pour révolutionner votre expérience de voyage.
            </motion.p>
          </motion.div>

          {/* Features en carousel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div className="relative h-64 md:h-96 rounded-xl overflow-hidden border border-gray-700/50">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeFeature}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 p-6 flex flex-col justify-center"
                >
                  <div className="text-yellow-400 mb-4">
                    {features[activeFeature].icon}
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    {features[activeFeature].title}
                  </h3>
                  <p className="text-gray-300 mb-4">
                    {features[activeFeature].description}
                  </p>
                  <div className="text-yellow-400 text-sm font-medium">
                    {features[activeFeature].highlight}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  whileHover={{ y: -5 }}
                  onClick={() => setActiveFeature(index)}
                  className={`p-6 rounded-xl cursor-pointer transition-all duration-300 ${activeFeature === index ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-gray-800/50 hover:bg-gray-800/70 border border-gray-700/30'}`}
                >
                  <div className={`mb-3 ${activeFeature === index ? 'text-yellow-400' : 'text-gray-400'}`}>
                    {feature.icon}
                  </div>
                  <h4 className={`font-medium mb-1 ${activeFeature === index ? 'text-white' : 'text-gray-300'}`}>
                    {feature.title}
                  </h4>
                  <p className={`text-sm ${activeFeature === index ? 'text-gray-300' : 'text-gray-500'}`}>
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Stats animées */}
          <motion.div
            ref={statsRef}
            initial="hidden"
            animate={statsInView ? "visible" : "hidden"}
            variants={staggerContainer}
            className="grid grid-cols-2 md:grid-cols-4 gap-6"
          >
            <motion.div variants={fadeIn}>
              <StatCard 
                value="+50" 
                label="Compagnies partenaires" 
                icon={<Bus className="h-6 w-6 text-yellow-500" />}
              />
            </motion.div>
            <motion.div variants={fadeIn}>
              <StatCard 
                value="+200" 
                label="Villes connectées" 
                icon={<MapPin className="h-6 w-6 text-yellow-500" />}
              />
            </motion.div>
            <motion.div variants={fadeIn}>
              <StatCard 
                value="24/7" 
                label="Support client" 
                icon={<Headphones className="h-6 w-6 text-yellow-500" />}
              />
            </motion.div>
            <motion.div variants={fadeIn}>
              <StatCard 
                value="98.7%" 
                label="Satisfaction" 
                icon={<Star className="h-6 w-6 text-yellow-500" />}
              />
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Section Partenaires holographique */}
      <section className="py-16 bg-gray-900 text-white relative overflow-hidden">
        {/* Effet de lumière */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-yellow-500 rounded-full filter blur-3xl opacity-10"></div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="text-center mb-12">
            <div className="inline-flex items-center bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs md:text-sm px-3 py-1 rounded-full mb-4">
              RÉSEAU
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Notre écosystème de partenaires
            </h2>
            <p className="text-lg text-gray-300 max-w-2xl mx-auto">
              Collaborez avec les leaders du transport en Afrique de l'Ouest.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-6">
            {partners.map((partner, index) => (
              <motion.div
                key={index}
                whileHover={{ y: -5 }}
                className="bg-gray-800/50 hover:bg-gray-800/70 border border-gray-700/30 rounded-xl p-4 transition-all duration-300 group"
              >
                <div className="h-16 flex items-center justify-center mb-3">
                  <img 
                    src={partner.logo} 
                    alt={partner.name} 
                    className="max-h-full max-w-full object-contain grayscale group-hover:grayscale-0 transition-all duration-500"
                  />
                </div>
                <h3 className="text-center font-medium text-sm text-white">
                  {partner.name}
                </h3>
                <div className="mt-2 flex flex-wrap justify-center gap-1">
                  {partner.routes.map((route, i) => (
                    <span key={i} className="text-xs bg-gray-700/50 text-gray-300 px-2 py-1 rounded">
                      {route}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <button className="inline-flex items-center text-yellow-400 hover:text-yellow-300 text-sm font-medium">
              Devenir partenaire
              <ArrowRight className="ml-1 h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Section Témoignages 3D */}
      <section className="py-16 bg-gray-100 relative overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <div className="inline-flex items-center bg-yellow-500/20 border border-yellow-500/30 text-yellow-600 text-xs md:text-sm px-3 py-1 rounded-full mb-4">
              TÉMOIGNAGES
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Ce que nos voyageurs disent
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Des milliers de voyageurs nous font confiance chaque jour.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <TestimonialCard
              quote="Grâce à TIKETA+, j'ai économisé 30% sur mes trajets mensuels. L'application est intuitive et les alertes en temps réel sont très utiles."
              author="Fatoumata K."
              role="Commerçante, Bamako"
              rating={5}
            />
            <TestimonialCard
              quote="Le suivi GPS m'a permis de rassurer ma famille pendant mon voyage. Service client réactif et professionnel."
              author="Jean-Paul D."
              role="Consultant, Abidjan"
              rating={4}
            />
            <TestimonialCard
              quote="Première fois que je réserve en ligne sans problème. Le billet électronique est une révolution en Afrique !"
              author="Aminata S."
              role="Étudiante, Dakar"
              rating={5}
            />
          </div>
        </div>
      </section>

      {/* Section CTA Futuriste */}
      <section className="py-16 bg-gradient-to-r from-gray-900 to-gray-800 text-white relative overflow-hidden">
        {/* Effet de particules */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[url('/images/particles-2.png')] bg-cover animate-particles-2"></div>
        </div>
        
        <div className="container mx-auto px-4 text-center relative z-10">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Prêt pour l'expérience de voyage du futur ?
            </h2>
            <p className="text-lg text-gray-300 mb-8">
              Téléchargez notre application et bénéficiez de fonctionnalités exclusives comme la réalité augmentée dans les gares et l'IA de recommandation.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button className="bg-white text-gray-900 hover:bg-gray-100 font-medium py-3 px-6 rounded-lg shadow-lg transition-all duration-300 flex items-center justify-center">
                <Smartphone className="h-5 w-5 mr-2" />
                Télécharger l'app
              </button>
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="bg-transparent hover:bg-white/10 text-white font-medium py-3 px-6 rounded-lg border border-white/20 transition-all duration-300"
              >
                Commencer maintenant
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Premium */}
      <footer className="bg-gray-950 text-gray-400 py-12 relative overflow-hidden">
        {/* Effet de grille */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0 bg-[url('/images/grid.png')] bg-cover"></div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid md:grid-cols-5 gap-8 mb-8">
            <div className="md:col-span-2">
              <div className="flex items-center space-x-2 mb-4">
                <Bus className="h-6 w-6 text-yellow-400" />
                <span className="text-xl font-bold text-yellow-400">TIKETA<span className="text-yellow-300">+</span></span>
              </div>
              <p className="text-sm mb-4">
                La plateforme la plus avancée pour les voyages en bus en Afrique, combinant technologie et service humain.
              </p>
              <div className="flex space-x-4">
                <SocialIcon href="#" icon="facebook" />
                <SocialIcon href="#" icon="twitter" />
                <SocialIcon href="#" icon="instagram" />
                <SocialIcon href="#" icon="linkedin" />
              </div>
            </div>
            <div>
              <h3 className="text-white text-lg font-semibold mb-4">Entreprise</h3>
              <ul className="space-y-2 text-sm">
                <FooterLink href="/about">À propos</FooterLink>
                <FooterLink href="/careers">Carrières</FooterLink>
                <FooterLink href="/press">Presse</FooterLink>
                <FooterLink href="/blog">Blog</FooterLink>
              </ul>
            </div>
            <div>
              <h3 className="text-white text-lg font-semibold mb-4">Ressources</h3>
              <ul className="space-y-2 text-sm">
                <FooterLink href="/help">Centre d'aide</FooterLink>
                <FooterLink href="/contact">Contact</FooterLink>
                <FooterLink href="/partners">Partenaires</FooterLink>
                <FooterLink href="/developers">API</FooterLink>
              </ul>
            </div>
            <div>
              <h3 className="text-white text-lg font-semibold mb-4">Légal</h3>
              <ul className="space-y-2 text-sm">
                <FooterLink href="/privacy">Confidentialité</FooterLink>
                <FooterLink href="/terms">Conditions</FooterLink>
                <FooterLink href="/cookies">Cookies</FooterLink>
                <FooterLink href="/security">Sécurité</FooterLink>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-xs mb-4 md:mb-0">
              © {new Date().getFullYear()} TIKETA+ Technologies. Tous droits réservés.
            </p>
            <div className="flex space-x-6">
              <button className="text-xs hover:text-yellow-400 transition-colors">
                Paramètres de confidentialité
              </button>
              <button className="text-xs hover:text-yellow-400 transition-colors">
                Préférences de cookies
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

// Composants réutilisables améliorés
const MobileNavItem: React.FC<{
  icon: React.ReactNode;
  text: string;
  onClick: () => void;
}> = ({ icon, text, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center w-full text-left text-gray-800 hover:text-yellow-600 transition-colors py-2 px-1"
  >
    <div className="mr-3 text-gray-500">
      {icon}
    </div>
    <span className="font-medium">{text}</span>
  </button>
);

const StatCard: React.FC<{ 
  value: string; 
  label: string;
  icon?: React.ReactNode;
}> = ({ value, label, icon }) => (
  <motion.div
    whileHover={{ scale: 1.03 }}
    className="bg-gray-800 hover:bg-gray-700/80 border border-gray-700/50 p-6 rounded-xl transition-all duration-300"
  >
    <div className="flex items-center mb-2">
      {icon && (
        <div className="mr-3 bg-yellow-500/10 p-2 rounded-lg">
          {icon}
        </div>
      )}
      <p className="text-3xl font-bold text-white">{value}</p>
    </div>
    <p className="text-sm text-gray-400">{label}</p>
  </motion.div>
);

const TestimonialCard: React.FC<{
  quote: string;
  author: string;
  role: string;
  rating: number;
}> = ({ quote, author, role, rating }) => (
  <motion.div
    whileHover={{ y: -5 }}
    className="bg-white hover:shadow-lg border border-gray-200 rounded-xl p-6 transition-all duration-300 h-full"
  >
    <div className="flex mb-4">
      {[...Array(5)].map((_, i) => (
        <Star 
          key={i} 
          className={`h-4 w-4 ${i < rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`} 
        />
      ))}
    </div>
    <blockquote className="text-gray-700 italic mb-4">
      "{quote}"
    </blockquote>
    <div className="text-sm font-medium text-gray-900">{author}</div>
    <div className="text-xs text-gray-500">{role}</div>
  </motion.div>
);

const SocialIcon: React.FC<{
  href: string;
  icon: string;
}> = ({ href, icon }) => {
  const IconComponent = {
    facebook: () => (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="..." />
      </svg>
    ),
    twitter: () => (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="..." />
      </svg>
    ),
    instagram: () => (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="..." />
      </svg>
    ),
    linkedin: () => (
      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="..." />
      </svg>
    ),
  }[icon] as (() => JSX.Element | null) | undefined;

  if (!IconComponent) {
    console.warn(`Icône "${icon}" non définie dans SocialIcon`);
    return null;
  }

  return (
    <a
      href={href}
      className="text-gray-500 hover:text-yellow-400 transition-colors"
      target="_blank"
      rel="noopener noreferrer"
    >
      {IconComponent()}
    </a>
  );
};

const FooterLink: React.FC<{ 
  href: string; 
  children: React.ReactNode;
}> = ({ href, children }) => (
  <li>
    <a 
      href={href} 
      className="hover:text-yellow-400 transition-colors inline-block py-1"
    >
      {children}
    </a>
  </li>
);

export default HomePage;