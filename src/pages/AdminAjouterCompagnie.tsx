import React, { useState } from 'react';
import { auth, db } from '../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore';

const countries = [
  { name: 'Mali', code: '+223' },
  { name: 'Sénégal', code: '+221' },
  { name: "Côte d'Ivoire", code: '+225' },
  { name: 'Burkina Faso', code: '+226' },
  { name: 'Togo', code: '+228' },
];

const slugify = (str: string) =>
  str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const AdminAjouterCompagnie: React.FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
  const [nom, setNom] = useState('');
  const [responsable, setResponsable] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [pays, setPays] = useState(countries[0].name);
  const [code, setCode] = useState(countries[0].code);
  const [telephone, setTelephone] = useState('');
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, motDePasse);
      const uid = userCredential.user.uid;
      const companyId = uid;
      const slug = slugify(nom);

      const defaultFooterConfig = {
        showSocialMedia: true,
        showTestimonials: true,
        showLegalLinks: true,
        showContactForm: true,
        customLinks: [
          { title: 'FAQ', url: '/faq' },
          { title: 'Aide', url: '/aide' }
        ]
      };

      const defaultSocialMedia = {
        facebook: '',
        instagram: '',
        twitter: '',
        linkedin: '',
        youtube: '',
        tiktok: ''
      };

      await setDoc(doc(db, 'companies', companyId), {
        nom,
        email,
        pays,
        telephone: `${code}${telephone}`,
        responsable,
        plan: 'free',
        createdAt: Timestamp.now(),
        commission: 10,
        logoUrl: '',
        banniereUrl: '',
        description: '',
        slug,
        latitude: latitude || null,
        longitude: longitude || null,
        footerConfig: defaultFooterConfig,
        socialMedia: defaultSocialMedia,
        themeStyle: 'moderne',
        couleurPrimaire: '#3B82F6',
        couleurSecondaire: '#10B981',
        police: 'sans-serif'
      });

      await setDoc(doc(db, 'users', uid), {
        email,
        role: 'admin_compagnie',
        companyId,
        companyName: nom,
        nom: responsable,
        createdAt: Timestamp.now()
      });

      alert('✅ Compagnie et utilisateur créés avec succès.');
      setNom('');
      setEmail('');
      setMotDePasse('');
      setTelephone('');
      setResponsable('');
      setLatitude(null);
      setLongitude(null);

      if (onSuccess) onSuccess();
    } catch (error: any) {
      alert('❌ Erreur : ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Ajouter une compagnie</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        <input
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom de la compagnie"
          className="border p-2 rounded"
        />
        <input
          required
          value={responsable}
          onChange={(e) => setResponsable(e.target.value)}
          placeholder="Nom du responsable"
          className="border p-2 rounded"
        />
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email du responsable"
          className="border p-2 rounded"
        />
        <input
          required
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder="Mot de passe"
          className="border p-2 rounded"
        />
        <div className="flex gap-2">
          <select
            value={pays}
            onChange={(e) => {
              const selected = countries.find(c => c.name === e.target.value);
              if (selected) {
                setPays(selected.name);
                setCode(selected.code);
              }
            }}
            className="border p-2 rounded w-1/2"
          >
            {countries.map(c => (
              <option key={c.code} value={c.name}>{c.name}</option>
            ))}
          </select>
          <input
            required
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="Numéro de téléphone"
            className="border p-2 rounded w-1/2"
          />
        </div>

        {/* Champs de localisation optionnels */}
        <div className="flex gap-2">
          <input
            type="number"
            step="any"
            value={latitude ?? ''}
            onChange={(e) => setLatitude(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Latitude (optionnel)"
            className="border p-2 rounded w-1/2"
          />
          <input
            type="number"
            step="any"
            value={longitude ?? ''}
            onChange={(e) => setLongitude(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Longitude (optionnel)"
            className="border p-2 rounded w-1/2"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-blue-600 text-white p-2 rounded"
        >
          {loading ? 'Enregistrement...' : 'Ajouter la compagnie'}
        </button>
      </form>
    </div>
  );
};

export default AdminAjouterCompagnie;