import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, Timestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ChevronLeft, Clock, MapPin, Calendar, Users, Ticket, User, Phone, Mail } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { hexToRgba, safeTextColor } from '../utils/color';

interface PassengerData {
  fullName: string;
  phone: string;
  email: string;
}

const FormulaireReservationClient: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug = '' } = useParams();

  const { tripData, companyInfo } = location.state || {};
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

  // Configuration du thème basée sur companyInfo
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

  if (!tripData || !tripData.id) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: colors.background }}>
        <div className={`p-6 rounded-xl text-center ${classes.card}`}>
          <div className="bg-gray-100 p-4 rounded-full inline-flex mb-3">
            <Clock className="h-6 w-6 text-gray-500" />
          </div>
          <h3 className="text-lg font-medium mb-1">Données du voyage introuvables</h3>
          <button
            onClick={() => navigate('/')}
            className={`mt-4 px-4 py-2 rounded-lg ${classes.button}`}
            style={{ backgroundColor: colors.primary, color: colors.text }}
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const handlePassengerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPassengerData(prev => ({ ...prev, [name]: value }));
  };

  const handleSeatsChange = (type: 'go' | 'return', value: number) => {
    const clampedValue = Math.max(1, Math.min(10, value));
    if (type === 'go') setSeatsGo(clampedValue);
    else setSeatsReturn(clampedValue);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      if (!passengerData.fullName || !passengerData.phone) {
        throw new Error('Veuillez remplir tous les champs obligatoires');
      }

      const trajetRef = doc(db, 'dailyTrips', tripData.id);
      const trajetSnap = await getDoc(trajetRef);
      
      if (!trajetSnap.exists()) {
        throw new Error('Trajet introuvable');
      }

      const trajet = trajetSnap.data();
      const placesRestantes = trajet.places || 0;
      const totalPlacesDemandées = seatsGo + (tripType === 'aller_retour' ? seatsReturn : 0);

      if (placesRestantes < totalPlacesDemandées) {
        throw new Error(`Il ne reste que ${placesRestantes} place(s) disponible(s)`);
      }

      const booking = {
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
        statut: 'payé',
        createdAt: Timestamp.now(),
        companyId: tripData.companyId,
        agencyId: tripData.agencyId,
        trajetId: tripData.id,
        paiement: 'mobile_money',
        commission: totalCost * 0.05,
        companySlug: slug,
      };

      const docRef = await addDoc(collection(db, 'reservations'), booking);
      await updateDoc(trajetRef, {
        places: placesRestantes - totalPlacesDemandées
      });

      navigate(`/reservation-confirmation/${docRef.id}`, { 
        state: { 
          slug: slug,
          reservation: {
            ...booking,
            id: docRef.id,
            companyName: companyInfo?.nom
          }
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
    <div 
      className="min-h-screen" 
      style={{ 
        background: colors.background,
        color: safeTextColor(colors.background)
      }}
    >
      <header 
        className={classes.header}
        style={{
          backgroundColor: hexToRgba(colors.primary, 0.95),
          backdropFilter: 'blur(10px)'
        }}
      >
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
            <h1 
              className="text-lg font-bold"
              style={{ color: safeTextColor(colors.primary) }}
            >
              Réservation
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {/* Récapitulatif compact du trajet */}
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

        {/* Formulaire compact */}
        <div className={`rounded-xl overflow-hidden ${classes.card}`}>
          <div className="p-4">
            <h2 className="text-lg font-bold mb-4" style={{ color: colors.primary }}>
              Informations du passager
            </h2>
            
            <form onSubmit={handlePayment} className="space-y-4">
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
                    'Payer avec Mobile Money'
                  )}
                </button>
                
                <div className="mt-2 text-center text-xs text-gray-500">
                  <p>Moyen de paiement mobile money obligatoire</p>
                  <div className="mt-1 inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-200">
                    <svg className="h-3 w-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Paiement sécurisé
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
};

export default FormulaireReservationClient;