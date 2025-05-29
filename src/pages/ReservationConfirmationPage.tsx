import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';

interface LocationState {
  slug?: string;
}

const ReservationConfirmationPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { slug = 'compagnie' } = location.state as LocationState; // fallback au cas où

  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setRedirecting(true);
      setTimeout(() => {
        navigate(`/compagnie/${slug}/receipt/${id}`);
      }, 3000); // Redirection après 3s d'affichage
    }, 3000); // Simulation de traitement initial

    return () => clearTimeout(timer);
  }, [id, navigate, slug]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white text-gray-800 px-4">
      {!redirecting ? (
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-yellow-400 border-dashed rounded-full animate-spin mx-auto mb-6"></div>
          <h1 className="text-xl font-semibold mb-2">Paiement en cours...</h1>
          <p className="text-gray-600 mb-4">
            Veuillez patienter pendant le traitement de votre réservation.
          </p>
        </div>
      ) : (
        <div className="text-center">
          <div className="text-4xl text-green-500 mb-4">✅</div>
          <h1 className="text-xl font-bold text-green-600 mb-2">Paiement réussi !</h1>
          <p className="text-gray-700 mb-4">
            Merci pour votre réservation. Votre reçu est prêt.
          </p>
          <button
            onClick={() => navigate(`/compagnie/${slug}/receipt/${id}`)}
            className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700 transition"
          >
            Voir mon reçu
          </button>
          <p className="text-xs text-gray-400 mt-4">Redirection automatique dans quelques secondes...</p>
        </div>
      )}
    </div>
  );
};

export default ReservationConfirmationPage;
