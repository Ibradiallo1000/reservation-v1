// ✅ src/pages/ReceptionCourrierPage.tsx – Corrigé avec vérification simple de la ville
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import type { CustomUser } from '../types';

interface Courrier {
  id: string;
  expediteur: string;
  telephone: string;
  destinataire: string;
  statut: string;
  trajetId?: string;
  valeur: number;
  montant: number;
  createdAt: string;
  agencyId: string;
  ville: string;
  type: string;
}

const ReceptionCourrierPage: React.FC = () => {
  const { user } = useAuth() as { user: CustomUser | null };
  const [courriers, setCourriers] = useState<Courrier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ Version simple et sûre
  const getUserVille = () => {
    if (!user) return null;
    return user.ville || null;
  };

  const fetchCourriers = async () => {
    try {
      setLoading(true);
      setError(null);

      const userVille = getUserVille();
      
      if (!userVille) {
        setError("Configuration requise : Votre ville n'est pas définie dans votre profil");
        setLoading(false);
        return;
      }

      const q = query(
        collection(db, 'courriers'),
        where('statut', '==', 'en attente'),
        where('type', '==', 'envoi'),
        where('ville', '==', userVille)
      );

      const snap = await getDocs(q);
      const list = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Courrier));

      setCourriers(list);
    } catch (err) {
      setError("Erreur de chargement : " + (err as Error).message);
      console.error("Erreur Firestore:", err);
    } finally {
      setLoading(false);
    }
  };

  const marquerCommeRecu = async (id: string) => {
    try {
      const confirmer = window.confirm('Confirmer la réception de ce courrier ?');
      if (!confirmer) return;

      await updateDoc(doc(db, 'courriers', id), {
        statut: 'reçu',
        receivedAt: new Date().toISOString(),
        receivedBy: user?.uid || '',
        agencyReceptId: user?.agencyId || ''
      });

      // Mise à jour locale
      setCourriers(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError("Erreur lors de la mise à jour : " + (err as Error).message);
    }
  };

  useEffect(() => {
    fetchCourriers();
  }, [user]);

  const userVille = getUserVille();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">📥 Réception de courriers</h1>

      {error && <p className="text-red-600">{error}</p>}

      {loading ? (
        <p>Chargement...</p>
      ) : !userVille ? (
        <p className="text-yellow-600">Ville non définie dans le profil utilisateur</p>
      ) : courriers.length === 0 ? (
        <p>Aucun courrier à réceptionner pour {userVille}.</p>
      ) : (
        <ul className="space-y-4">
          {courriers.map(courrier => (
            <li key={courrier.id} className="border p-4 rounded bg-white shadow">
              <p><strong>Expéditeur :</strong> {courrier.expediteur}</p>
              <p><strong>Destinataire :</strong> {courrier.destinataire}</p>
              <p><strong>Valeur :</strong> {courrier.valeur.toLocaleString()} FCFA</p>
              <p><strong>Frais :</strong> {courrier.montant.toLocaleString()} FCFA</p>
              <button
                onClick={() => marquerCommeRecu(courrier.id)}
                className="mt-2 bg-green-600 text-white px-4 py-2 rounded"
              >
                ✅ Marquer comme reçu
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ReceptionCourrierPage;