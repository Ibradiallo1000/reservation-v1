import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { db, storage } from '@/firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, getDoc, updateDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { Upload, CheckCircle, XCircle, Loader2, ChevronLeft, Info, MapPin, Calendar, User, Users, ArrowRight, Banknote } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { hexToRgba, safeTextColor } from '@/utils/color';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import ErrorScreen from '@/shared/ui/ErrorScreen';
import LoadingScreen from '@/shared/ui/LoadingScreen';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

// ===================== DEBUG / LOGGER =====================
const DEBUG = true;
const NS = '[UploadPreuvePage]';
const log = {
  info: (...args: any[]) => DEBUG && console.log(NS, ...args),
  warn: (...args: any[]) => DEBUG && console.warn(NS, ...args),
  error: (...args: any[]) => DEBUG && console.error(NS, ...args),
  group: (label: string) => DEBUG && console.group(`${NS} ${label}`),
  groupEnd: () => DEBUG && console.groupEnd(),
};
// =========================================================

interface ReservationDraft {
  agencyId: string;
  preuveMessage: string;
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
  // ⚠️ On ne force pas referenceCode ici
  referenceCode?: string;
}

interface PaymentMethod {
  url?: string;
  logoUrl?: string;
  ussdPattern?: string;
  merchantNumber?: string;
}
interface PaymentMethods { [key: string]: PaymentMethod | null | undefined; }

interface CompanyInfo {
  couleurSecondaire: string | undefined;
  id: string;
  name: string;
  primaryColor?: string;
  secondaryColor?: string;
  couleurPrimaire?: string;
  logoUrl?: string;
  paymentMethods?: PaymentMethods;
  slug?: string;
}

