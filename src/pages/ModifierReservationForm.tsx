import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import toast from 'react-hot-toast';

interface Props {
  reservation: any;
  onClose: () => void;
  onUpdated: () => void;
}

const ModifierReservationForm: React.FC<Props> = ({ reservation, onClose, onUpdated }) => {
  const [form, setForm] = useState({
    nomClient: reservation.nomClient || '',
    telephone: reservation.telephone || '',
    depart: reservation.depart || '',
    arrivee: reservation.arrivee || '',
    date: reservation.date || '',
    heure: reservation.heure || '',
    seatsGo: reservation.seatsGo || 1,
    seatsReturn: reservation.seatsReturn || 0,
    typeVoyage: reservation.seatsReturn > 0 ? 'aller-retour' : 'aller-simple',
  });

  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: name.includes('seats') ? Math.max(0, parseInt(value)) : value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.nomClient || !form.telephone || !form.depart || !form.arrivee || !form.date || !form.heure) {
      toast.error('Veuillez remplir tous les champs obligatoires.');
      return;
    }

    if (form.seatsGo <= 0) {
      toast.error('Le nombre de places aller doit être supérieur à zéro.');
      return;
    }

    if (form.typeVoyage === 'aller-retour' && form.seatsReturn <= 0) {
      toast.error('Le nombre de places retour doit être supérieur à zéro.');
      return;
    }

    setLoading(true);

    try {
      const ref = doc(db, 'reservations', reservation.id);
      await updateDoc(ref, {
        nomClient: form.nomClient,
        telephone: form.telephone,
        depart: form.depart,
        arrivee: form.arrivee,
        date: form.date,
        heure: form.heure,
        seatsGo: form.seatsGo,
        seatsReturn: form.typeVoyage === 'aller-retour' ? form.seatsReturn : 0,
        updatedAt: new Date().toISOString(),
      });

      toast.success('Réservation mise à jour avec succès ✅');
      onUpdated();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Erreur lors de la mise à jour.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-lg w-full max-w-xl space-y-4">
        <h2 className="text-xl font-bold">Modifier la réservation</h2>

        <div className="grid grid-cols-2 gap-4">
          <input name="nomClient" value={form.nomClient} onChange={handleChange} placeholder="Nom" className="border p-2 rounded" required />
          <input name="telephone" value={form.telephone} onChange={handleChange} placeholder="Téléphone" className="border p-2 rounded" required />
          <input name="depart" value={form.depart} onChange={handleChange} placeholder="Départ" className="border p-2 rounded" required />
          <input name="arrivee" value={form.arrivee} onChange={handleChange} placeholder="Arrivée" className="border p-2 rounded" required />
          <input name="date" type="date" value={form.date} onChange={handleChange} className="border p-2 rounded" required />
          <input name="heure" type="time" value={form.heure} onChange={handleChange} className="border p-2 rounded" required />
        </div>

        <div className="flex gap-4 items-center">
          <label>
            <input
              type="radio"
              name="typeVoyage"
              value="aller-simple"
              checked={form.typeVoyage === 'aller-simple'}
              onChange={handleChange}
            /> Aller simple
          </label>
          <label>
            <input
              type="radio"
              name="typeVoyage"
              value="aller-retour"
              checked={form.typeVoyage === 'aller-retour'}
              onChange={handleChange}
            /> Aller-retour
          </label>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <input name="seatsGo" type="number" value={form.seatsGo} onChange={handleChange} placeholder="Places aller" className="border p-2 rounded" min={1} required />
          {form.typeVoyage === 'aller-retour' && (
            <input name="seatsReturn" type="number" value={form.seatsReturn} onChange={handleChange} placeholder="Places retour" className="border p-2 rounded" min={1} required />
          )}
        </div>

        <div className="flex justify-end gap-4">
          <button type="button" onClick={onClose} disabled={loading} className="text-gray-500">Annuler</button>
          <button type="submit" disabled={loading} className={`px-4 py-2 rounded text-white ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ModifierReservationForm;
