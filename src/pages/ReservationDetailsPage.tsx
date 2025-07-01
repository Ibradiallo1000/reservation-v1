import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { doc, onSnapshot, getDocs, collection, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ChevronLeft, Clock, MapPin, Calendar, CheckCircle, XCircle, Loader2, Users, User, ArrowRight, Upload } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { hexToRgba, safeTextColor } from '../utils/color';

type ReservationStatus = 'en_attente' | 'paiement_en_cours' | 'preuve_reçue' | 'payé' | 'annulé';

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
  companyName?: string;
}

interface PaymentMethod {
  id: string;
  name: string;
  logoUrl: string;
  merchantNumber: string;
  defaultPaymentUrl: string;
  companyId: string;
}

const STATUS_DISPLAY: Record<ReservationStatus, { text: string; color: string; icon: React.ReactNode }> = {
  'en_attente': {
    text: 'En attente de paiement',
    color: 'bg-yellow-100 text-yellow-800',
    icon: <Loader2 className="h-5 w-5 animate-spin" />
  },
  'paiement_en_cours': {
    text: 'Paiement en cours',
    color: 'bg-blue-100 text-blue-800',
    icon: <Loader2 className="h-5 w-5 animate-spin" />
  },
  'preuve_reçue': {
    text: 'Preuve reçue',
    color: 'bg-purple-100 text-purple-800',
    icon: <Upload className="h-5 w-5" />
  },
  'payé': {
    text: 'Paiement confirmé',
    color: 'bg-green-100 text-green-800',
    icon: <CheckCircle className="h-5 w-5" />
  },
  'annulé': {
    text: 'Annulé',
    color: 'bg-red-100 text-red-800',
    icon: <XCircle className="h-5 w-5" />
  }
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

  // Chargement en temps réel de la réservation
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

  // Chargement des méthodes de paiement
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
    if (!selectedMethod || !reservation) return;

    try {
      setLoading(true);
      
      // Mettre à jour le statut avant redirection
      await updateDoc(doc(db, 'reservations', id!), {
        statut: 'paiement_en_cours',
        paymentMethod: selectedMethod.name,
        paymentMethodId: selectedMethod.id,
        updatedAt: new Date()
      });

      // Ouvrir le paiement dans un nouvel onglet
      const paymentUrl = selectedMethod.defaultPaymentUrl
        .replace('{amount}', reservation.montant.toString())
        .replace('{reference}', reservation.referenceCode);
      
      window.open(paymentUrl, '_blank');

      // Rediriger vers la page de preuve
      navigate(`/reservation/${id}/preuve`, {
        state: {
          slug,
          reservation,
          paymentMethod: selectedMethod,
          companyInfo
        }
      });

    } catch (err) {
      console.error("Erreur lors du paiement:", err);
      alert("Une erreur est survenue lors du paiement");
    } finally {
      setLoading(false);
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
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin h-12 w-12 text-blue-600" />
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <XCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="text-xl font-bold mt-4 text-red-600">Erreur</h1>
          <p className="mt-2 text-gray-600">{error || "Réservation introuvable"}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const statusInfo = STATUS_DISPLAY[reservation.statut];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* En-tête */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">Détails de votre réservation</h1>
            <p className="text-sm text-gray-600">{reservation.referenceCode}</p>
          </div>
          {companyInfo?.logoUrl && (
            <LazyLoadImage 
              src={companyInfo.logoUrl}
              alt={companyInfo.nom}
              effect="blur"
              className="h-10 w-10 rounded-full object-cover border"
            />
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6 pb-20">
        {/* Carte d'état */}
        <div className={`p-4 rounded-lg ${statusInfo.color} flex items-center gap-3`}>
          <div className="flex-shrink-0">
            {statusInfo.icon}
          </div>
          <div>
            <h2 className="font-bold">{statusInfo.text}</h2>
            <p className="text-sm opacity-90">
              {reservation.statut === 'payé' 
                ? 'Votre réservation est confirmée' 
                : reservation.statut === 'preuve_reçue' 
                  ? 'Votre preuve est en cours de vérification' 
                  : 'Suivez les étapes pour compléter votre réservation'}
            </p>
          </div>
        </div>

        {/* Récapitulatif du trajet */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            <span>Votre trajet</span>
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-900">{reservation.depart}</p>
                <p className="text-sm text-gray-600">Départ</p>
              </div>
              <ArrowRight className="h-5 w-5 text-gray-400" />
              <div className="text-right">
                <p className="font-medium text-gray-900">{reservation.arrivee}</p>
                <p className="text-sm text-gray-600">Arrivée</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-sm text-gray-600">Date</p>
                <p className="font-medium">{formatDate(reservation.date)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Heure</p>
                <p className="font-medium">{reservation.heure}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
              <div>
                <p className="text-sm text-gray-600">Passagers</p>
                <p className="font-medium">
                  {reservation.seatsGo} aller
                  {reservation.tripType === 'aller_retour' && ` + ${reservation.seatsReturn} retour`}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Montant total</p>
                <p className="font-bold">{reservation.montant.toLocaleString()} FCFA</p>
              </div>
            </div>
          </div>
        </div>

        {/* Informations passager */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            <span>Informations passager</span>
          </h2>
          
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-600">Nom complet</p>
              <p className="font-medium">{reservation.nomClient}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Téléphone</p>
              <p className="font-medium">{reservation.telephone}</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        {reservation.statut === 'en_attente' && paymentMethods.length > 0 && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-lg font-bold mb-4">Procéder au paiement</h2>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Méthode de paiement</p>
                <div className="grid grid-cols-2 gap-3">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setSelectedMethod(method)}
                      className={`p-3 rounded-lg border flex items-center gap-2 transition ${
                        selectedMethod?.id === method.id 
                          ? 'border-blue-500 bg-blue-50' 
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
                      <span className="text-sm">{method.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={handlePayment}
                disabled={!selectedMethod || loading}
                className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition flex items-center justify-center gap-2"
              >
                {loading ? (
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
              </button>

              <button
                onClick={() => navigate(`/reservation/${id}/preuve`, {
                  state: {
                    slug,
                    reservation,
                    companyInfo
                  }
                })}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition flex items-center justify-center gap-2"
              >
                <Upload className="h-4 w-4" />
                <span>J'ai déjà payé</span>
              </button>
            </div>
          </div>
        )}

        {reservation.statut === 'paiement_en_cours' && (
          <button
            onClick={() => navigate(`/reservation/${id}/preuve`, {
              state: {
                slug,
                reservation,
                companyInfo
              }
            })}
            className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition flex items-center justify-center gap-2"
          >
            <Upload className="h-4 w-4" />
            <span>Téléverser la preuve de paiement</span>
          </button>
        )}

        {reservation.statut === 'payé' && (
          <button
            onClick={() => navigate(`/compagnie/${slug}/receipt/${id}`, {
              state: {
                reservation,
                companyInfo
              }
            })}
            className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="h-4 w-4" />
            <span>Voir mon reçu</span>
          </button>
        )}
      </main>
    </div>
  );
};

export default ReservationDetailsPage;