const UploadPreuvePage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug, id } = useParams<{ slug: string; id?: string }>();
  const money = useFormatCurrency();

  // Récup context navigation si présent
  const { draft: locationDraft, companyInfo: locationCompanyInfo } = (location.state as any) || {};

  // States UI / data
  const [reservationDraft, setReservationDraft] = useState<ReservationDraft | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // ======= Chargement initial (sessionStorage + Firestore) =======
  const loadInitialData = useCallback(async () => {
    log.group('loadInitialData');
    try {
      setLoadingData(true);

      let parsedCompanyInfo: CompanyInfo | null = null;

      // 1) Depuis location.state (navigation directe)
      if (locationDraft && locationCompanyInfo) {
        log.info('Init from location.state');
        parsedCompanyInfo = locationCompanyInfo;
        setReservationDraft(locationDraft);
      } else {
        // 2) Depuis sessionStorage (cas de refresh page)
        const savedDraft = sessionStorage.getItem('reservationDraft');
        const savedCompanyInfo = sessionStorage.getItem('companyInfo');
        log.info('Init from sessionStorage', { hasDraft: !!savedDraft, hasCompany: !!savedCompanyInfo });

        if (savedDraft && savedCompanyInfo) {
          const parsedDraft = JSON.parse(savedDraft) as ReservationDraft;
          parsedCompanyInfo = JSON.parse(savedCompanyInfo) as CompanyInfo;

          if (!parsedDraft?.depart || !parsedDraft?.arrivee) {
            throw new Error('Données de réservation incomplètes');
          }
          setReservationDraft(parsedDraft);
        } else {
          throw new Error('Aucune donnée de réservation valide trouvée');
        }
      }

      // 3) Paiements + styles compagnie
      if (parsedCompanyInfo?.id) {
        const paymentSnap = await getDocs(
          query(collection(db, 'paymentMethods'), where('companyId', '==', parsedCompanyInfo.id))
        );

        const methods: PaymentMethods = {};
        paymentSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.name) {
            methods[data.name] = {
              logoUrl: data.logoUrl || '',
              url: data.defaultPaymentUrl || '',
              ussdPattern: data.ussdPattern || '',
              merchantNumber: data.merchantNumber || '',
            };
          }
        });
        log.info('Payment methods', Object.keys(methods));

        const companyRef = doc(db, 'companies', parsedCompanyInfo.id);
        const snap = await getDoc(companyRef);

        if (snap.exists()) {
          const companyData = snap.data() as any;
          setCompanyInfo({
            ...parsedCompanyInfo,
            paymentMethods: methods,
            primaryColor: companyData.primaryColor || companyData.couleurPrimaire || '#3b82f6',
            secondaryColor: companyData.secondaryColor || companyData.couleurSecondaire || '#93c5fd',
            logoUrl: companyData.logoUrl || '',
          });
          log.info('Company info merged', { styles: { primary: companyData.couleurPrimaire, secondary: companyData.couleurSecondaire } });
          return;
        } else {
          throw new Error('Compagnie introuvable dans Firestore');
        }
      }

      throw new Error('Impossible de récupérer les infos de la compagnie');
    } catch (error) {
      log.error('loadInitialData error', error);
      setError(error instanceof Error ? error.message : 'Erreur inconnue');
      navigate(`/${slug || ''}`, { replace: true, state: { error: 'Erreur de chargement des données' } });
    } finally {
      setLoadingData(false);
      log.groupEnd();
    }
  }, [locationDraft, locationCompanyInfo, navigate, slug, id]);

  useEffect(() => { loadInitialData(); }, [loadInitialData]);

  // ======= Sélection de fichier =======
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
      log.info('File selected', { name: selectedFile.name, size: selectedFile.size, type: selectedFile.type });
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erreur lors de la sélection du fichier');
      setFile(null);
      log.warn('handleFileChange error', error);
    }
  };

  // ======= Choix du moyen de paiement =======
  const handlePaymentMethodSelect = (methodKey: string) => {
    try {
      const method = companyInfo?.paymentMethods?.[methodKey];
      if (!method) throw new Error('Méthode de paiement non disponible');

      setPaymentMethod(methodKey);
      setError(null);
      log.info('Payment method selected', methodKey);

      if (reservationDraft) {
        const ussd = method.ussdPattern
          ?.replace('MERCHANT', method.merchantNumber || '')
          ?.replace('AMOUNT', reservationDraft.montant.toString());

        if (method.url) {
          window.open(method.url, '_blank', 'noopener,noreferrer');
          log.info('Open payment URL', method.url);
        } else if (ussd) {
          window.open(`tel:${ussd}`, '_blank', 'noopener,noreferrer');
          log.info('Open USSD', ussd);
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erreur de sélection du paiement');
      log.warn('handlePaymentMethodSelect error', error);
    }
  };

  // ======= Upload / update Firestore (NE CHANGE PAS referenceCode) =======
  const handleUpload = async () => {
    if (!reservationDraft || !reservationDraft.id) {
      setError('Réservation introuvable.');
      return;
    }
    if (!paymentMethod) {
      setError('Veuillez sélectionner un moyen de paiement.');
      return;
    }
    if (!message && !file) {
      setError('Veuillez fournir une preuve ou un message.');
      return;
    }

    setUploading(true);
    setError(null);
    log.group('handleUpload');

    try {
      let preuveUrl: string | null = null;

      // 1) Upload fichier si présent
      if (file) {
        const ext = file.name.split('.').pop();
        const filename = `preuves/preuve_${Date.now()}.${ext}`;
        const fileRef = ref(storage, filename);
        const snap = await uploadBytes(fileRef, file);
        preuveUrl = await getDownloadURL(snap.ref);
        log.info('File uploaded', { filename, preuveUrl });
      }

      // ⚠️ IMPORTANT : on NE génère PAS de referenceCode ici.
      // On met juste le statut "preuve_recue" + infos PMA.
      const updatePayload: any = {
        nomClient: reservationDraft.nomClient,
        telephone: reservationDraft.telephone,
        depart: reservationDraft.depart,
        arrivee: reservationDraft.arrivee,
        date: reservationDraft.date,
        heure: reservationDraft.heure,
        montant: reservationDraft.montant,
        seatsGo: reservationDraft.seatsGo,
        seatsReturn: reservationDraft.seatsReturn || 0,
        tripType: reservationDraft.tripType,

        statut: 'preuve_recue',

        // On garde l’info du canal web
        canal: 'en_ligne',

        // PMA sélectionné
        preuveVia: paymentMethod,
        preuveMessage: message.trim(),
        preuveUrl: preuveUrl || null,

        // Contexte
        companyId: reservationDraft.companyId || '',
        companySlug: reservationDraft.companySlug || '',

        updatedAt: new Date(),
      };

      // NE PAS ECRASER referenceCode : on le laisse tel quel s’il existe déjà dans le doc.
      log.info('Update payload (no ref code write)', updatePayload);

      await updateDoc(
        doc(
          db,
          'companies',
          reservationDraft.companyId!,
          'agences',
          reservationDraft.agencyId!,
          'reservations',
          reservationDraft.id!
        ),
        updatePayload
      );

      // Nettoyage du cache (on a fini le flux PMA)
      sessionStorage.removeItem('reservationDraft');
      sessionStorage.removeItem('companyInfo');
      setSuccess(true);
      log.info('Upload success → setSuccess(true)');
    } catch (err) {
      log.error('handleUpload error', err);
      setError('Une erreur est survenue lors de l\'envoi.');
    } finally {
      setUploading(false);
      log.groupEnd();
    }
  };

  // ======= RENDUS UI =======
  if (loadingData) {
    const themeConfig = {
      colors: {
        primary: companyInfo?.couleurPrimaire || '#3b82f6',
        text: companyInfo?.couleurPrimaire ? safeTextColor(companyInfo.couleurPrimaire) : '#ffffff',
        background: '#f9fafb'
      }
    };
    return <LoadingScreen colors={themeConfig.colors} />;
  }

  if (!reservationDraft || !companyInfo) {
    return <ErrorScreen slug={slug} navigate={navigate} error={error || ''} />;
  }

  if (success) {
    return <SuccessScreen reservationDraft={reservationDraft} companyInfo={companyInfo} slug={slug} />;
  }

  const themeConfig = {
    colors: {
      primary: companyInfo.primaryColor || companyInfo.couleurPrimaire || '#3b82f6',
      secondary: companyInfo.secondaryColor || companyInfo.couleurSecondaire || '#93c5fd',
      text: companyInfo.primaryColor ? safeTextColor(companyInfo.primaryColor) : '#ffffff',
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header companyInfo={companyInfo} themeConfig={themeConfig} onBack={() => navigate(-1)} />

      <main className="max-w-4xl mx-auto p-4 space-y-6 pb-24">
        <ReservationSummaryCard reservationDraft={reservationDraft} primaryColor={themeConfig.colors.primary} />

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 space-y-6">
            <AmountSection amount={reservationDraft.montant} primaryColor={themeConfig.colors.primary} />

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                <Banknote className="w-5 h-5" style={{ color: themeConfig.colors.primary }} />
                <span>Moyen de paiement</span>
              </h3>
              <PaymentMethodSection
                paymentMethod={paymentMethod}
                onPaymentMethodSelect={handlePaymentMethodSelect}
                companyInfo={companyInfo}
                reservationAmount={reservationDraft.montant}
                primaryColor={themeConfig.colors.primary}
                secondaryColor={themeConfig.colors.secondary}
              />
            </div>

            <MessageSection message={message} setMessage={setMessage} primaryColor={themeConfig.colors.primary} />

            <FileUploadSection handleFileChange={handleFileChange} file={file} primaryColor={themeConfig.colors.primary} />

            {error && <ErrorDisplay error={error} />}
          </div>
        </div>
      </main>

      <SubmitButton
        onClick={handleUpload}
        disabled={uploading || !message.trim() || !paymentMethod}
        themeConfig={themeConfig}
        uploading={uploading}
      />
    </div>
  );
};

// ======= UI subcomponents (commentés) =======

const SuccessScreen: React.FC<{
  reservationDraft: ReservationDraft;
  companyInfo: CompanyInfo;
  slug?: string;
}> = ({ reservationDraft, companyInfo, slug }) => {
  const navigate = useNavigate();
  const themeConfig = {
    colors: {
      primary: companyInfo.primaryColor || companyInfo.couleurPrimaire || '#3b82f6',
      text: companyInfo.primaryColor ? safeTextColor(companyInfo.primaryColor) : '#ffffff',
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      // Redirection vers la page de détails de réservation
      navigate(`/${slug}/reservation/${reservationDraft.id}`, {
        state: {
          slug: slug,
          companyInfo: companyInfo,
          reservation: {
            ...reservationDraft,
            id: reservationDraft.id,
            statut: 'preuve_recue',
            preuveMessage: reservationDraft.preuveMessage || '',
          }
        }
      });
    }, 1200);
    return () => clearTimeout(timeout);
  }, [navigate, reservationDraft, companyInfo, slug]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-white">
      <div className="text-center max-w-md">
        <div className="mx-auto mb-4 flex items-center justify-center">
          <div className="p-3 rounded-full" style={{ backgroundColor: hexToRgba(themeConfig.colors.primary, 0.1) }}>
            <CheckCircle className="h-10 w-10" style={{ color: themeConfig.colors.primary }} />
          </div>
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Preuve envoyée avec succès !</h1>
        <p className="text-gray-600">Vous allez être redirigé vers votre réservation...</p>
      </div>
    </div>
  );
};

