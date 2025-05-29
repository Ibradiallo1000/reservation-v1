
// src/pages/TicketPage.tsx

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import QRCode from 'react-qr-code';
import html2pdf from 'html2pdf.js';

const TicketPage: React.FC = () => {
  const { id } = useParams();
  const [data, setData] = useState<any | null>(null);
  const [compagnie, setCompagnie] = useState<{ nom: string; logoUrl?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      try {
        const ref = doc(db, 'reservations', id);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const reservationData = snap.data();
          setData({ id, ...reservationData });

          if (reservationData.compagnieId) {
            const compagnieRef = doc(db, 'compagnies', reservationData.compagnieId);
            const compagnieSnap = await getDoc(compagnieRef);
            if (compagnieSnap.exists()) {
              setCompagnie(compagnieSnap.data() as any);
            }
          }
        } else {
          console.error("Réservation introuvable.");
        }
      } catch (e) {
        console.error("Erreur Firestore :", e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [id]);

  const handlePDF = () => {
    if (receiptRef.current) {
      html2pdf()
        .set({
          margin: 0.5,
          filename: `ticket-${id}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2 },
        })
        .from(receiptRef.current)
        .save();
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Chargement du billet...</div>;
  }

  if (!data) {
    return <div className="text-center text-red-600 font-semibold p-8">Réservation introuvable.</div>;
  }

  const { nomClient, telephone, places, date, heure, depart, arrivee, montant } = data;
  const qrContent = JSON.stringify({
    id,
    nomClient,
    telephone,
    depart,
    arrivee,
    date,
    heure,
  });

  return (
    <div className="min-h-screen bg-gray-100 py-10 px-4 print:bg-white">
      <div
        ref={receiptRef}
        className="max-w-2xl mx-auto bg-white p-6 rounded-xl shadow-lg border border-gray-200 print:shadow-none print:border-none"
      >
        <div className="text-center mb-2">
          {compagnie?.logoUrl && (
            <img src={compagnie.logoUrl} alt="Logo Compagnie" className="h-12 mx-auto mb-2" />
          )}
          <h1 className="text-2xl font-bold uppercase text-gray-800">
            {compagnie?.nom || 'Nom Compagnie'}
          </h1>
        </div>

        <div className="text-center text-sm text-gray-500 mb-6">🎫 Billet électronique – À présenter au départ</div>

        <div className="mb-4 text-sm text-gray-800">
          <h2 className="font-semibold text-yellow-600 mb-2">👤 Informations du passager</h2>
          <p><strong>Nom :</strong> {nomClient}</p>
          <p><strong>Téléphone :</strong> {telephone}</p>
        </div>

        <div className="mb-4 text-sm text-gray-800">
          <h2 className="font-semibold text-yellow-600 mb-2">🚌 Détails du voyage</h2>
          <p><strong>Trajet :</strong> {depart} → {arrivee}</p>
          <p><strong>Date :</strong> {date}</p>
          <p><strong>Heure :</strong> {heure}</p>
          <p><strong>Nombre de places :</strong> {places}</p>
          <p><strong>Montant total :</strong> {montant} FCFA</p>
        </div>

        <div className="flex justify-center mt-6 mb-4">
          <div className="border border-gray-300 p-4 rounded-lg bg-white">
            <QRCode value={qrContent} size={120} />
          </div>
        </div>

        <p className="text-center text-xs text-gray-400">ID Réservation : {id}</p>
      </div>

      <div className="print:hidden flex justify-center gap-4 mt-6">
        <button
          onClick={() => window.print()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium shadow"
        >
          🖨️ Imprimer
        </button>
        <button
          onClick={handlePDF}
          className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg font-medium shadow"
        >
          ⬇️ Télécharger PDF
        </button>
      </div>
    </div>
  );
};

export default TicketPage;
