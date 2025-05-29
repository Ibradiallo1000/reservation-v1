import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface Agence {
  id?: string;
  nomAgence: string;
  ville: string;
  pays: string;
  quartier?: string;
  type?: string;
  companyId: string;
  statut: 'active' | 'inactive';
  emailGerant: string;
  nomGerant: string;
  telephone: string;
  latitude?: number | null;
  longitude?: number | null;
}

const CompagnieAgencesPage: React.FC = () => {
  const { user } = useAuth();
  const [agences, setAgences] = useState<Agence[]>([]);
  const [nomAgence, setNomAgence] = useState('');
  const [ville, setVille] = useState('');
  const [pays, setPays] = useState('');
  const [quartier, setQuartier] = useState('');
  const [type, setType] = useState('');
  const [emailGerant, setEmailGerant] = useState('');
  const [nomGerant, setNomGerant] = useState('');
  const [telephone, setTelephone] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nomAgence: '', ville: '', quartier: '' });

  const fetchAgences = async () => {
    if (!user?.companyId) return;
    const q = query(collection(db, 'agences'), where('companyId', '==', user.companyId));
    const snap = await getDocs(q);
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Agence[];
    setAgences(list);
  };

  useEffect(() => {
    fetchAgences();
  }, [user]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, emailGerant, motDePasse);
      const uid = userCredential.user.uid;

      const agenceRef = await addDoc(collection(db, 'agences'), {
        nomAgence,
        ville,
        pays,
        quartier,
        type,
        statut: 'active',
        emailGerant,
        nomGerant,
        telephone,
        companyId: user?.companyId || '',
        latitude: latitude !== '' ? parseFloat(latitude) : null,
        longitude: longitude !== '' ? parseFloat(longitude) : null,
      });

      await setDoc(doc(db, 'users', uid), {
        uid,
        email: emailGerant,
        nom: nomGerant,
        telephone,
        role: 'chefAgence',
        companyId: user?.companyId || '',
        agencyId: agenceRef.id,
      });

      alert('Agence et gérant créés.');
      setNomAgence('');
      setVille('');
      setPays('');
      setQuartier('');
      setType('');
      setEmailGerant('');
      setNomGerant('');
      setTelephone('');
      setMotDePasse('');
      setLatitude('');
      setLongitude('');
      fetchAgences();
    } catch (err: any) {
      console.error("Erreur pendant la création Firestore:", err.message);
      alert(err.message);
    }
  };

  const handleToggle = (id: string) => {
    setExpanded(expanded === id ? null : id);
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Supprimer cette agence ?')) {
      await deleteDoc(doc(db, 'agences', id));
      fetchAgences();
    }
  };

  const handleToggleStatut = async (agence: Agence) => {
    const newStatut = agence.statut === 'active' ? 'inactive' : 'active';
    await updateDoc(doc(db, 'agences', agence.id!), { statut: newStatut });
    fetchAgences();
  };

  const handleEditClick = (ag: Agence) => {
    setEditingId(ag.id!);
    setEditForm({
      nomAgence: ag.nomAgence,
      ville: ag.ville,
      quartier: ag.quartier || '',
    });
  };

  const handleUpdate = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    await updateDoc(doc(db, 'agences', id), {
      nomAgence: editForm.nomAgence,
      ville: editForm.ville,
      quartier: editForm.quartier,
    });
    setEditingId(null);
    fetchAgences();
  };

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Gestion des agences</h2>

      <form onSubmit={handleAdd} className="grid md:grid-cols-2 gap-4 mb-8">
        <input placeholder="Nom de l’agence" value={nomAgence} onChange={e => setNomAgence(e.target.value)} className="border p-2 rounded" required />
        <input placeholder="Ville" value={ville} onChange={e => setVille(e.target.value)} className="border p-2 rounded" required />
        <input placeholder="Pays" value={pays} onChange={e => setPays(e.target.value)} className="border p-2 rounded" required />
        <input placeholder="Quartier (optionnel)" value={quartier} onChange={e => setQuartier(e.target.value)} className="border p-2 rounded" />
        <input placeholder="Type (optionnel)" value={type} onChange={e => setType(e.target.value)} className="border p-2 rounded" />
        <input placeholder="Latitude (optionnel)" value={latitude} onChange={e => setLatitude(e.target.value)} className="border p-2 rounded" />
        <input placeholder="Longitude (optionnel)" value={longitude} onChange={e => setLongitude(e.target.value)} className="border p-2 rounded" />
        <input placeholder="Nom du gérant" value={nomGerant} onChange={e => setNomGerant(e.target.value)} className="border p-2 rounded" required />
        <input placeholder="Email du gérant" type="email" value={emailGerant} onChange={e => setEmailGerant(e.target.value)} className="border p-2 rounded" required />
        <input placeholder="Mot de passe" type="password" value={motDePasse} onChange={e => setMotDePasse(e.target.value)} className="border p-2 rounded" required />
        <input placeholder="Téléphone" value={telephone} onChange={e => setTelephone(e.target.value)} className="border p-2 rounded" required />
        <button type="submit" className="bg-green-600 text-white rounded p-2 col-span-2">Ajouter l’agence</button>
      </form>

      <h3 className="text-lg font-semibold mb-2">Liste des agences</h3>
      <div className="space-y-2">
        {agences.map(ag => (
          <div key={ag.id} className="bg-white border rounded shadow">
            <div
              onClick={() => handleToggle(ag.id!)}
              className="cursor-pointer p-3 flex justify-between items-center hover:bg-gray-50"
            >
              <span className="font-bold text-yellow-800">{ag.nomAgence}</span>
              <span className={`text-sm ${ag.statut === 'active' ? 'text-green-600' : 'text-red-600'}`}>{ag.statut}</span>
            </div>
            {expanded === ag.id && (
              <div className="p-4 border-t text-sm text-gray-600 space-y-1">
                <p><strong>Ville:</strong> {ag.ville} – <strong>Pays:</strong> {ag.pays}</p>
                <p><strong>Quartier:</strong> {ag.quartier || '-'}</p>
                <p><strong>Type:</strong> {ag.type || '-'}</p>
                <p><strong>Latitude:</strong> {ag.latitude ?? '-'}</p>
                <p><strong>Longitude:</strong> {ag.longitude ?? '-'}</p>
                <p><strong>Email du gérant:</strong> {ag.emailGerant}</p>
                <p><strong>Téléphone:</strong> {ag.telephone}</p>
                {editingId === ag.id ? (
                  <form onSubmit={(e) => handleUpdate(e, ag.id!)} className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2">
                    <input value={editForm.nomAgence} onChange={(e) => setEditForm({ ...editForm, nomAgence: e.target.value })} className="border p-1 rounded" placeholder="Nom agence" required />
                    <input value={editForm.ville} onChange={(e) => setEditForm({ ...editForm, ville: e.target.value })} className="border p-1 rounded" placeholder="Ville" required />
                    <input value={editForm.quartier} onChange={(e) => setEditForm({ ...editForm, quartier: e.target.value })} className="border p-1 rounded" placeholder="Quartier" />
                    <button type="submit" className="bg-green-600 text-white px-2 py-1 rounded col-span-2">Enregistrer</button>
                  </form>
                ) : (
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => handleToggleStatut(ag)} className="px-2 py-1 rounded bg-yellow-500 text-white">
                      {ag.statut === 'active' ? 'Désactiver' : 'Activer'}
                    </button>
                    <button onClick={() => handleEditClick(ag)} className="px-2 py-1 rounded bg-blue-600 text-white">Modifier</button>
                    <button onClick={() => handleDelete(ag.id!)} className="px-2 py-1 rounded bg-red-600 text-white">Supprimer</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CompagnieAgencesPage;
