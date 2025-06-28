import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import ModifierReservationForm from './ModifierReservationForm';
import { useNavigate } from 'react-router-dom';

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  canal: string;
  montant?: number;
  statut: string;
}

const ITEMS_PER_PAGE = 15;

const AgenceReservationsPage: React.FC = () => {
  const { user, company } = useAuth();
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dateFiltre, setDateFiltre] = useState('');
  const [heureFiltre, setHeureFiltre] = useState('');
  const [trajetFiltre, setTrajetFiltre] = useState('');
  const [canalFiltre, setCanalFiltre] = useState('');
  const [page, setPage] = useState(1);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [reservationAModifier, setReservationAModifier] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Effet de particules holographiques
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '0';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = Array(100).fill(0).map(() => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 3 + 1,
      speedX: (Math.random() - 0.5) * 0.5,
      speedY: (Math.random() - 0.5) * 0.5,
      color: `rgba(0, ${Math.floor(Math.random() * 255)}, ${Math.floor(Math.random() * 255)}, ${Math.random() * 0.3 + 0.1}`
    }));

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particles.forEach(p => {
        p.x += p.speedX;
        p.y += p.speedY;
        
        if (p.x < 0 || p.x > canvas.width) p.speedX *= -1;
        if (p.y < 0 || p.y > canvas.height) p.speedY *= -1;
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      });
      
      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      document.body.removeChild(canvas);
    };
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.agencyId) return;
      setIsLoading(true);
      try {
        const q = query(
          collection(db, 'reservations'),
          where('agencyId', '==', user.agencyId),
          where('statut', '==', 'payé')
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Reservation[];
        setReservations(data);
      } catch (error) {
        console.error("Erreur de chargement:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user?.agencyId]);

  const filteredReservations = useMemo(() => {
    return reservations.filter((res) => {
      const matchDate = dateFiltre ? res.date === dateFiltre : true;
      const matchHeure = heureFiltre ? res.heure === heureFiltre : true;
      const matchTrajet = trajetFiltre
        ? `${res.depart.toLowerCase()}-${res.arrivee.toLowerCase()}`.includes(trajetFiltre.toLowerCase())
        : true;
      const matchCanal = canalFiltre ? res.canal === canalFiltre : true;
      return matchDate && matchHeure && matchTrajet && matchCanal;
    });
  }, [reservations, dateFiltre, heureFiltre, trajetFiltre, canalFiltre]);

  const paginatedReservations = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredReservations.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredReservations, page]);

  const handleImpression = () => {
    navigate('impression-reservations', {
      state: {
        reservations: filteredReservations,
        date: dateFiltre,
        heure: heureFiltre,
        trajet: trajetFiltre,
        agencyName: user?.agencyName,
        logoUrl: company?.logoUrl,
        companyName: company?.nom,
      },
    });
  };

  const today = format(new Date(), 'dd/MM/yyyy');

  return (
    <div className="min-h-screen bg-gray-900 p-6 text-gray-100 relative overflow-hidden">
      {/* Effet de grille futuriste */}
      <div className="fixed inset-0 grid-lines pointer-events-none"></div>
      
      {/* En-tête holographique */}
      <div className="relative mb-8 p-6 rounded-xl bg-gray-800 bg-opacity-20 backdrop-blur-lg border border-cyan-400 border-opacity-30 overflow-hidden">
        <div className="absolute inset-0 holo-grid-effect"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 neon-text">
              Gestion des Réservations
            </h1>
            <p className="text-sm text-gray-400 mt-1">{user?.agencyName}</p>
          </div>
          <button
            onClick={handleImpression}
            className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-cyan-400/30 transition-all hover:scale-105 transform"
          >
            <span className="flex items-center">
              <span className="mr-2">🖨️</span>
              <span className="text-shadow">Imprimer la liste</span>
            </span>
          </button>
        </div>
      </div>

      {/* Filtres futuristes */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { value: dateFiltre, setter: setDateFiltre, type: 'date', placeholder: '', icon: 'calendar' },
          { value: heureFiltre, setter: setHeureFiltre, type: 'time', placeholder: '', icon: 'clock' },
          { value: trajetFiltre, setter: setTrajetFiltre, type: 'text', placeholder: 'Rechercher un trajet...', icon: 'search' },
        ].map((filter, idx) => (
          <div key={idx} className="relative sci-fi-input-container">
            <input 
              type={filter.type}
              value={filter.value}
              onChange={e => filter.setter(e.target.value)}
              placeholder={filter.placeholder}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
            />
            <div className="sci-fi-input-icon">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {filter.icon === 'calendar' && (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                )}
                {filter.icon === 'clock' && (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                )}
                {filter.icon === 'search' && (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                )}
              </svg>
            </div>
          </div>
        ))}

        <select 
          value={canalFiltre} 
          onChange={e => setCanalFiltre(e.target.value)} 
          className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent appearance-none sci-fi-select"
        >
          <option value="">Tous les canaux</option>
          <option value="guichet">Guichet</option>
          <option value="ligne">En ligne</option>
        </select>
      </div>

      {/* Tableau holographique */}
      <div ref={receiptRef} className="rounded-xl bg-gray-800 bg-opacity-20 backdrop-blur-lg border border-cyan-400 border-opacity-30 overflow-hidden mb-8 sci-fi-table-container">
        {/* En-tête de compagnie */}
        <div className="p-6 text-center border-b border-gray-700 relative">
          <div className="absolute inset-0 holo-header-effect"></div>
          {company?.logoUrl && (
            <div className="relative z-10">
              <img src={company.logoUrl} alt="logo" className="h-16 mx-auto mb-4 filter drop-shadow-lg" />
            </div>
          )}
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 relative z-10 neon-text">
            {company?.nom || 'Compagnie de Transport'}
          </h2>
          <p className="text-sm text-gray-400 mt-1 relative z-10">
            {user?.agencyName} • {today}
          </p>
        </div>

        {/* Tableau responsive */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-700 bg-opacity-30 text-gray-300">
                <th className="p-4 text-left font-medium">#</th>
                <th className="p-4 text-left font-medium">Client</th>
                <th className="p-4 text-left font-medium">Contact</th>
                <th className="p-4 text-left font-medium">Trajet</th>
                <th className="p-4 text-left font-medium">Date</th>
                <th className="p-4 text-left font-medium">Heure</th>
                <th className="p-4 text-left font-medium">Canal</th>
                <th className="p-4 text-right font-medium">Montant</th>
                <th className="p-4 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center">
                    <div className="flex justify-center">
                      <div className="h-8 w-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  </td>
                </tr>
              ) : paginatedReservations.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-gray-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Aucune réservation trouvée</span>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedReservations.map((res, i) => (
                  <tr 
                    key={res.id} 
                    className="border-t border-gray-700 hover:bg-gray-700/20 transition-colors duration-150"
                  >
                    <td className="p-4 text-gray-400">{(page - 1) * ITEMS_PER_PAGE + i + 1}</td>
                    <td className="p-4 font-medium">{res.nomClient}</td>
                    <td className="p-4 text-cyan-400">{res.telephone}</td>
                    <td className="p-4">
                      <span className="flex items-center">
                        <span className="text-purple-400">{res.depart}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mx-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                        <span className="text-cyan-400">{res.arrivee}</span>
                      </span>
                    </td>
                    <td className="p-4">{format(new Date(res.date), 'dd/MM/yyyy')}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-700 text-gray-200">
                        {res.heure}
                      </span>
                    </td>
                    <td className="p-4">
                      {res.canal === 'guichet' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-900 text-yellow-200">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          Guichet
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-900 text-blue-200">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                          </svg>
                          En ligne
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-right font-mono text-green-400">{res.montant?.toLocaleString()} FCFA</td>
                    <td className="p-4 text-center">
                      <button 
                        onClick={() => setReservationAModifier(res)}
                        className="text-cyan-400 hover:text-cyan-300 transition-colors duration-200 flex items-center justify-center mx-auto"
                        title="Modifier"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Signature */}
        <div className="p-6 border-t border-gray-700 text-right text-sm italic text-gray-400">
          <div className="inline-block border-t-2 border-dashed border-cyan-400 w-32 mt-1"></div>
          <div className="mt-2">Signature et cachet de la compagnie</div>
        </div>
      </div>

      {/* Pagination futuriste */}
      {filteredReservations.length > ITEMS_PER_PAGE && (
        <div className="flex justify-center mt-6 space-x-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>
          
          {Array.from({ length: Math.ceil(filteredReservations.length / ITEMS_PER_PAGE) }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${page === i + 1 
                ? 'bg-gradient-to-r from-cyan-600 to-blue-700 text-white shadow-lg' 
                : 'bg-gray-800 hover:bg-gray-700 border border-gray-700'}`}
            >
              {i + 1}
            </button>
          ))}
          
          <button
            onClick={() => setPage(p => Math.min(Math.ceil(filteredReservations.length / ITEMS_PER_PAGE), p + 1))}
            disabled={page === Math.ceil(filteredReservations.length / ITEMS_PER_PAGE)}
            className="px-4 py-2 rounded-lg border border-gray-700 hover:bg-gray-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Modal de modification holographique */}
      {reservationAModifier && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-gray-800 rounded-xl border border-cyan-400 border-opacity-30 max-w-2xl w-full max-h-[90vh] overflow-y-auto relative sci-fi-modal">
            <div className="absolute inset-0 holo-modal-effect"></div>
            <div className="relative z-10 p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 neon-text">
                  Modifier Réservation
                </h3>
                <button 
                  onClick={() => setReservationAModifier(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <ModifierReservationForm
                reservation={reservationAModifier}
                onClose={() => setReservationAModifier(null)}
                onUpdated={() => {
                  setReservationAModifier(null);
                  setTimeout(() => {
                    const reload = async () => {
                      const q = query(
                        collection(db, 'reservations'),
                        where('agencyId', '==', user?.agencyId),
                        where('statut', '==', 'payé')
                      );
                      const snap = await getDocs(q);
                      const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Reservation[];
                      setReservations(data);
                    };
                    reload();
                  }, 500);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Styles CSS-in-JS */}
      <style>{`
        .grid-lines {
          background-image: 
            linear-gradient(rgba(0, 150, 255, 0.05) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 150, 255, 0.05) 1px, transparent 1px);
          background-size: 50px 50px;
          z-index: 0;
        }

        .holo-grid-effect {
          background: linear-gradient(135deg, rgba(0, 200, 255, 0.03) 0%, transparent 50%, rgba(0, 200, 255, 0.03) 100%);
        }

        .holo-header-effect {
          background: linear-gradient(90deg, transparent, rgba(0, 200, 255, 0.1), transparent);
        }

        .holo-modal-effect {
          background: radial-gradient(circle at center, rgba(0, 200, 255, 0.05) 0%, transparent 70%);
        }

        .neon-text {
          text-shadow: 0 0 8px rgba(0, 200, 255, 0.7);
        }

        .sci-fi-input-container {
          position: relative;
        }

        .sci-fi-input-icon {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: rgba(0, 200, 255, 0.7);
        }

        .sci-fi-select {
          background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
          background-position: right 0.5rem center;
          background-repeat: no-repeat;
          background-size: 1.5em 1.5em;
          padding-right: 2.5rem;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }

        .sci-fi-table-container {
          box-shadow: 0 0 30px rgba(0, 200, 255, 0.1);
        }

        .sci-fi-modal {
          box-shadow: 0 0 40px rgba(0, 200, 255, 0.2);
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default AgenceReservationsPage;