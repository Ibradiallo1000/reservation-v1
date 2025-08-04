import React, { useState } from 'react';
import { auth, db } from '../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, collection, Timestamp } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const countries = [
  { name: 'Mali', code: '+223' },
  { name: 'Sénégal', code: '+221' },
  { name: "Côte d'Ivoire", code: '+225' },
  { name: 'Burkina Faso', code: '+226' },
  { name: 'Togo', code: '+228' },
];

// Fonction utilitaire pour générer un slug
const slugify = (str: string) =>
  str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, '')   // supprime accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')         // supprime tout sauf lettres/chiffres
    .trim();

const AdminAjouterCompagnie: React.FC<{ onSuccess?: () => void }> = ({ onSuccess }) => {
  const navigate = useNavigate();
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
      // Création utilisateur Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, motDePasse);
      const uid = userCredential.user.uid;
      const companyId = uid;
      const slug = slugify(nom);

      // Création document compagnie
      await setDoc(doc(db, 'companies', companyId), {
        nom,
        email,
        pays,
        telephone: `${code}${telephone}`,
        responsable,
        plan: 'free',
        createdAt: Timestamp.now(),
        commissionRate: 0.1, // 10% par défaut
        status: 'actif',
        logoUrl: '',
        banniereUrl: '',
        description: `Bienvenue chez ${nom}`,
        slug,
        latitude: latitude || null,
        longitude: longitude || null,
        themeStyle: 'moderne',
        couleurPrimaire: '#3B82F6',
        couleurSecondaire: '#10B981',
        police: 'sans-serif',
        publicVisible: true,
        vues: 0,
        modifiable: true, // pour l’édition future
      });

      // Création de l'agence principale
      const mainAgencyRef = doc(collection(db, 'companies', companyId, 'agences'));
      await setDoc(mainAgencyRef, {
        nom: 'Siège principal',
        adresse: '',
        telephone: `${code}${telephone}`,
        createdAt: Timestamp.now(),
        latitude: latitude || null,
        longitude: longitude || null,
        responsable: responsable,
        active: true,
        slug: 'siegeprincipal',
        isHeadOffice: true
      });

      // Création du document utilisateur
      await setDoc(doc(db, 'users', uid), {
        email,
        role: 'admin_compagnie',
        companyId,
        agencyId: mainAgencyRef.id,
        companyName: nom,
        nom: responsable,
        createdAt: Timestamp.now()
      });

      alert('✅ Compagnie, agence principale et administrateur créés avec succès !');
      navigate('/compagnies'); // Redirection automatique vers la gestion des compagnies

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
          className="bg-orange-600 text-white p-2 rounded hover:bg-orange-700 transition"
        >
          {loading ? 'Enregistrement...' : 'Ajouter la compagnie'}
        </button>
      </form>
    </div>
  );
};

export default AdminAjouterCompagnie;
