// src/pages/AdminParametresPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebaseConfig';

type Features = {
  guichet: boolean;
  onlineReservations: boolean;
  publicPage: boolean;
  analytics: boolean;
};

type PlatformSettings = {
  email?: string;               // email de contact/support
  logoUrl?: string;             // URL du logo (storage)
  commissionOnline?: number;    // en %
  fraisFixe?: number;           // FCFA
  minimumMensuel?: number;      // FCFA
  features?: Features;
};

const AdminParametresPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{type: 'ok' | 'err'; text: string} | null>(null);

  // champs
  const [email, setEmail] = useState('');
  const [commissionOnline, setCommissionOnline] = useState<number>(3);
  const [fraisFixe, setFraisFixe] = useState<number>(100);
  const [minimumMensuel, setMinimumMensuel] = useState<number>(0);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);

  const [features, setFeatures] = useState<Features>({
    guichet: true,
    onlineReservations: false,
    publicPage: true,
    analytics: false,
  });

  // Charger les paramètres existants
  useEffect(() => {
    (async () => {
      try {
        const refDoc = doc(db, 'admin', 'parametres');
        const snap = await getDoc(refDoc);
        if (snap.exists()) {
          const d = snap.data() as PlatformSettings;
          setEmail(d.email ?? '');
          setLogoUrl(d.logoUrl);
          setCommissionOnline(typeof d.commissionOnline === 'number' ? d.commissionOnline : 3);
          setFraisFixe(typeof d.fraisFixe === 'number' ? d.fraisFixe : 100);
          setMinimumMensuel(typeof d.minimumMensuel === 'number' ? d.minimumMensuel : 0);
          setFeatures({
            guichet: d.features?.guichet ?? true,
            onlineReservations: d.features?.onlineReservations ?? false,
            publicPage: d.features?.publicPage ?? true,
            analytics: d.features?.analytics ?? false,
          });
        }
      } catch (e) {
        setMessage({ type: 'err', text: "Impossible de charger les paramètres." });
        // console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogoFile(e.target.files[0]);
    }
  };

  const uploadLogoIfNeeded = async (): Promise<string | undefined> => {
    if (!logoFile) return logoUrl;
    const path = `platform/branding/logo-${Date.now()}.${(logoFile.name.split('.').pop() || 'png')}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, logoFile);
    const url = await getDownloadURL(storageRef);
    setLogoUrl(url);
    return url;
    };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const uploadedLogoUrl = await uploadLogoIfNeeded();

      const payload: PlatformSettings = {
        email: email.trim(),
        logoUrl: uploadedLogoUrl,
        commissionOnline: Math.max(0, Number(commissionOnline) || 0),
        fraisFixe: Math.max(0, Number(fraisFixe) || 0),
        minimumMensuel: Math.max(0, Number(minimumMensuel) || 0),
        features: {
          guichet: !!features.guichet,
          onlineReservations: !!features.onlineReservations,
          publicPage: !!features.publicPage,
          analytics: !!features.analytics,
        },
      };

      const refDoc = doc(db, 'admin', 'parametres');
      await setDoc(refDoc, payload, { merge: true });

      setMessage({ type: 'ok', text: 'Paramètres mis à jour avec succès.' });
      setLogoFile(null);
    } catch (error) {
      setMessage({ type: 'err', text: 'Erreur lors de la mise à jour des paramètres.' });
      // console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const currency = useMemo(
    () => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }),
    []
  );

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Paramètres plateforme</h1>
        <div className="text-gray-600">Chargement…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Paramètres plateforme</h1>
        {logoUrl ? (
          <img src={logoUrl} alt="logo" className="h-10 w-auto object-contain" />
        ) : (
          <div className="text-xs text-gray-500">Aucun logo</div>
        )}
      </div>

      {/* Alerte sécurité mot de passe */}
      <div className="rounded-lg border bg-amber-50 text-amber-900 p-3 text-sm">
        <b>Important :</b> ne stocke pas de <i>mot de passe</i> dans Firestore. La gestion des comptes
        admin doit passer par Firebase Auth (ou une Cloud Function d’admin). Le champ “mot de passe”
        a été volontairement retiré ici.
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bloc identité/branding */}
        <div className="space-y-4 rounded-2xl border p-4 bg-white">
          <h2 className="font-semibold">Identité & branding</h2>
          <label className="block text-sm">
            <span className="text-gray-600">Email de contact</span>
            <input
              type="email"
              className="mt-1 block w-full border rounded px-3 py-2"
              placeholder="support@exemple.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-600">Logo (PNG/JPG)</span>
            <input type="file" accept="image/*" className="mt-1 block w-full" onChange={handleLogoChange} />
            {logoFile && <div className="text-xs text-gray-500 mt-1">{logoFile.name}</div>}
          </label>
        </div>

        {/* Bloc tarification */}
        <div className="space-y-4 rounded-2xl border p-4 bg-white">
          <h2 className="font-semibold">Tarification en ligne</h2>
          <label className="block text-sm">
            <span className="text-gray-600">Commission (%)</span>
            <input
              type="number"
              step="0.1"
              className="mt-1 block w-full border rounded px-3 py-2"
              value={commissionOnline}
              onChange={(e) => setCommissionOnline(Number(e.target.value))}
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-600">Frais fixe (FCFA)</span>
            <input
              type="number"
              className="mt-1 block w-full border rounded px-3 py-2"
              value={fraisFixe}
              onChange={(e) => setFraisFixe(Number(e.target.value))}
            />
          </label>

          <label className="block text-sm">
            <span className="text-gray-600">Minimum mensuel (FCFA)</span>
            <input
              type="number"
              className="mt-1 block w-full border rounded px-3 py-2"
              value={minimumMensuel}
              onChange={(e) => setMinimumMensuel(Number(e.target.value))}
            />
          </label>

          <div className="text-xs text-gray-500">
            Aperçu : {commissionOnline}% + {currency.format(fraisFixe)} — minimum {currency.format(minimumMensuel)} / mois
          </div>
        </div>

        {/* Bloc Features */}
        <div className="md:col-span-2 rounded-2xl border p-4 bg-white">
          <h2 className="font-semibold mb-3">Fonctionnalités contrôlées par la plateforme</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex items-center gap-2 border rounded px-3 py-2">
              <input
                type="checkbox"
                checked={features.guichet}
                onChange={(e) => setFeatures((f) => ({ ...f, guichet: e.target.checked }))}
              />
              <span>Guichet (vente au comptoir)</span>
            </label>
            <label className="flex items-center gap-2 border rounded px-3 py-2">
              <input
                type="checkbox"
                checked={features.onlineReservations}
                onChange={(e) => setFeatures((f) => ({ ...f, onlineReservations: e.target.checked }))}
              />
              <span>Réservations en ligne</span>
            </label>
            <label className="flex items-center gap-2 border rounded px-3 py-2">
              <input
                type="checkbox"
                checked={features.publicPage}
                onChange={(e) => setFeatures((f) => ({ ...f, publicPage: e.target.checked }))}
              />
              <span>Page publique (vitrine)</span>
            </label>
            <label className="flex items-center gap-2 border rounded px-3 py-2">
              <input
                type="checkbox"
                checked={features.analytics}
                onChange={(e) => setFeatures((f) => ({ ...f, analytics: e.target.checked }))}
              />
              <span>Analytics</span>
            </label>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-white disabled:opacity-60"
              style={{ background: 'linear-gradient(90deg,#ea580c,#f97316)' }}
            >
              {saving ? 'Sauvegarde…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>

      {message && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            message.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
};

export default AdminParametresPage;