const Header: React.FC<{ companyInfo?: CompanyInfo; themeConfig: any; onBack: () => void }> = ({
  companyInfo, themeConfig, onBack
}) => (
  <header
    className="sticky top-0 z-50 px-4 py-3 shadow-sm"
    style={{ backgroundColor: themeConfig.colors.primary, color: themeConfig.colors.text }}
  >
    <div className="flex items-center gap-4 max-w-7xl mx-auto">
      <button onClick={onBack} className="p-2 rounded-full hover:bg-white/10 transition">
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-3">
        {companyInfo?.logoUrl && (
          <LazyLoadImage
            src={companyInfo.logoUrl}
            alt={`Logo ${companyInfo.name}`}
            effect="blur"
            className="h-8 w-8 rounded-full object-cover border-2"
            style={{ borderColor: themeConfig.colors.text }}
          />
        )}
        <h1 className="text-lg font-bold">Envoyer la preuve de paiement</h1>
      </div>
    </div>
  </header>
);

const ReservationSummaryCard: React.FC<{
  reservationDraft: ReservationDraft;
  primaryColor: string;
}> = ({ reservationDraft, primaryColor }) => {
  const isAllerRetour = reservationDraft.tripType === 'aller_retour';
  const formattedDate = reservationDraft.date
    ? format(parseISO(reservationDraft.date), 'EEEE d MMMM yyyy', { locale: fr })
    : reservationDraft.date;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b" style={{ backgroundColor: hexToRgba(primaryColor, 0.05), borderColor: hexToRgba(primaryColor, 0.2) }}>
        <h3 className="text-lg font-semibold" style={{ color: primaryColor }}>
          Récapitulatif de votre réservation
        </h3>
      </div>

      <div className="p-6 space-y-4 text-sm">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: hexToRgba(primaryColor, 0.1) }}>
                <MapPin className="w-5 h-5" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="text-gray-500">Trajet</p>
                <p className="font-semibold text-gray-900">
                  {reservationDraft.depart} <ArrowRight className="inline mx-1 w-4 h-4 text-gray-400" /> {reservationDraft.arrivee}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: hexToRgba(primaryColor, 0.1) }}>
                <Calendar className="w-5 h-5" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="text-gray-500">Date et heure</p>
                <p className="font-semibold text-gray-900">{formattedDate} à {reservationDraft.heure}</p>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: hexToRgba(primaryColor, 0.1) }}>
                <User className="w-5 h-5" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="text-gray-500">Passager</p>
                <p className="font-semibold text-gray-900">{reservationDraft.nomClient}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ backgroundColor: hexToRgba(primaryColor, 0.1) }}>
                <Users className="w-5 h-5" style={{ color: primaryColor }} />
              </div>
              <div>
                <p className="text-gray-500">Places</p>
                <p className="font-semibold text-gray-900">
                  {reservationDraft.seatsGo} {isAllerRetour && `+ ${reservationDraft.seatsReturn} retour`}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const PaymentMethodSection: React.FC<{
  paymentMethod: string | null;
  onPaymentMethodSelect: (method: string) => void;
  companyInfo?: CompanyInfo;
  reservationAmount: number;
  primaryColor: string;
  secondaryColor: string;
}> = ({ paymentMethod, onPaymentMethodSelect, companyInfo, reservationAmount, primaryColor, secondaryColor }) => {
  const paymentMethods = companyInfo?.paymentMethods || {};

  if (Object.keys(paymentMethods).length === 0) {
    return (
      <div className="border-l-4 p-4 rounded-lg" style={{ backgroundColor: hexToRgba('#f59e0b', 0.05), borderColor: '#f59e0b' }}>
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 mt-0.5" style={{ color: '#f59e0b' }} />
          <p className="text-sm" style={{ color: '#92400e' }}>
            Aucun moyen de paiement configuré pour cette compagnie. Veuillez contacter l'agence.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-3">
        {Object.entries(paymentMethods)
          .filter(([_, method]) => method)
          .map(([key, method]) => {
            if (!method) return null;

            return (
              <button
                key={key}
                onClick={() => onPaymentMethodSelect(key)}
                className={`w-full flex items-center gap-4 p-4 rounded-lg border transition-all ${
                  paymentMethod === key ? 'border-blue-500 shadow-sm' : 'border-gray-200 hover:border-gray-300'
                }`}
                style={{ backgroundColor: paymentMethod === key ? hexToRgba(secondaryColor, 0.2) : 'white' }}
              >
                {method.logoUrl ? (
                  <img src={method.logoUrl} alt={key} className="h-10 w-10 object-contain rounded-lg" />
                ) : (
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center"
                       style={{ backgroundColor: hexToRgba(primaryColor, 0.1), color: primaryColor }}>
                    <Banknote className="w-5 h-5" />
                  </div>
                )}
                <div className="text-left flex-1">
                  <div className="font-medium capitalize">{key.replace(/_/g, ' ')}</div>
                  {method.merchantNumber && (
                    <div className="text-xs text-gray-500">Numéro: {method.merchantNumber}</div>
                  )}
                </div>
                {paymentMethod === key && (
                  <div className="ml-auto">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center"
                         style={{ backgroundColor: primaryColor, color: safeTextColor(primaryColor) }}>
                      <CheckCircle className="w-3 h-3" />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
      </div>

      {paymentMethod && paymentMethods[paymentMethod]?.ussdPattern && (
        <div className="mt-4 p-4 rounded-lg"
             style={{ backgroundColor: hexToRgba(primaryColor, 0.05), border: `1px solid ${hexToRgba(primaryColor, 0.2)}` }}>
          <p className="text-sm font-medium mb-2" style={{ color: primaryColor }}>
            Code USSD généré :
          </p>
          <div className="p-3 rounded-lg font-mono text-center text-sm break-all"
               style={{ backgroundColor: hexToRgba(primaryColor, 0.1) }}>
            {paymentMethods[paymentMethod]?.ussdPattern
              ?.replace('MERCHANT', paymentMethods[paymentMethod]?.merchantNumber || '')
              ?.replace('AMOUNT', reservationAmount.toString())}
          </div>
          <p className="text-xs mt-2 text-gray-500">Ce code sera automatiquement utilisé si l'application n'est pas disponible</p>
        </div>
      )}
    </div>
  );
};

const AmountSection: React.FC<{ amount: number; primaryColor: string }> = ({ amount, primaryColor }) => {
  const money = useFormatCurrency();
  return (
  <div>
    <h3 className="text-sm font-medium text-gray-700 mb-2">Montant à payer</h3>
    <div className="text-3xl font-bold py-3 px-4 rounded-lg"
         style={{ backgroundColor: hexToRgba(primaryColor, 0.1), color: primaryColor }}>
      {money(amount)}
    </div>
  </div>
  );
};

const MessageSection: React.FC<{
  message: string;
  setMessage: (msg: string) => void;
  primaryColor: string;
}> = ({ message, setMessage, primaryColor }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">Détails du paiement *</label>
    <textarea
      placeholder="Coller les détails du paiement (ex: ID de transaction, référence, numéro MTN/Moov...)"
      value={message}
      onChange={(e) => setMessage(e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:outline-none"
      style={{ borderColor: hexToRgba(primaryColor, 0.3) }}
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
  primaryColor: string;
}> = ({ handleFileChange, file, primaryColor }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">Capture d'écran (optionnel)</label>
    <div className="flex items-center justify-center w-full">
      <label
        className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-all hover:border-gray-400"
        style={{ borderColor: file ? primaryColor : hexToRgba(primaryColor, 0.3), backgroundColor: file ? hexToRgba(primaryColor, 0.05) : 'white' }}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          {file ? (
            <>
              <CheckCircle className="h-8 w-8 mb-2" style={{ color: primaryColor }} />
              <p className="text-sm font-medium" style={{ color: primaryColor }}>{file.name}</p>
              <p className="text-xs text-gray-500 mt-1">Cliquez pour changer de fichier</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-gray-400 mb-2" />
              <p className="text-sm text-gray-500">Cliquez pour sélectionner un fichier</p>
              <p className="text-xs text-gray-400 mt-1">PNG, JPG, PDF (max. 5MB)</p>
            </>
          )}
        </div>
        <input type="file" className="hidden" onChange={handleFileChange} accept=".png,.jpg,.jpeg,.pdf" />
      </label>
    </div>
  </div>
);

const ErrorDisplay: React.FC<{ error: string }> = ({ error }) => (
  <div className="border-l-4 p-4 rounded-lg" style={{ backgroundColor: hexToRgba('#ef4444', 0.05), borderColor: '#ef4444' }}>
    <div className="flex items-start gap-3">
      <XCircle className="h-5 w-5 mt-0.5" style={{ color: '#ef4444' }} />
      <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
    </div>
  </div>
);

const SubmitButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
  themeConfig: any;
  uploading: boolean;
}> = ({ onClick, disabled, themeConfig, uploading }) => (
  <div className="fixed bottom-0 left-0 w-full z-50 border-t border-gray-200 bg-white px-4 py-3 shadow-lg">
    <div className="max-w-4xl mx-auto">
      <button
        onClick={onClick}
        disabled={disabled}
        className="w-full py-3 px-4 rounded-lg font-medium transition-all hover:opacity-90"
        style={{ backgroundColor: disabled ? '#9ca3af' : themeConfig.colors.primary, color: themeConfig.colors.text }}
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
    </div>
  </div>
);

export default UploadPreuvePage;
