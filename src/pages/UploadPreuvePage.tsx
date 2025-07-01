import React, { useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { db, storage } from '../firebaseConfig';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc } from 'firebase/firestore';
import { Upload, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const UploadPreuvePage: React.FC = () => {
  const { id, slug = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { paymentMethod, reservation, companyInfo } = location.state || {};

  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // Vérification de la taille du fichier (max 5MB)
      if (selectedFile.size > 5 * 1024 * 1024) {
        setError('Le fichier est trop volumineux (max 5MB)');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!id) return;
    if (!message && !file) {
      setError('Veuillez ajouter un message ou un fichier');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      let preuveUrl: string | null = null;

      // Upload du fichier si présent
      if (file) {
        const storageRef = ref(storage, `preuves/${id}/${file.name}`);
        await uploadBytes(storageRef, file);
        preuveUrl = await getDownloadURL(storageRef);
      }

      // Mise à jour de la réservation dans Firestore
      const resRef = doc(db, 'reservations', id);
      await updateDoc(resRef, {
        statut: 'preuve_reçue',
        preuveUrl: preuveUrl || '',
        preuveMessage: message,
        updatedAt: new Date()
      });

      setSuccess(true);
      setTimeout(() => {
        navigate(`/reservation/${id}`, {
          state: {
            slug,
            reservation: { ...reservation, id },
            paymentMethod,
            companyInfo
          }
        });
      }, 1500);

    } catch (err) {
      console.error('Erreur lors du téléversement:', err);
      setError('Une erreur est survenue lors du téléversement');
    } finally {
      setUploading(false);
    }
  }, [file, message, id, navigate, slug, paymentMethod, reservation, companyInfo]);

  if (!id) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <XCircle className="mx-auto h-12 w-12 text-red-500 mb-4" />
          <h1 className="text-xl font-bold text-red-600 mb-2">Erreur</h1>
          <p className="text-gray-600 mb-6">Réservation introuvable</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
          <h1 className="text-xl font-bold text-green-600 mb-2">Succès !</h1>
          <p className="text-gray-600 mb-6">Votre preuve a bien été envoyée</p>
          <div className="animate-pulse text-sm text-gray-500">
            Redirection en cours...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <Upload className="h-6 w-6 text-blue-600" />
            <h1 className="text-xl font-bold">Envoyer votre preuve de paiement</h1>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Message de confirmation
              </label>
              <textarea
                placeholder="Coller les détails du paiement (ex: ID de transaction, référence...)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={4}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fichier de preuve (optionnel)
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

            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4">
                <div className="flex items-center">
                  <XCircle className="h-5 w-5 text-red-500 mr-2" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3 px-4 rounded-lg transition flex items-center justify-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Envoi en cours...</span>
                </>
              ) : (
                <>
                  <Upload className="h-5 w-5" />
                  <span>Envoyer la preuve</span>
                </>
              )}
            </button>
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            Votre preuve sera vérifiée sous 24h maximum
          </p>
        </div>
      </div>
    </div>
  );
};

export default UploadPreuvePage;