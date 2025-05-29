// ✅ FormulaireReservationClient.tsx – anciennement BookingPage.tsx

import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { collection, addDoc, Timestamp, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface PassengerData {
  fullName: string;
  phone: string;
  email: string;
}

const FormulaireReservationClient: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug = '' } = useParams();
  const tripData = location.state;

  const [passengerData, setPassengerData] = useState<PassengerData>({
    fullName: '',
    phone: '',
    email: '',
  });

  const [seatsGo, setSeatsGo] = useState<number>(1);
  const [seatsReturn, setSeatsReturn] = useState<number>(1);
  const [tripType, setTripType] = useState<'aller_simple' | 'aller_retour'>('aller_simple');
  const [isPaying, setIsPaying] = useState(false);
  const [totalCost, setTotalCost] = useState<number>(tripData?.price || 0);
  const unitPrice = Number(tripData?.price || 0);

  useEffect(() => {
    const go = seatsGo || 0;
    const ret = tripType === 'aller_retour' ? (seatsReturn || 0) : 0;
    const total = unitPrice * (go + ret);
    setTotalCost(total);
  }, [seatsGo, seatsReturn, tripType, tripData]);

  if (!tripData || !tripData.tripId) {
    return <div className="text-center p-8 text-red-600 font-semibold">Données du voyage introuvables.</div>;
  }

  const handlePassengerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setPassengerData((prev) => ({ ...prev, [name]: value }));
  };

  const increment = (setter: React.Dispatch<React.SetStateAction<number>>, value: number) => {
    if (value < 10) setter(value + 1);
  };
  const decrement = (setter: React.Dispatch<React.SetStateAction<number>>, value: number) => {
    if (value > 1) setter(value - 1);
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passengerData.fullName || !passengerData.phone || seatsGo < 1 || (tripType === 'aller_retour' && seatsReturn < 1)) {
      alert('Veuillez remplir correctement tous les champs obligatoires.');
      return;
    }

    setIsPaying(true);
    try {
      const trajetRef = doc(db, 'dailyTrips', tripData.tripId);
      const trajetSnap = await getDoc(trajetRef);
      if (!trajetSnap.exists()) {
        alert('Trajet introuvable.');
        return;
      }

      const trajet = trajetSnap.data();
      const placesRestantes = trajet.places || 0;
      const totalPlacesDemandées = seatsGo + (tripType === 'aller_retour' ? seatsReturn : 0);

      if (placesRestantes < totalPlacesDemandées) {
        alert(`Il ne reste que ${placesRestantes} place(s) disponible(s) pour ce trajet.`);
        return;
      }

      const agenceRef = doc(db, 'agences', tripData.agencyId);
      const agenceSnap = await getDoc(agenceRef);
      if (!agenceSnap.exists()) {
        alert("Agence introuvable.");
        return;
      }

      const agenceData = agenceSnap.data();
      const commissionRate = agenceData.commissionRate || 0.05;
      const companySlug = agenceData.slug || slug;

      const booking = {
        nomClient: passengerData.fullName,
        telephone: passengerData.phone,
        email: passengerData.email,
        depart: tripData.departure || '',
        arrivee: tripData.arrival || '',
        date: tripData.date || '',
        heure: tripData.time || '',
        montant: totalCost,
        seatsGo,
        seatsReturn: tripType === 'aller_retour' ? seatsReturn : 0,
        tripType,
        canal: 'en_ligne',
        statut: 'payé',
        createdAt: Timestamp.now(),
        companyId: tripData.companyId || null,
        agencyId: tripData.agencyId || null,
        trajetId: tripData.tripId,
        paiement: 'mobile_money',
        commission: totalCost * commissionRate,
        companySlug: slug || agenceData.slug || '',
      };

      const docRef = await addDoc(collection(db, 'reservations'), booking);
      await updateDoc(trajetRef, {
        places: placesRestantes - totalPlacesDemandées
      });

     navigate(`/reservation-confirmation/${docRef.id}`, { state: { slug: companySlug } });

    } catch (error: any) {
      console.error('Erreur Firestore complète :', error);
      alert('Erreur Firestore : ' + (error?.message || 'inconnue'));
    } finally {
      setIsPaying(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6 text-center">
        {tripData.logoUrl && (
          <img src={tripData.logoUrl} alt="Logo Compagnie" className="h-20 mx-auto mb-2" />
        )}
        <h2 className="text-xl font-bold mb-2">{tripData.company}</h2>
        <p className="text-gray-600 mb-1">{tripData.departure} → {tripData.arrival}</p>
        <p className="text-gray-600 mb-1">Date : {tripData.date} — Heure : {tripData.time}</p>
        <p className="text-gray-600 mb-1">Durée : {tripData.duration || 'Non précisée'}</p>
        <p className="text-lg font-bold mt-2">Prix unitaire : {unitPrice.toLocaleString()} FCFA</p>
      </div>

      <form onSubmit={handlePayment} className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">Informations du passager principal</h2>
        <div className="space-y-4">
          <input type="text" name="fullName" value={passengerData.fullName} onChange={handlePassengerChange} placeholder="Nom complet *" className="block w-full rounded border px-3 py-2" required />
          <input type="tel" name="phone" value={passengerData.phone} onChange={handlePassengerChange} placeholder="Téléphone *" className="block w-full rounded border px-3 py-2" required />
          <input type="email" name="email" value={passengerData.email} onChange={handlePassengerChange} placeholder="Email" className="block w-full rounded border px-3 py-2" />

          <div className="flex items-center gap-3">
            <span className="text-sm">Lieux (aller)</span>
            <button type="button" className="px-2 py-1 bg-gray-200 rounded" onClick={() => decrement(setSeatsGo, seatsGo)}>-</button>
            <span className="font-semibold">{seatsGo}</span>
            <button type="button" className="px-2 py-1 bg-gray-200 rounded" onClick={() => increment(setSeatsGo, seatsGo)}>+</button>
          </div>

          {tripType === 'aller_retour' && (
            <div className="flex items-center gap-3">
              <span className="text-sm">Lieux (retour)</span>
              <button type="button" className="px-2 py-1 bg-gray-200 rounded" onClick={() => decrement(setSeatsReturn, seatsReturn)}>-</button>
              <span className="font-semibold">{seatsReturn}</span>
              <button type="button" className="px-2 py-1 bg-gray-200 rounded" onClick={() => increment(setSeatsReturn, seatsReturn)}>+</button>
            </div>
          )}

          <div className="flex gap-4 mt-2">
            <label className="inline-flex items-center">
              <input type="radio" value="aller_simple" checked={tripType === 'aller_simple'} onChange={() => setTripType('aller_simple')} />
              <span className="ml-2">Aller simple</span>
            </label>
            <label className="inline-flex items-center">
              <input type="radio" value="aller_retour" checked={tripType === 'aller_retour'} onChange={() => setTripType('aller_retour')} />
              <span className="ml-2">Aller-retour</span>
            </label>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-sm text-gray-600 mb-1">{unitPrice.toLocaleString()} FCFA x {tripType === 'aller_retour' ? `${seatsGo} + ${seatsReturn}` : seatsGo} place(s)</p>
          <p className="text-lg font-bold mb-2">Total : {totalCost.toLocaleString()} FCFA</p>
          <button type="submit" disabled={isPaying} className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700">
            {isPaying ? 'Traitement en cours...' : 'Réserver maintenant'}
          </button>
        </div>

        <div className="mt-4 text-sm text-gray-500">
          <p className="italic">Moyen de paiement mobile money obligatoire (intégration de SinetPay à venir)</p>
        </div>
      </form>
    </div>
  );
};

export default FormulaireReservationClient;
