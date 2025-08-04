import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { setDoc, doc, getDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ChevronLeft, Clock, Calendar, User, Phone, Mail, AlertCircle } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { v4 as uuidv4 } from 'uuid';

interface PassengerData {
  fullName: string;
  phone: string;
  email: string;
}

interface PaymentMethod {
  url: string;
  logoUrl: string;
  ussdPattern: string;
  merchantNumber: string;
}

interface CompanyInfo {
  id: string;
  slug: string;
  nom: string;
  logoUrl?: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  paymentMethods?: Record<string, PaymentMethod>;
}

interface TripData {
  id: string;
  companyId: string;
  agencyId: string;
  departure: string;
  arrival: string;
  date: string;
  time: string;
  price: number;
  places: number;
  remainingSeats?: number;
}

const hexToRgba = (hex: string, alpha: number = 1): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const safeTextColor = (hexColor: string): string => {
  if (!hexColor || hexColor.length < 7) return '#000000';
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
};

const FormulaireReservationClient: React.FC<{ company: CompanyInfo }> = ({ company: propCompany }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();

  const [tripData, setTripData] = useState<TripData | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>(propCompany);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [passengerData, setPassengerData] = useState<PassengerData>({
    fullName: '',
    phone: '',
    email: '',
  });

  const [seatsGo, setSeatsGo] = useState(1);
  const [tripType] = useState<'aller_simple'>('aller_simple');

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        if (location.state?.tripData) {
          validateTripData(location.state.tripData);
          return;
        }

        const saved = sessionStorage.getItem('reservationDraft');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.tripData) {
            validateTripData(parsed.tripData);
          }
        }

        if (!propCompany?.id) {
          const savedCompany = sessionStorage.getItem('companyInfo');
          if (savedCompany) {
            setCompanyInfo(prev => ({ ...prev, ...JSON.parse(savedCompany) }));
          }
        }
      } catch (err) {
        console.error("Erreur de chargement initial:", err);
        setError("Erreur de chargement des données");
      }
    };

    const validateTripData = (data: any) => {
      const requiredFields = ['id', 'companyId', 'agencyId', 'departure', 'arrival', 'date', 'time', 'price', 'places'];
      const missingFields = requiredFields.filter(field => !data[field]);
      
      if (missingFields.length > 0) {
        setError(`Données de trajet incomplètes. Champs manquants: ${missingFields.join(', ')}`);
        return;
      }

      setTripData({
        id: data.id,
        companyId: data.companyId,
        agencyId: data.agencyId,
        departure: data.departure,
        arrival: data.arrival,
        date: data.date,
        time: data.time,
        price: Number(data.price),
        places: Number(data.places),
        remainingSeats: Number(data.remainingSeats) || undefined
      });

      sessionStorage.setItem('reservationDraft', JSON.stringify({
        tripData: data,
        companyInfo: location.state?.companyInfo || propCompany
      }));
    };

    loadInitialData();
  }, [location.state, propCompany]);

  const unitPrice = useMemo(() => tripData?.price || 0, [tripData]);
  const totalCost = useMemo(() => unitPrice * seatsGo, [unitPrice, seatsGo]);

  const themeConfig = useMemo(() => {
    const primary = companyInfo.couleurPrimaire || '#3b82f6';
    const secondary = companyInfo.couleurSecondaire || '#93c5fd';
    
    return {
      colors: {
        primary,
        secondary,
        text: safeTextColor(primary),
        background: '#ffffff'
      },
      classes: {
        card: 'bg-white rounded-xl shadow-sm border border-gray-200',
        button: 'transition-all hover:scale-105 active:scale-95',
        animations: 'transition-all duration-300 ease-in-out',
        header: 'sticky top-0 z-50 px-4 py-3'
      }
    };
  }, [companyInfo]);

  const { colors, classes } = themeConfig;

  const handlePassengerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPassengerData(prev => ({ ...prev, [name]: value }));
  };

  const handleSeatsChange = (value: number) => {
    const clampedValue = Math.max(1, Math.min(10, value));
    setSeatsGo(clampedValue);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!tripData || !tripData.id || !tripData.companyId || !tripData.agencyId) {
        throw new Error("Données de trajet incomplètes. Veuillez recommencer.");
      }

      if (!passengerData.fullName || !passengerData.phone) {
        throw new Error("Veuillez remplir tous les champs obligatoires");
      }

      if (tripData.remainingSeats !== undefined && tripData.remainingSeats < seatsGo) {
        throw new Error(`Il ne reste que ${tripData.remainingSeats} place(s) disponible(s).`);
      }

      const reservationId = uuidv4();
      const referenceCode = `RES-${Date.now()}`;

      const agenceRef = doc(db, 'companies', tripData.companyId, 'agences', tripData.agencyId);
      const agenceSnap = await getDoc(agenceRef);
      const agenceData = agenceSnap.exists() ? agenceSnap.data() : {};

      const reservationDoc = {
        id: reservationId,
        nomClient: passengerData.fullName,
        telephone: passengerData.phone,
        email: passengerData.email,
        depart: tripData.departure,
        arrivee: tripData.arrival,
        date: tripData.date,
        heure: tripData.time,
        montant: totalCost,
        seatsGo,
        seatsReturn: 0,
        tripType,
        canal: 'en_ligne',
        statut: 'en_attente',
        companyId: tripData.companyId,
        agencyId: tripData.agencyId,
        agencyNom: agenceData.nomAgence || agenceData.nom || '',
        agencyTelephone: agenceData.telephone || '',
        trajetId: tripData.id,
        referenceCode,
        companySlug: slug,
        companyName: companyInfo.nom,
        primaryColor: companyInfo.couleurPrimaire,
        secondaryColor: companyInfo.couleurSecondaire,
        tripData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const reservationRef = doc(
        db,
        'companies',
        tripData.companyId,
        'agences',
        tripData.agencyId,
        'reservations',
        reservationId
      );

      await setDoc(reservationRef, reservationDoc);

      sessionStorage.setItem('reservationDraft', JSON.stringify(reservationDoc));
      navigate(`/${slug}/upload-preuve/${reservationId}`, {
        state: {
          companyInfo,
          reservation: reservationDoc
        }
      });

    } catch (err: any) {
      console.error("Erreur réservation:", err);
      setError(err.message || "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const formatDateDisplay = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
      });
    } catch {
      return dateStr;
    }
  };

  if (!tripData || !tripData.id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 text-center">
        <div className={`p-6 rounded-lg max-w-md ${classes.card}`}>
          <AlertCircle className="h-12 w-12 mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-bold mb-2 text-gray-900">Données manquantes</h2>
          <p className="text-gray-700 mb-4">
            {error || "Les informations du trajet sont introuvables. Veuillez recommencer votre recherche."}
          </p>
          <button
            onClick={() => navigate(`/${slug}`)}
            className={`mt-4 px-4 py-2 rounded ${classes.button}`}
            style={{ backgroundColor: colors.primary, color: colors.text }}
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: colors.background }}>
      <header className={classes.header} style={{
        backgroundColor: hexToRgba(colors.primary, 0.95),
        color: colors.text,
        backdropFilter: 'blur(10px)'
      }}>
        <div className="flex items-center gap-4 max-w-7xl mx-auto">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-white/10 transition"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-2">
            {companyInfo.logoUrl && (
              <LazyLoadImage 
                src={companyInfo.logoUrl} 
                alt={`Logo ${companyInfo.nom}`}
                effect="blur"
                className="h-8 w-8 rounded-full object-cover border-2"
                style={{ borderColor: colors.text }}
              />
            )}
            <h1 className="text-lg font-bold">Réservation</h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4">
        {error && (
          <div className={`p-4 mb-4 rounded-lg bg-red-50 text-red-600 ${classes.card}`}>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className={`p-4 rounded-xl mb-4 ${classes.card}`}>
          <div className="flex flex-row flex-wrap items-center justify-between gap-4">
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
                      className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      style={{ borderColor: hexToRgba(colors.primary, 0.3) }}
                      required
                      minLength={2}
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
                      className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      style={{ borderColor: hexToRgba(colors.primary, 0.3) }}
                      required
                      pattern="[0-9]{10,15}"
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
                      className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      style={{ borderColor: hexToRgba(colors.primary, 0.3) }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <h3 className="text-sm font-medium mb-2">Nombre de places</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs mb-1 opacity-80">Aller</label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSeatsChange(seatsGo - 1)}
                        disabled={seatsGo <= 1}
                        className="p-1 w-8 h-8 rounded-lg border hover:bg-gray-50 flex items-center justify-center disabled:opacity-50"
                        style={{ borderColor: hexToRgba(colors.primary, 0.3) }}
                      >
                        -
                      </button>
                      <div className="flex-1 text-center font-medium py-1 border rounded-lg"
                        style={{ borderColor: hexToRgba(colors.primary, 0.2) }}>
                        {seatsGo}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSeatsChange(seatsGo + 1)}
                        disabled={seatsGo >= 10}
                        className="p-1 w-8 h-8 rounded-lg border hover:bg-gray-50 flex items-center justify-center disabled:opacity-50"
                        style={{ borderColor: hexToRgba(colors.primary, 0.3) }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium">Total:</span>
                  <span className="text-lg font-bold">{totalCost.toLocaleString()} FCFA</span>
                </div>
                <div className="text-xs text-gray-500 mb-3">
                  {unitPrice.toLocaleString()} FCFA × {seatsGo} place(s)
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
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Traitement...
                    </span>
                  ) : (
                    'Réserver maintenant'
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