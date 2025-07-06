import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ChevronLeft, Clock, Calendar, User, Phone, Mail } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { hexToRgba, safeTextColor } from '../utils/color';

interface PassengerData {
  fullName: string;
  phone: string;
  email: string;
}

const FormulaireReservationClient: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { tripData, companyInfo: originalCompanyInfo } = location.state || {};
  const [companyInfo, setCompanyInfo] = useState(originalCompanyInfo);
  
  const { slug: slugFromUrl } = useParams();
  const slug = slugFromUrl || companyInfo?.slug || '';

  useEffect(() => {
    const fetchCompanyPaymentMethods = async () => {
      if (!originalCompanyInfo?.id) return;

      const q = collection(db, 'paymentMethods');
      const snap = await getDocs(q);
      const list = snap.docs
        .map(doc => doc.data())
        .filter(pm => pm.companyId === originalCompanyInfo.id);

      const methods: Record<string, {
        url: string,
        logoUrl: string,
        ussdPattern: string,
        merchantNumber: string
      }> = {};

      list.forEach(pm => {
        const key = pm.name.toLowerCase().replace(/\s+/g, '_');
        methods[key] = {
          url: pm.defaultPaymentUrl || '',
          logoUrl: pm.logoUrl || '',
          ussdPattern: pm.ussdPattern || '',
          merchantNumber: pm.merchantNumber || ''
        };
      });

      setCompanyInfo({
        ...originalCompanyInfo,
        paymentMethods: methods
      });
    };

    fetchCompanyPaymentMethods();
  }, [originalCompanyInfo]);
  
  if (!location.state || !tripData || !companyInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white p-4">
        <div className="text-center max-w-sm">
          <h2 className="text-lg font-semibold mb-2 text-red-600">Erreur</h2>
          <p className="text-gray-600 mb-4">Données de trajet manquantes. Veuillez recommencer depuis la page d'accueil.</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const [loading, setLoading] = useState(false);
  const [passengerData, setPassengerData] = useState<PassengerData>({
    fullName: '',
    phone: '',
    email: '',
  });

  const [seatsGo, setSeatsGo] = useState(1);
  const [seatsReturn, setSeatsReturn] = useState(1);
  const [tripType, setTripType] = useState<'aller_simple' | 'aller_retour'>('aller_simple');
  const unitPrice = Number(tripData?.price || 0);
  const [totalCost, setTotalCost] = useState(unitPrice);

  const themeConfig = {
    colors: {
      primary: companyInfo?.primaryColor || '#3b82f6',
      secondary: companyInfo?.secondaryColor || '#93c5fd',
      text: companyInfo?.primaryColor ? safeTextColor(companyInfo.primaryColor) : '#ffffff',
      background: '#ffffff'
    },
    classes: {
      card: 'bg-white rounded-xl shadow-sm border border-gray-200',
      button: 'transition-all hover:scale-105 active:scale-95',
      animations: 'transition-all duration-300 ease-in-out',
      header: 'sticky top-0 z-50 px-4 py-3'
    }
  };

  const { colors, classes } = themeConfig;

  useEffect(() => {
    const go = seatsGo || 0;
    const ret = tripType === 'aller_retour' ? (seatsReturn || 0) : 0;
    setTotalCost(unitPrice * (go + ret));
  }, [seatsGo, seatsReturn, tripType, unitPrice]);

  const handlePassengerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPassengerData(prev => ({ ...prev, [name]: value }));
  };

  const handleSeatsChange = (type: 'go' | 'return', value: number) => {
    const clampedValue = Math.max(1, Math.min(10, value));
    if (type === 'go') setSeatsGo(clampedValue);
    else setSeatsReturn(clampedValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);

  try {
    if (!passengerData.fullName || !passengerData.phone) {
      throw new Error('Veuillez remplir tous les champs obligatoires');
    }

    const totalDemandées = seatsGo + (tripType === 'aller_retour' ? seatsReturn : 0);
    const referenceCode = `RES${Date.now()}`;
    const trajetId = `${tripData.id}-${tripData.date}-${tripData.time.replace(/\s+/g, '')}`;

    const reservationsQuery = query(
      collection(db, 'reservations'),
      where('trajetId', '==', trajetId),
      where('statut', 'in', ['payé', 'preuve_recue'])
    );

    const reservationsSnap = await getDocs(reservationsQuery);
    const réservées = reservationsSnap.docs.reduce((acc, doc) => {
      const res = doc.data();
      return acc + (res.seatsGo || 1) + (res.seatsReturn || 0);
    }, 0);

    const placesRestantes = (tripData.places || 0) - réservées;
    if (placesRestantes < totalDemandées) {
      throw new Error(`Il ne reste que ${placesRestantes} place(s) disponible(s)`);
    }

    const reservationDraft = {
      nomClient: passengerData.fullName,
      telephone: passengerData.phone,
      email: passengerData.email,
      depart: tripData.departure,
      arrivee: tripData.arrival,
      date: tripData.date,
      heure: tripData.time,
      montant: totalCost,
      seatsGo,
      seatsReturn: tripType === 'aller_retour' ? seatsReturn : 0,
      tripType,
      canal: 'en_ligne',
      statut: 'en_attente',
      companyId: tripData.companyId,
      agencyId: tripData.agencyId,
      trajetId,
      referenceCode,
      commission: totalCost * 0.05,
      companySlug: slug,
      companyName: companyInfo.nom,
      primaryColor: companyInfo.primaryColor,
      tripData,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Ajout du document et récupération de la référence
    const docRef = await addDoc(collection(db, 'reservations'), reservationDraft);
    
    // Mise à jour cruciale : ajout de l'ID au draft avant navigation
    const draftWithId = {
      ...reservationDraft,
      id: docRef.id // Ajout de l'ID généré par Firestore
    };

    navigate(`/compagnie/${slug}/reservation/upload-preuve/${docRef.id}`, {
      state: {
        companyInfo,
        draft: draftWithId // Envoi du draft COMPLET avec ID
      }
    });

  } catch (error: any) {
    alert(error.message);
  } finally {
    setLoading(false);
  }
};

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  };

  return (
    <div className="min-h-screen" style={{ background: colors.background }}>
      <header className={classes.header} style={{
        backgroundColor: hexToRgba(colors.primary, 0.95),
        backdropFilter: 'blur(10px)'
      }}>
        <div className="flex items-center gap-4 max-w-7xl mx-auto">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-white/10 transition"
            style={{ color: safeTextColor(colors.primary) }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-2">
            {companyInfo?.logoUrl && (
              <LazyLoadImage 
                src={companyInfo.logoUrl} 
                alt={`Logo ${companyInfo.nom}`}
                effect="blur"
                className="h-8 w-8 rounded-full object-cover border-2"
                style={{ 
                  borderColor: safeTextColor(colors.primary),
                  backgroundColor: hexToRgba(colors.primary, 0.2)
                }}
              />
            )}
            <h1 className="text-lg font-bold" style={{ color: safeTextColor(colors.primary) }}>
              Réservation
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        <div className={`p-4 rounded-xl mb-4 ${classes.card}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="text-lg font-bold" style={{ color: colors.primary }}>
                {tripData.departure} → {tripData.arrival}
              </h1>
              <div className="flex items-center gap-2 text-sm mt-1">
                <Calendar className="h-4 w-4 opacity-70" />
                <span>{formatDateDisplay(tripData.date)}</span>
                <Clock className="h-4 w-4 opacity-70 ml-2" />
                <span>{tripData.time}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm opacity-80">Prix unitaire</div>
              <div className="font-bold">{unitPrice.toLocaleString()} FCFA</div>
            </div>
          </div>
        </div>

        <div className={`rounded-xl overflow-hidden ${classes.card}`}>
          <div className="p-4">
            <h2 className="text-lg font-bold mb-4" style={{ color: colors.primary }}>
              Informations du passager
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Nom complet *</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 opacity-70" />
                    <input
                      type="text"
                      name="fullName"
                      value={passengerData.fullName}
                      onChange={handlePassengerChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                      style={{ 
                        borderColor: hexToRgba(colors.primary, 0.3),
                      }}
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Téléphone *</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 opacity-70" />
                    <input
                      type="tel"
                      name="phone"
                      value={passengerData.phone}
                      onChange={handlePassengerChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                      style={{ 
                        borderColor: hexToRgba(colors.primary, 0.3),
                      }}
                      required
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 opacity-70" />
                    <input
                      type="email"
                      name="email"
                      value={passengerData.email}
                      onChange={handlePassengerChange}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                      style={{ 
                        borderColor: hexToRgba(colors.primary, 0.3),
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <h3 className="text-sm font-medium mb-2">Type de voyage</h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    className={`py-2 px-3 rounded-lg text-sm border ${
                      tripType === 'aller_simple' ? 'border-blue-500 bg-blue-50 font-medium' : 'border-gray-200'
                    }`}
                    onClick={() => setTripType('aller_simple')}
                    style={{
                      borderColor: tripType === 'aller_simple' ? colors.primary : undefined,
                      backgroundColor: tripType === 'aller_simple' ? hexToRgba(colors.primary, 0.1) : undefined
                    }}
                  >
                    Aller simple
                  </button>
                  <button
                    type="button"
                    className={`py-2 px-3 rounded-lg text-sm border ${
                      tripType === 'aller_retour' ? 'border-blue-500 bg-blue-50 font-medium' : 'border-gray-200'
                    }`}
                    onClick={() => setTripType('aller_retour')}
                    style={{
                      borderColor: tripType === 'aller_retour' ? colors.primary : undefined,
                      backgroundColor: tripType === 'aller_retour' ? hexToRgba(colors.primary, 0.1) : undefined
                    }}
                  >
                    Aller-retour
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <h3 className="text-sm font-medium mb-2">Nombre de places</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1 opacity-80">Aller</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="p-1 w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                        onClick={() => handleSeatsChange('go', seatsGo - 1)}
                        disabled={seatsGo <= 1}
                      >
                        -
                      </button>
                      <div className="flex-1 text-center font-medium py-1 border border-gray-200 rounded-lg">
                        {seatsGo}
                      </div>
                      <button
                        type="button"
                        className="p-1 w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                        onClick={() => handleSeatsChange('go', seatsGo + 1)}
                        disabled={seatsGo >= 10}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  
                  {tripType === 'aller_retour' && (
                    <div>
                      <label className="block text-xs mb-1 opacity-80">Retour</label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="p-1 w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                          onClick={() => handleSeatsChange('return', seatsReturn - 1)}
                          disabled={seatsReturn <= 1}
                        >
                          -
                        </button>
                        <div className="flex-1 text-center font-medium py-1 border border-gray-200 rounded-lg">
                          {seatsReturn}
                        </div>
                        <button
                          type="button"
                          className="p-1 w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                          onClick={() => handleSeatsChange('return', seatsReturn + 1)}
                          disabled={seatsReturn >= 10}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium">Total:</span>
                  <span className="text-lg font-bold">{totalCost.toLocaleString()} FCFA</span>
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  {unitPrice.toLocaleString()} FCFA × {seatsGo} place(s){' '}
                  {tripType === 'aller_retour' && `+ ${seatsReturn} place(s)`}
                </div>
                
                <button
                  type="submit"
                  className={`w-full py-3 px-4 rounded-lg font-medium ${classes.button}`}
                  style={{
                    backgroundColor: colors.primary,
                    color: colors.text
                  }}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Traitement...
                    </span>
                  ) : (
                    'Passer au paiement'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FormulaireReservationClient;