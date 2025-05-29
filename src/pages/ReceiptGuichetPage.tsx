import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ReservationData {
  id: string;
  nomClient: string;
  telephone: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  seatsGo: number;
  seatsReturn?: number;
  montant: number;
  statut: string;
  paiement: 'espèces' | 'mobile_money';
  compagnieId: string;
  agenceId?: string;
  guichetier?: string;
  createdAt: { seconds: number; nanoseconds: number };
  canal: string;
}

interface CompagnieData {
  nom: string;
  logoUrl: string;
  couleurPrimaire: string;
  slug: string;
  signatureUrl?: string;
}

interface AgenceData {
  nom: string;
  logoUrl?: string;
  signatureUrl?: string;
}

const ReceiptGuichetPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [compagnie, setCompagnie] = useState<CompagnieData | null>(null);
  const [agence, setAgence] = useState<AgenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  // Formatage des dates en français
  const formatDate = (dateString: string | Date, formatStr: string) => {
    try {
      const date = typeof dateString === 'string' ? parseISO(dateString) : dateString;
      return format(date, formatStr, { locale: fr });
    } catch {
      return dateString.toString();
    }
  };

  // Génération du numéro de reçu
  const generateReceiptNumber = () => {
    if (!reservation) return 'GCH-000000';
    const date = new Date(reservation.createdAt?.seconds * 1000 || Date.now());
    const year = date.getFullYear();
    const num = reservation.id.slice(0, 6).toUpperCase();
    return `GCH-${year}-${num}`;
  };

  useEffect(() => {
    const fetchData = async () => {
      if (!id) {
        setError('ID de réservation manquant');
        setLoading(false);
        return;
      }

      try {
        // 1. Chargement de la réservation
        const reservationRef = doc(db, 'reservations', id);
        const reservationSnap = await getDoc(reservationRef);

        if (!reservationSnap.exists()) {
          setError('Réservation introuvable');
          setLoading(false);
          return;
        }

        const reservationData = reservationSnap.data() as ReservationData;
        reservationData.id = reservationSnap.id;
        setReservation(reservationData);

        // 2. Chargement des données compagnie
        if (reservationData.compagnieId) {
          const compagnieRef = doc(db, 'companies', reservationData.compagnieId);
          const compagnieSnap = await getDoc(compagnieRef);
          
          if (compagnieSnap.exists()) {
            const compagnieData = compagnieSnap.data() as CompagnieData;
            setCompagnie({
              nom: compagnieData.nom,
              logoUrl: compagnieData.logoUrl,
              couleurPrimaire: compagnieData.couleurPrimaire || '#3b82f6',
              slug: compagnieData.slug,
              signatureUrl: compagnieData.signatureUrl
            });
          } else {
            setError('Compagnie introuvable');
          }
        }

        // 3. Chargement des données agence (optionnel)
        if (reservationData.agenceId) {
          const agenceRef = doc(db, 'agences', reservationData.agenceId);
          const agenceSnap = await getDoc(agenceRef);
          
          if (agenceSnap.exists()) {
            const agenceData = agenceSnap.data() as AgenceData;
            setAgence({
              nom: agenceData.nom,
              logoUrl: agenceData.logoUrl,
              signatureUrl: agenceData.signatureUrl
            });
          }
        }

      } catch (e) {
        console.error('Erreur Firestore :', e);
        setError('Erreur lors du chargement des données');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  const handlePDF = () => {
    if (receiptRef.current) {
      const opt = {
        margin: 10,
        filename: `recu-${generateReceiptNumber()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          allowTaint: true
        },
        jsPDF: { unit: 'mm', format: 'a5', orientation: 'portrait' }
      };

      html2pdf()
        .set(opt)
        .from(receiptRef.current)
        .save();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-gray-600">Chargement du reçu...</p>
        </div>
      </div>
    );
  }

  if (error || !reservation || !compagnie) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-6 max-w-md bg-white rounded-lg shadow-md">
          <div className="text-red-500 mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Erreur</h2>
          <p className="text-gray-600 mb-6">{error || 'Données introuvables'}</p>
          <button 
            onClick={() => navigate(`/compagnie/${compagnie?.slug || 'default'}/guichet`)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Retour au guichet
          </button>
        </div>
      </div>
    );
  }

  const qrContent = JSON.stringify({
    receiptNumber: generateReceiptNumber(),
    compagnie: compagnie.nom,
    nom: reservation.nomClient,
    tel: reservation.telephone,
    date: reservation.date,
    heure: reservation.heure,
    depart: reservation.depart,
    arrivee: reservation.arrivee,
    places: `${reservation.seatsGo} aller${reservation.seatsReturn ? ` + ${reservation.seatsReturn} retour` : ''}`,
    montant: `${reservation.montant?.toLocaleString('fr-FR')} FCFA`,
    statut: reservation.statut,
    paiement: reservation.paiement
  });

  return (
    <div className="bg-gray-50 min-h-screen py-8 px-4 sm:px-6 print:bg-white print:py-0">
      <div 
        ref={receiptRef} 
        className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden print:shadow-none print:border-none print:rounded-none"
        style={{ borderTop: `8px solid ${compagnie.couleurPrimaire}` }}
      >
        {/* En-tête avec fond coloré */}
        <div 
          className="p-6"
          style={{ backgroundColor: compagnie.couleurPrimaire }}
        >
          <div className="flex justify-between items-start">
            {/* Logo agence + info émission */}
            <div className="flex flex-col items-start space-y-3">
              {agence?.logoUrl ? (
                <img 
                  src={agence.logoUrl} 
                  alt={`Agence ${agence.nom}`} 
                  className="h-12 object-contain bg-white p-1 rounded"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/default-agency.png';
                  }}
                />
              ) : agence?.nom ? (
                <div className="bg-white px-2 py-1 rounded">
                  <p className="text-xs font-medium">{agence.nom}</p>
                </div>
              ) : null}
              
              <div className="text-white text-xs bg-black bg-opacity-20 px-2 py-1 rounded">
                <p>Émis le {formatDate(new Date(reservation.createdAt.seconds * 1000), 'dd/MM/yyyy à HH:mm')}</p>
              </div>
            </div>

            {/* Logo compagnie */}
            <img 
              src={compagnie.logoUrl} 
              alt={compagnie.nom} 
              className="h-16 object-contain bg-white p-2 rounded-lg shadow"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src = '/default-company.png';
              }}
            />
          </div>

          {/* Titre principal */}
          <div className="mt-4 text-center">
            <h1 className="text-3xl font-extrabold text-white uppercase tracking-wide">
              {compagnie.nom}
            </h1>
            {agence?.nom && (
              <p className="text-white text-opacity-80 italic mt-1">
                {agence.nom}
              </p>
            )}
          </div>
        </div>

        {/* Corps du reçu */}
        <div className="p-6 sm:p-8">
          {/* Numéro de reçu et badge */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
            <div>
              <h2 className="text-2xl font-bold text-gray-800">Reçu de réservation</h2>
              <p className="text-sm text-gray-500">Numéro: {generateReceiptNumber()}</p>
            </div>
            
            <span 
              className="inline-block text-sm font-semibold px-3 py-1 rounded-full"
              style={{ 
                backgroundColor: `${compagnie.couleurPrimaire}20`, 
                color: compagnie.couleurPrimaire 
              }}
            >
              Réservation au guichet
            </span>
          </div>

          {/* Grille d'informations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Section Passager */}
            <div className="bg-gray-50 p-5 rounded-lg border">
              <h2 
                className="font-semibold text-lg mb-3" 
                style={{ color: compagnie.couleurPrimaire }}
              >
                Informations passager
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium text-gray-600">Nom complet :</span>
                  <span className="text-gray-800">{reservation.nomClient}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium text-gray-600">Téléphone :</span>
                  <span className="text-gray-800">{reservation.telephone}</span>
                </div>
                {reservation.guichetier && (
                  <div className="flex justify-between border-b pb-2">
                    <span className="font-medium text-gray-600">Guichetier :</span>
                    <span className="text-gray-800">{reservation.guichetier}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Section Voyage */}
            <div className="bg-gray-50 p-5 rounded-lg border">
              <h2 
                className="font-semibold text-lg mb-3" 
                style={{ color: compagnie.couleurPrimaire }}
              >
                Détails du voyage
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium text-gray-600">Trajet :</span>
                  <span className="text-gray-800">{reservation.depart} → {reservation.arrivee}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium text-gray-600">Date :</span>
                  <span className="text-gray-800">
                    {formatDate(reservation.date, 'EEEE dd MMMM yyyy')}
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium text-gray-600">Heure :</span>
                  <span className="text-gray-800">{reservation.heure}</span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium text-gray-600">Places :</span>
                  <span className="text-gray-800">
                    {reservation.seatsGo} aller
                    {reservation.seatsReturn ? ` + ${reservation.seatsReturn} retour` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Section Paiement */}
            <div className="bg-gray-50 p-5 rounded-lg border">
              <h2 
                className="font-semibold text-lg mb-3" 
                style={{ color: compagnie.couleurPrimaire }}
              >
                Détails de paiement
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium text-gray-600">Montant total :</span>
                  <span className="text-gray-800 font-bold">
                    {reservation.montant?.toLocaleString('fr-FR')} FCFA
                  </span>
                </div>
                <div className="flex justify-between border-b pb-2">
                  <span className="font-medium text-gray-600">Mode de paiement :</span>
                  <span className="text-gray-800 capitalize">
                    {reservation.paiement}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium text-gray-600">Statut :</span>
                  <span 
                    className={`px-2 py-1 rounded text-xs ${
                      reservation.statut === 'payé' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {reservation.statut}
                  </span>
                </div>
              </div>
            </div>

            {/* QR Code */}
            <div className="bg-gray-50 p-5 rounded-lg border flex flex-col items-center justify-center">
              <div className="mb-3 text-center">
                <h2 
                  className="font-semibold text-lg" 
                  style={{ color: compagnie.couleurPrimaire }}
                >
                  QR Code de validation
                </h2>
                <p className="text-xs text-gray-500 mt-1">
                  Présentez ce code à l'embarquement
                </p>
              </div>
              
              <div 
                className="bg-white p-3 rounded border-2" 
                style={{ borderColor: compagnie.couleurPrimaire }}
              >
                <QRCode 
                  value={qrContent} 
                  size={128}
                  fgColor={compagnie.couleurPrimaire}
                />
              </div>
              
              <p className="mt-3 text-xs text-gray-500 text-center">
                Numéro: {generateReceiptNumber()}
              </p>
            </div>
          </div>

          {/* Signature */}
          {(agence?.signatureUrl || compagnie.signatureUrl) && (
            <div className="mt-6 pt-4 border-t flex justify-end">
              <div className="text-center">
                <p className="text-sm text-gray-500 mb-1">Signature</p>
                <img 
                  src={agence?.signatureUrl || compagnie.signatureUrl} 
                  alt="Signature" 
                  className="h-16 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Pied de page */}
        <div 
          className="p-4 text-center text-xs text-white"
          style={{ backgroundColor: compagnie.couleurPrimaire }}
        >
          <p>Merci pour votre confiance • {compagnie.nom}</p>
          <p className="mt-1 opacity-80">
            Ce ticket est valable uniquement pour le trajet et la date indiqués
          </p>
        </div>
      </div>

      {/* Boutons d'actions */}
      <div className="print:hidden flex flex-wrap justify-center gap-4 mt-8">
        <button 
          onClick={() => window.print()}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Imprimer
        </button>
        <button 
          onClick={handlePDF}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
          </svg>
          Télécharger PDF
        </button>
        <button 
          onClick={() => navigate(`/compagnie/${compagnie.slug}/guichet`)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-600 text-white rounded-lg shadow hover:bg-gray-700 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Retour au guichet
        </button>
      </div>
    </div>
  );
};

export default ReceiptGuichetPage;