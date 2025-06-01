
// ✅ src/pages/FormulaireEnvoiCourrier.tsx – version professionnelle avec sections et calcul dynamique
import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface Trajet {
  id: string;
  departure: string;
  arrival: string;
  date: string;
  time: string;
}

const FormulaireEnvoiCourrier: React.FC = () => {
  const { user } = useAuth();
  const [expediteur, setExpediteur] = useState('');
  const [telephone, setTelephone] = useState('');
  const [destinataire, setDestinataire] = useState('');
  const [numeroDestinataire, setNumeroDestinataire] = useState('');
  const [ville, setVille] = useState('');
  const [adresse, setAdresse] = useState('');
  const [description, setDescription] = useState('');
  const [typeColis, setTypeColis] = useState('colis');
  const [modePaiement, setModePaiement] = useState('espèces');
  const [valeur, setValeur] = useState<number>(0);
  const [montant, setMontant] = useState<number | null>(null);
  const [trajetId, setTrajetId] = useState('');
  const [trajets, setTrajets] = useState<Trajet[]>([]);

  useEffect(() => {
    const pourcentage = 0.05; // ⚠️ Peut être dynamique selon compagnie
    if (valeur > 0) {
      setMontant(Math.ceil(valeur * pourcentage));
    } else {
      setMontant(null);
    }
  }, [valeur]);

  useEffect(() => {
  const fetchTrajets = async () => {
    const q = query(collection(db, 'dailyTrips'), where('companyId', '==', user?.companyId));
    const snap = await getDocs(q);
    const today = new Date().toISOString().split('T')[0]; // 📅 Date du jour

    const list = snap.docs
      .map(doc => ({ id: doc.id, ...doc.data() } as Trajet))
      .filter(trajet => trajet.date >= today); // ✅ Ne garder que les dates à venir

    setTrajets(list);
  };
  fetchTrajets();
}, [user?.companyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.agencyId) return;

    await addDoc(collection(db, 'courriers'), {
      expediteur,
      telephone,
      destinataire,
      numeroDestinataire,
      ville,
      adresse,
      description,
      typeColis,
      modePaiement,
      valeur,
      montant: montant || 0,
      statut: 'en attente',
      createdAt: new Date().toISOString(),
      agencyId: user.agencyId,
      companyId: user.companyId,
      trajetId,
      type: 'envoi',
    });

    alert('📦 Courrier enregistré avec succès !');
    setExpediteur('');
    setTelephone('');
    setDestinataire('');
    setNumeroDestinataire('');
    setVille('');
    setAdresse('');
    setDescription('');
    setTypeColis('colis');
    setModePaiement('espèces');
    setValeur(0);
    setMontant(null);
    setTrajetId('');
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">📦 Enregistrement d’un envoi</h1>
      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-md">

        {/* Bloc expéditeur */}
        <fieldset className="border rounded p-4">
          <legend className="text-lg font-semibold text-gray-700">🧍 Informations de l’expéditeur</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <input value={expediteur} onChange={e => setExpediteur(e.target.value)} placeholder="Nom de l'expéditeur" className="border p-2 rounded" required />
            <input value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="Téléphone de l'expéditeur" className="border p-2 rounded" required />
          </div>
        </fieldset>

        {/* Bloc destinataire */}
        <fieldset className="border rounded p-4">
          <legend className="text-lg font-semibold text-gray-700">📬 Destinataire</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <input value={destinataire} onChange={e => setDestinataire(e.target.value)} placeholder="Nom du destinataire" className="border p-2 rounded" required />
            <input value={numeroDestinataire} onChange={e => setNumeroDestinataire(e.target.value)} placeholder="Numéro du destinataire" className="border p-2 rounded" required />
            <input value={ville} onChange={e => setVille(e.target.value)} placeholder="Ville de destination" className="border p-2 rounded" required />
            <input value={adresse} onChange={e => setAdresse(e.target.value)} placeholder="Adresse de livraison" className="border p-2 rounded" />
          </div>
        </fieldset>

        {/* Bloc colis */}
        <fieldset className="border rounded p-4">
          <legend className="text-lg font-semibold text-gray-700">📦 Colis</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Description du colis" className="border p-2 rounded" />
            <select value={typeColis} onChange={e => setTypeColis(e.target.value)} className="border p-2 rounded">
              <option value="colis">Colis</option>
              <option value="document">Document</option>
              <option value="autre">Autre</option>
            </select>
          </div>
        </fieldset>

        {/* Bloc valeur + paiement */}
        <fieldset className="border rounded p-4">
          <legend className="text-lg font-semibold text-gray-700">💰 Paiement</legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <input type="number" value={valeur} onChange={e => setValeur(Number(e.target.value))} placeholder="Valeur déclarée (FCFA)" className="border p-2 rounded" required />
            <select value={modePaiement} onChange={e => setModePaiement(e.target.value)} className="border p-2 rounded">
              <option value="espèces">Espèces</option>
              <option value="mobile_money">Mobile Money</option>
              <option value="virement">Virement bancaire</option>
            </select>
          </div>
          {montant !== null && <div className="text-right mt-2 text-green-600 font-semibold">Montant à payer : {montant} FCFA</div>}
        </fieldset>

        {/* Bloc trajet */}
        <fieldset className="border rounded p-4">
          <legend className="text-lg font-semibold text-gray-700">🚌 Trajet assigné</legend>
          <select value={trajetId} onChange={e => setTrajetId(e.target.value)} className="border p-2 rounded w-full mt-4" required>
            <option value="">-- Sélectionner un trajet --</option>
            {trajets.map(trajet => (
              <option key={trajet.id} value={trajet.id}>
                {trajet.departure} → {trajet.arrival} ({trajet.date} à {trajet.time})
              </option>
            ))}
          </select>
        </fieldset>

        <div className="text-right">
          <button type="submit" className="bg-yellow-600 hover:bg-yellow-700 text-white px-6 py-2 rounded font-medium">
            Enregistrer l’envoi
          </button>
        </div>
      </form>
    </div>
  );
};

export default FormulaireEnvoiCourrier;
