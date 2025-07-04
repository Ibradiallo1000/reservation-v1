import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot, getDocs, collection, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ChevronLeft, Clock, MapPin, Calendar, CheckCircle, XCircle, Loader2, Users, User, ArrowRight, Upload, CreditCard, Wallet } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { motion } from 'framer-motion';
import { hexToRgba, safeTextColor } from '../utils/color';

type ReservationStatus = 'en_attente' | 'paiement_en_cours' | 'preuve_recue' | 'paye' | 'annule';

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  montant: number;
  seatsGo: number;
  seatsReturn: number;
  tripType: string;
  statut: ReservationStatus;
  referenceCode: string;
  companyId: string;
  companySlug: string;
  companyName?: string;
  primaryColor?: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  logoUrl: string;
  merchantNumber: string;
  defaultPaymentUrl: string;
  companyId: string;
}

interface CompanyInfo {
  id: string;
  name: string;
  primaryColor?: string;
  logoUrl?: string;
}

const STATUS_DISPLAY: Record<ReservationStatus, { text: string; color: string; icon: React.ReactNode }> = {
  'en_attente': {
    text: 'En attente de paiement',
    color: 'bg-amber-50 text-amber-800 border-amber-200',
    icon: <Loader2 className="h-5 w-5 animate-spin" />
  },
  'paiement_en_cours': {
    text: 'Paiement en cours',
    color: 'bg-blue-50 text-blue-800 border-blue-200',
    icon: <Loader2 className="h-5 w-5 animate-spin" />
  },
  'preuve_recue': {
    text: 'Preuve reçue',
    color: 'bg-violet-50 text-violet-800 border-violet-200',
    icon: <Upload className="h-5 w-5" />
  },
  'paye': {
    text: 'Paiement confirmé',
    color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    icon: <CheckCircle className="h-5 w-5" />
  },
  'annule': {
    text: 'Annulé',
    color: 'bg-red-50 text-red-800 border-red-200',
    icon: <XCircle className="h-5 w-5" />
  }
};

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } }
};

const ReservationDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const { slug, companyInfo } = location.state || {};

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);

  // Theme configuration
  const themeConfig = {
    colors: {
      primary: reservation?.primaryColor || companyInfo?.primaryColor || '#3b82f6',
      text: reservation?.primaryColor || companyInfo?.primaryColor 
        ? safeTextColor(reservation?.primaryColor || companyInfo?.primaryColor) 
        : '#ffffff',
    }
  };

  useEffect(() => {
    if (!id) {
      setError("ID de réservation manquant");
      setLoading(false);
      return;
    }

    const unsub = onSnapshot(doc(db, 'reservations', id), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Reservation;
        setReservation({
          ...data,
          id: doc.id
        });
        setLoading(false);
      } else {
        setError("Réservation introuvable");
        setLoading(false);
      }
    }, (err) => {
      setError("Erreur de chargement");
      console.error("Erreur Firestore:", err);
      setLoading(false);
    });

    return () => unsub();
  }, [id]);

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      try {
        const snapshot = await getDocs(collection(db, "paymentMethods"));
        const methods = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as PaymentMethod))
          .filter(m => m.companyId === reservation?.companyId);
        
        setPaymentMethods(methods);
        if (methods.length > 0) setSelectedMethod(methods[0]);
      } catch (err) {
        console.error("Erreur chargement méthodes paiement:", err);
      }
    };

    if (reservation?.companyId) fetchPaymentMethods();
  }, [reservation?.companyId]);

  const handlePayment = async () => {
    if (!selectedMethod || !reservation || !id) return;

    try {
      setLoadingPayment(true);
      
      const paymentUrl = selectedMethod.defaultPaymentUrl
        .replace('{amount}', reservation.montant.toString())
        .replace('{reference}', reservation.referenceCode);
      
      // Open payment in new tab first
      window.open(paymentUrl, '_blank');

      // Then update status
      await updateDoc(doc(db, 'reservations', id), {
        statut: 'paiement_en_cours',
        paymentMethod: selectedMethod.name,
        paymentMethodId: selectedMethod.id,
        updatedAt: new Date()
      });

      navigate(`/reservation/${id}/preuve`, {
        state: {
          slug: slug || reservation.companySlug,
          reservation,
          paymentMethod: selectedMethod,
          companyInfo
        }
      });

    } catch (err) {
      console.error("Erreur lors du paiement:", err);
      alert("Une erreur est survenue lors du paiement");
    } finally {
      setLoadingPayment(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
        >
          <Loader2 className="h-12 w-12 text-blue-600" />
        </motion.div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className="text-center max-w-md"
        >
          <XCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="text-xl font-bold mt-4 text-red-600">Erreur</h1>
          <p className="mt-2 text-gray-600">{error || "Réservation introuvable"}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-3 rounded-xl font-medium hover:shadow-md transition-all"
          >
            Retour à l'accueil
          </button>
        </motion.div>
      </div>
    );
  }

  const statusInfo = STATUS_DISPLAY[reservation.statut];
  const realSlug = slug || reservation.companySlug;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header with dynamic theme */}
      <header 
        className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-10 border-b border-gray-100"
        style={{
          backgroundColor: hexToRgba(themeConfig.colors.primary, 0.95),
          color: themeConfig.colors.text
        }}
      >
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-white/10 transition"
            style={{ color: themeConfig.colors.text }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Détails de réservation</h1>
            <p className="text-sm opacity-90">{reservation.referenceCode}</p>
          </div>
          {companyInfo?.logoUrl && (
            <LazyLoadImage 
              src={companyInfo.logoUrl}
              alt={companyInfo.name}
              effect="blur"
              className="h-10 w-10 rounded-lg object-cover border-2"
              style={{ 
                borderColor: themeConfig.colors.text,
                backgroundColor: hexToRgba(themeConfig.colors.primary, 0.2)
              }}
            />
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6 pb-20">
        {/* Status card */}
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          className={`p-4 rounded-xl border ${statusInfo.color} flex items-center gap-3 shadow-xs`}
        >
          <div className="flex-shrink-0">
            {statusInfo.icon}
          </div>
          <div>
            <h2 className="font-bold">{statusInfo.text}</h2>
            <p className="text-sm opacity-90">
              {reservation.statut === 'paye' 
                ? 'Votre réservation est confirmée' 
                : reservation.statut === 'preuve_recue' 
                  ? 'Votre preuve est en cours de vérification' 
                  : 'Suivez les étapes pour compléter votre réservation'}
            </p>
          </div>
        </motion.div>

        {/* Trip details card */}
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          transition={{ delay: 0.1 }}
          className="bg-white p-6 rounded-xl shadow-xs border border-gray-100"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-600" />
              <span>Votre trajet</span>
            </h2>
            <span className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
              {reservation.tripType === 'aller_retour' ? 'Aller-retour' : 'Aller simple'}
            </span>
          </div>
          
          <div className="space-y-5">
            {/* Trip route visualization */}
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
                  <MapPin className="h-5 w-5 text-blue-600" />
                </div>
                <p className="font-semibold text-gray-900">{reservation.depart}</p>
                <p className="text-xs text-gray-500">Point de départ</p>
              </div>
              <div className="px-4">
                <div className="h-px w-8 bg-gray-300 relative">
                  <div className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-full border-2 border-blue-500 bg-white"></div>
                </div>
              </div>
              <div className="flex-1 text-right">
                <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center ml-auto mb-2">
                  <MapPin className="h-5 w-5 text-blue-600" />
                </div>
                <p className="font-semibold text-gray-900">{reservation.arrivee}</p>
                <p className="text-xs text-gray-500">Destination</p>
              </div>
            </div>

            {/* Date and time */}
            <div className="grid grid-cols-2 gap-4 pt-5 border-t border-gray-100">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Calendar className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Date</p>
                  <p className="font-medium text-gray-900">{formatDate(reservation.date)}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Heure</p>
                  <p className="font-medium text-gray-900">{reservation.heure}</p>
                </div>
              </div>
            </div>

            {/* Passengers and amount */}
            <div className="grid grid-cols-2 gap-4 pt-5 border-t border-gray-100">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Passagers</p>
                  <p className="font-medium text-gray-900">
                    {reservation.seatsGo} aller
                    {reservation.tripType === 'aller_retour' && ` + ${reservation.seatsReturn} retour`}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Wallet className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Montant total</p>
                  <p className="font-bold text-gray-900">{reservation.montant.toLocaleString()} FCFA</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Passenger info card */}
        <motion.div 
          initial="hidden"
          animate="visible"
          variants={fadeIn}
          transition={{ delay: 0.2 }}
          className="bg-white p-6 rounded-xl shadow-xs border border-gray-100"
        >
          <h2 className="text-lg font-bold mb-5 text-gray-900 flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            <span>Informations passager</span>
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <User className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Nom complet</p>
                <p className="font-medium text-gray-900">{reservation.nomClient}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <CreditCard className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Téléphone</p>
                <p className="font-medium text-gray-900">{reservation.telephone}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Payment section (only if pending) */}
        {reservation.statut === 'en_attente' && paymentMethods.length > 0 && (
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={fadeIn}
            transition={{ delay: 0.3 }}
            className="bg-white p-6 rounded-xl shadow-xs border border-gray-100"
          >
            <h2 className="text-lg font-bold mb-5 text-gray-900">Procéder au paiement</h2>
            
            <div className="space-y-5">
              <div>
                <p className="text-sm font-medium mb-3 text-gray-700">Méthode de paiement</p>
                <div className="grid grid-cols-2 gap-3">
                  {paymentMethods.map((method) => (
                    <motion.button
                      key={method.id}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setSelectedMethod(method)}
                      className={`p-3 rounded-xl border flex items-center gap-3 transition-all ${
                        selectedMethod?.id === method.id 
                          ? 'border-blue-500 bg-blue-50 shadow-xs' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {method.logoUrl && (
                        <LazyLoadImage 
                          src={method.logoUrl}
                          alt={method.name}
                          className="h-5 w-5 object-contain"
                          effect="blur"
                        />
                      )}
                      <span className="text-sm font-medium text-gray-800">{method.name}</span>
                    </motion.button>
                  ))}
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handlePayment}
                disabled={!selectedMethod || loadingPayment}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-medium hover:shadow-md transition-all flex items-center justify-center gap-2"
                style={{
                  backgroundColor: themeConfig.colors.primary,
                  color: themeConfig.colors.text
                }}
              >
                {loadingPayment ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Redirection...</span>
                  </>
                ) : (
                  <>
                    <span>Payer avec {selectedMethod?.name || '...'}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => navigate(`/reservation/${id}/preuve`, {
                  state: {
                    slug: realSlug,
                    reservation,
                    companyInfo
                  }
                })}
                className="w-full py-3.5 px-4 bg-white text-gray-800 rounded-xl font-medium border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Upload className="h-4 w-4" />
                <span>J'ai déjà payé</span>
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Upload proof button (if payment in progress) */}
        {reservation.statut === 'paiement_en_cours' && (
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => navigate(`/reservation/${id}/preuve`, {
              state: {
                slug: realSlug,
                reservation,
                companyInfo
              }
            })}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-xl font-medium hover:shadow-md transition-all flex items-center justify-center gap-2"
            style={{
              backgroundColor: themeConfig.colors.primary,
              color: themeConfig.colors.text
            }}
          >
            <Upload className="h-4 w-4" />
            <span>Téléverser la preuve de paiement</span>
          </motion.button>
        )}

        {/* View receipt button (if paid) */}
        {reservation.statut === 'paye' && (
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => navigate(`/compagnie/${realSlug}/receipt/${id}`, {
              state: {
                reservation,
                companyInfo
              }
            })}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-xl font-medium hover:shadow-md transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            <span>Voir mon reçu</span>
          </motion.button>
        )}
      </main>
    </div>
  );
};

export default ReservationDetailsPage;