import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: name.includes('seats') ? parseInt(value) : value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      updatedAt: new Date().toISOString()
    });
    onUpdated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-lg w-full max-w-xl space-y-4">
        <h2 className="text-xl font-bold">Modifier la réservation</h2>

        <div className="grid grid-cols-2 gap-4">
          <input name="nomClient" value={form.nomClient} onChange={handleChange} placeholder="Nom" className="border p-2 rounded" />
          <input name="telephone" value={form.telephone} onChange={handleChange} placeholder="Téléphone" className="border p-2 rounded" />
          <input name="depart" value={form.depart} onChange={handleChange} placeholder="Départ" className="border p-2 rounded" />
          <input name="arrivee" value={form.arrivee} onChange={handleChange} placeholder="Arrivée" className="border p-2 rounded" />
          <input name="date" type="date" value={form.date} onChange={handleChange} className="border p-2 rounded" />
          <input name="heure" type="time" value={form.heure} onChange={handleChange} className="border p-2 rounded" />
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
          <input name="seatsGo" type="number" value={form.seatsGo} onChange={handleChange} placeholder="Places aller" className="border p-2 rounded" />
          {form.typeVoyage === 'aller-retour' && (
            <input name="seatsReturn" type="number" value={form.seatsReturn} onChange={handleChange} placeholder="Places retour" className="border p-2 rounded" />
          )}
        </div>

        <div className="flex justify-end gap-4">
          <button type="button" onClick={onClose} className="text-gray-500">Annuler</button>
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Enregistrer</button>
        </div>
      </form>
    </div>
  );
};

export default ModifierReservationForm;
