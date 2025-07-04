import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { db, storage } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { Upload, CheckCircle, XCircle, Loader2, ChevronLeft, Info } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { hexToRgba, safeTextColor } from '../utils/color';
import ErrorScreen from '@/components/ui/ErrorScreen';
import LoadingScreen from '@/components/ui/LoadingScreen';

interface ReservationDraft {
  id?: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  seatsGo: number;
  seatsReturn?: number;
  tripType: 'aller_simple' | 'aller_retour';
  montant: number;
  companyId?: string;
  companyName?: string;
  companySlug?: string;
}

interface PaymentMethod {
  url: string;
  logoUrl: string;
  ussdPattern: string;
  merchantNumber: string;
}

interface PaymentMethods {
  [key: string]: PaymentMethod;
}

interface CompanyInfo {
  id: string;
  name: string;
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  paymentMethods?: PaymentMethods;
  slug?: string;
}

const UploadPreuvePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug, id } = useParams<{ slug: string; id?: string }>();

  const { draft: locationDraft, companyInfo: locationCompanyInfo } = location.state || {};
  const [reservationDraft, setReservationDraft] = useState<ReservationDraft | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const loadInitialData = useCallback(async () => {
    try {
      setLoadingData(true);
      
      if (locationDraft && locationCompanyInfo) {
        setReservationDraft(locationDraft);
        setCompanyInfo(locationCompanyInfo);
        return;
      }

      const savedDraft = sessionStorage.getItem('reservationDraft');
      const savedCompanyInfo = sessionStorage.getItem('companyInfo');
      
      if (savedDraft && savedCompanyInfo) {
        const parsedDraft = JSON.parse(savedDraft) as ReservationDraft;
        const parsedCompanyInfo = JSON.parse(savedCompanyInfo) as CompanyInfo;
        
        if (!parsedDraft.nomClient || !parsedDraft.telephone) {
          throw new Error('Données de réservation incomplètes');
        }
        
        setReservationDraft(parsedDraft);
        setCompanyInfo(parsedCompanyInfo);
        return;
      }

      if (id) {
        throw new Error('Fonctionnalité non implémentée');
      }

      throw new Error('Aucune donnée de réservation valide trouvée');
    } catch (error) {
      console.error('Erreur de chargement:', error);
      setError(error instanceof Error ? error.message : 'Erreur inconnue');
      navigate(`/${slug || ''}`, { 
        replace: true,
        state: { error: 'Erreur de chargement des données' }
      });
    } finally {
      setLoadingData(false);
    }
  }, [locationDraft, locationCompanyInfo, navigate, slug, id]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    const fetchPaymentMethods = async () => {
      if (!companyInfo?.id) return;
      if (companyInfo.paymentMethods && Object.keys(companyInfo.paymentMethods).length > 0) return;

      try {
        const q = query(
          collection(db, 'paymentMethods'),
          where('companyId', '==', companyInfo.id)
        );
        const snapshot = await getDocs(q);
        
        const methods: PaymentMethods = {};
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const key = data.name.toLowerCase().replace(/\s+/g, '_');
          methods[key] = {
            url: data.defaultPaymentUrl || '',
            logoUrl: data.logoUrl || '',
            ussdPattern: data.ussdPattern || '',
            merchantNumber: data.merchantNumber || ''
          };
        });

        setCompanyInfo(prev => ({
          ...prev!,
          paymentMethods: methods
        }));
      } catch (err) {
        console.error('Erreur lors du chargement des méthodes:', err);
      }
    };

    fetchPaymentMethods();
  }, [companyInfo]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      if (!e.target.files || !e.target.files[0]) {
        setFile(null);
        return;
      }

      const selectedFile = e.target.files[0];
      const validTypes = ['image/jpeg', 'image/png', 'application/pdf'];
      const maxSize = 5 * 1024 * 1024;

      if (!validTypes.includes(selectedFile.type)) {
        throw new Error('Type de fichier non supporté (JPEG, PNG ou PDF uniquement)');
      }

      if (selectedFile.size > maxSize) {
        throw new Error('Le fichier est trop volumineux (max 5MB)');
      }

      setFile(selectedFile);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erreur lors de la sélection du fichier');
      setFile(null);
    }
  };

  const handlePaymentMethodSelect = (methodKey: string) => {
    try {
      if (!companyInfo?.paymentMethods?.[methodKey]) {
        throw new Error('Méthode de paiement non disponible');
      }

      const method = companyInfo.paymentMethods[methodKey];
      setPaymentMethod(methodKey);
      setError(null);

      if (reservationDraft) {
        const ussd = method.ussdPattern
          .replace('MERCHANT', method.merchantNumber)
          .replace('AMOUNT', reservationDraft.montant.toString());

        setMessage(prev => prev ? `${prev}\n\nCode USSD: ${ussd}` : `Code USSD: ${ussd}`);

        if (method.url) {
          window.open(method.url, '_blank', 'noopener,noreferrer');
        } else {
          window.open(`tel:${ussd}`, '_blank', 'noopener,noreferrer');
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erreur de sélection du paiement');
    }
  };

  const validateForm = (): boolean => {
    try {
      if (!paymentMethod) {
        throw new Error('Veuillez sélectionner un moyen de paiement');
      }

      if (!message.trim() && !file) {
        throw new Error('Veuillez ajouter un message ou un fichier');
      }

      if (!reservationDraft) {
        throw new Error('Données de réservation manquantes');
      }

      if (message.trim().length > 500) {
        throw new Error('Le message ne doit pas dépasser 500 caractères');
      }

      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erreur de validation');
      return false;
    }
  };

  const handleUpload = async () => {
    if (!validateForm()) return;

    setUploading(true);
    setError(null);

    try {
      let preuveUrl: string | null = null;

      if (file) {
        const fileExt = file.name.split('.').pop();
        const timestamp = Date.now();
        const fileName = `preuve_${timestamp}.${fileExt}`;
        const storageRef = ref(storage, `preuves/${fileName}`);
        
        const snapshot = await uploadBytes(storageRef, file);
        preuveUrl = await getDownloadURL(snapshot.ref);
      }

      const docRef = await addDoc(collection(db, 'reservations'), {
        ...reservationDraft,
        statut: 'preuve_recue',
        paymentMethod,
        preuveUrl: preuveUrl || null,
        preuveMessage: message.trim(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      sessionStorage.removeItem('reservationDraft');
      sessionStorage.removeItem('companyInfo');
      setSuccess(true);
      
      setTimeout(() => {
        navigate(`/reservation/${docRef.id}`, {
          state: {
            slug,
            companyInfo
          }
        });

      }, 1500);

    } catch (err) {
      console.error('Erreur:', err);
      setError('Une erreur est survenue lors de la création de la réservation');
    } finally {
      setUploading(false);
    }
  };

  if (loadingData) {
    return <LoadingScreen colors={{
      primary: '',
      text: '',
      background: ''
    }} />;
  }

  if (!reservationDraft || !companyInfo) {
    return <ErrorScreen slug={slug} navigate={navigate} error={''} />;
  }

  if (success) {
    return <SuccessScreen />;
  }

  const themeConfig = {
    colors: {
      primary: companyInfo.primaryColor || '#3b82f6',
      text: companyInfo.primaryColor ? safeTextColor(companyInfo.primaryColor) : '#ffffff',
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Header 
        companyInfo={companyInfo} 
        themeConfig={themeConfig} 
        onBack={() => navigate(-1)} 
      />
      
      <main className="max-w-4xl mx-auto p-4 space-y-6">
        <ReservationSummaryCard reservationDraft={reservationDraft} />
        
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="font-medium text-blue-800 mb-1">Instructions de paiement</h3>
              <p className="text-sm text-blue-700">
                1. Choisissez un moyen de paiement ci-dessous.<br />
                2. Effectuez le paiement dans l'application.<br />
                3. Revenez ici pour envoyer votre preuve.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 space-y-6">
            <AmountSection 
              amount={reservationDraft.montant} 
              primaryColor={themeConfig.colors.primary} 
            />
            
            <PaymentMethodSection
              paymentMethod={paymentMethod}
              onPaymentMethodSelect={handlePaymentMethodSelect}
              companyInfo={companyInfo}
              reservationAmount={reservationDraft.montant}
            />
            
            <MessageSection 
              message={message}
              setMessage={setMessage}
              primaryColor={themeConfig.colors.primary}
            />
            
            <FileUploadSection 
              handleFileChange={handleFileChange}
              file={file}
            />
            
            {error && <ErrorDisplay error={error} />}
          </div>

          <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
            <SubmitButton
              onClick={handleUpload}
              disabled={uploading || !message.trim() || !paymentMethod}
              primaryColor={themeConfig.colors.primary}
              textColor={themeConfig.colors.text}
              uploading={uploading}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

// ... (LoadingScreen, ErrorScreen, SuccessScreen components remain the same)

const Header: React.FC<{ companyInfo?: CompanyInfo; themeConfig: any; onBack: () => void }> = ({ 
  companyInfo, 
  themeConfig, 
  onBack 
}) => (
  <header 
    className="sticky top-0 z-50 px-4 py-3"
    style={{
      backgroundColor: hexToRgba(themeConfig.colors.primary, 0.95),
      backdropFilter: 'blur(10px)'
    }}
  >
    <div className="flex items-center gap-4 max-w-7xl mx-auto">
      <button 
        onClick={onBack}
        className="p-2 rounded-full hover:bg-white/10 transition"
        style={{ color: themeConfig.colors.text }}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      
      <div className="flex items-center gap-2">
        {companyInfo?.logoUrl && (
          <LazyLoadImage 
            src={companyInfo.logoUrl} 
            alt={`Logo ${companyInfo.name}`}
            effect="blur"
            className="h-8 w-8 rounded-full object-cover border-2"
            style={{ 
              borderColor: themeConfig.colors.text,
              backgroundColor: hexToRgba(themeConfig.colors.primary, 0.2)
            }}
          />
        )}
        <h1 
          className="text-lg font-bold"
          style={{ color: themeConfig.colors.text }}
        >
          Preuve de paiement
        </h1>
      </div>
    </div>
  </header>
);

const ReservationSummaryCard: React.FC<{ reservationDraft: ReservationDraft }> = ({ reservationDraft }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
    <div className="p-6">
      <h3 className="text-lg font-medium mb-4">Récapitulatif de votre réservation</h3>
      <div className="space-y-3">
        <div className="flex justify-between">
          <span className="text-gray-600">Trajet :</span>
          <span className="font-medium">{reservationDraft.depart} → {reservationDraft.arrivee}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Date :</span>
          <span className="font-medium">{reservationDraft.date}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Heure :</span>
          <span className="font-medium">{reservationDraft.heure}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Passager :</span>
          <span className="font-medium">{reservationDraft.nomClient}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Places :</span>
          <span className="font-medium">
            {reservationDraft.seatsGo} aller
            {reservationDraft.tripType === 'aller_retour' && ` + ${reservationDraft.seatsReturn} retour`}
          </span>
        </div>
      </div>
    </div>
  </div>
);

interface PaymentMethodSectionProps {
  paymentMethod: string | null;
  onPaymentMethodSelect: (method: string) => void;
  companyInfo?: CompanyInfo;
  reservationAmount: number;
}

const PaymentMethodSection: React.FC<PaymentMethodSectionProps> = ({ 
  paymentMethod, 
  onPaymentMethodSelect, 
  companyInfo,
  reservationAmount
}) => {
  if (!companyInfo?.paymentMethods || Object.keys(companyInfo.paymentMethods).length === 0) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
        <div className="flex items-center">
          <Info className="h-5 w-5 text-yellow-500 mr-2" />
          <p className="text-sm text-yellow-700">
            Aucun moyen de paiement configuré pour cette compagnie
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">Moyen de paiement *</h3>
      <div className="flex gap-3 flex-wrap">
        {Object.entries(companyInfo.paymentMethods).map(([key, method]) => (
          <button
            key={key}
            onClick={() => onPaymentMethodSelect(key)}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm transition ${
              paymentMethod === key
                ? 'bg-blue-100 border-blue-600 text-black'
                : 'bg-white border-gray-300 text-black hover:bg-gray-50'
            }`}
          >
            {method.logoUrl && (
              <img
                src={method.logoUrl}
                alt={key}
                className="h-6 w-6 object-contain rounded"
              />
            )}
            <span className="capitalize">{key.replace(/_/g, ' ')}</span>
          </button>
        ))}
      </div>
      
      {paymentMethod && companyInfo.paymentMethods[paymentMethod]?.ussdPattern && (
        <div className="mt-4 bg-blue-50 p-3 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Code USSD généré :</strong> {companyInfo.paymentMethods[paymentMethod].ussdPattern
              .replace('MERCHANT', companyInfo.paymentMethods[paymentMethod].merchantNumber)
              .replace('AMOUNT', reservationAmount.toString())}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Ce code sera automatiquement utilisé si l'application n'est pas disponible
          </p>
        </div>
      )}
    </div>
  );
};

const AmountSection: React.FC<{ amount: number; primaryColor: string }> = ({ amount, primaryColor }) => (
  <div>
    <h3 className="text-sm font-medium text-gray-700 mb-2">Montant à payer</h3>
    <div className="text-2xl font-bold" style={{ color: primaryColor }}>
      {amount?.toLocaleString() || 0} FCFA
    </div>
  </div>
);

const MessageSection: React.FC<{
  message: string;
  setMessage: (msg: string) => void;
  primaryColor: string;
}> = ({ message, setMessage, primaryColor }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Détails du paiement *
    </label>
    <textarea
      placeholder="Coller les détails du paiement (ex: ID de transaction, référence, numéro MTN/Moov...)"
      value={message}
      onChange={(e) => setMessage(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:outline-none"
      style={{ 
        borderColor: hexToRgba(primaryColor, 0.3),
      }}
      rows={4}
      required
    />
    <p className="text-xs text-gray-500 mt-1">
      Exemple: "Paiement MTN Mobile Money - Réf: 5X8T9K - 05/07/2024"
    </p>
  </div>
);

const FileUploadSection: React.FC<{
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  file: File | null;
}> = ({ handleFileChange, file }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      Capture d'écran (optionnel)
    </label>
    <div className="flex items-center justify-center w-full">
      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition">
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <Upload className="h-8 w-8 text-gray-400 mb-2" />
          <p className="text-sm text-gray-500">
            {file ? file.name : 'Cliquez pour sélectionner un fichier'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            PNG, JPG, PDF (max. 5MB)
          </p>
        </div>
        <input 
          type="file" 
          className="hidden" 
          onChange={handleFileChange}
          accept=".png,.jpg,.jpeg,.pdf"
        />
      </label>
    </div>
  </div>
);

const ErrorDisplay: React.FC<{ error: string }> = ({ error }) => (
  <div className="bg-red-50 border-l-4 border-red-500 p-4">
    <div className="flex items-center">
      <XCircle className="h-5 w-5 text-red-500 mr-2" />
      <p className="text-sm text-red-700">{error}</p>
    </div>
  </div>
);

const SubmitButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
  primaryColor: string;
  textColor: string;
  uploading: boolean;
}> = ({ onClick, disabled, primaryColor, textColor, uploading }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full py-3 px-4 rounded-lg font-medium transition-all hover:scale-105 active:scale-95"
    style={{
      backgroundColor: primaryColor,
      color: textColor,
      opacity: disabled ? 0.7 : 1
    }}
  >
    {uploading ? (
      <span className="flex items-center justify-center gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        Envoi en cours...
      </span>
    ) : (
      <span className="flex items-center justify-center gap-2">
        <CheckCircle className="h-5 w-5" />
        Confirmer l'envoi
      </span>
    )}
  </button>
);
const SuccessScreen: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center p-4 bg-white">
    <div className="text-center max-w-md">
      <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
      <h1 className="text-xl font-bold text-green-600 mb-2">Preuve envoyée !</h1>
      <p className="text-gray-600">Redirection en cours...</p>
    </div>
  </div>
);

export default UploadPreuvePage;