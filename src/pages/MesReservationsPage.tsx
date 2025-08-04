import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { Loader, AlertCircle, FileText, Calendar, MapPin, Users, CreditCard, ChevronRight } from 'lucide-react';

interface Reservation {
  id: string;
  clientId: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  nombre_places: number;
  montant_total?: number;
  statut: 'payée' | 'confirmée' | 'en attente' | 'annulée';
  lieu_depart?: string;
  isUpcoming?: boolean;
  companyId: string;
  agencyId: string;
}

const MesReservationsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReservations = async () => {
      if (!user?.companyId || !user?.agencyId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const reservationsRef = collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'reservations');
        const reservationsQuery = query(reservationsRef, where('clientId', '==', user.uid));
        const reservationsSnapshot = await getDocs(reservationsQuery);
        const data = reservationsSnapshot.docs.map((doc) => ({ 
          id: doc.id, 
          ...doc.data(),
          isUpcoming: dayjs().isBefore(dayjs(`${doc.data().date}T${doc.data().heure}`))
        })) as Reservation[];

        // Tri par date (les plus récentes en premier)
        data.sort((a, b) => dayjs(`${b.date}T${b.heure}`).diff(dayjs(`${a.date}T${a.heure}`)));
        setReservations(data);
      } catch (err) {
        console.error("Erreur lors du chargement des réservations:", err);
        setError("Une erreur est survenue lors du chargement de vos réservations.");
      } finally {
        setLoading(false);
      }
    };

    fetchReservations();
  }, [user]);

  const StatusBadge = ({ status }: { status: string }) => {
    const statusConfig = {
      'payée': { color: 'bg-emerald-100 text-emerald-800', icon: '✓' },
      'confirmée': { color: 'bg-blue-100 text-blue-800', icon: '✓' },
      'en attente': { color: 'bg-amber-100 text-amber-800', icon: '⏱' },
      'annulée': { color: 'bg-red-100 text-red-800', icon: '✗' },
      default: { color: 'bg-gray-100 text-gray-800', icon: '?' }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.default;

    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <span className="mr-1">{config.icon}</span>
        {status}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <FileText className="mr-3 h-8 w-8 text-blue-600" />
          Mes Réservations
        </h1>
        <button 
          onClick={() => navigate('/nouvelle-reservation')}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Nouvelle réservation
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 rounded-lg flex items-start">
          <AlertCircle className="h-5 w-5 text-red-500 mr-3 mt-0.5" />
          <div>
            <h3 className="font-medium text-red-800">Erreur</h3>
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-20">
          <Loader className="h-8 w-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-gray-600">Chargement de vos réservations...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {reservations.length > 0 ? (
            <div className="bg-white shadow-sm rounded-xl overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-6">
                {reservations.map((reservation) => (
                  <div 
                    key={reservation.id}
                    className="border rounded-lg hover:shadow-md transition-shadow"
                  >
                    <div className="p-5">
                      <div className="flex justify-between items-start mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {reservation.depart} → {reservation.arrivee}
                        </h3>
                        <StatusBadge status={reservation.statut} />
                      </div>

                      <div className="space-y-3 text-sm text-gray-600">
                        <div className="flex items-center">
                          <Calendar className="h-4 w-4 text-gray-500 mr-2" />
                          <span>
                            {dayjs(reservation.date).format('dddd D MMMM YYYY')} à {reservation.heure}
                          </span>
                        </div>

                        <div className="flex items-center">
                          <MapPin className="h-4 w-4 text-gray-500 mr-2" />
                          <span>Départ: {reservation.lieu_depart}</span>
                        </div>

                        <div className="flex items-center">
                          <Users className="h-4 w-4 text-gray-500 mr-2" />
                          <span>{reservation.nombre_places} place(s)</span>
                        </div>

                        <div className="flex items-center">
                          <CreditCard className="h-4 w-4 text-gray-500 mr-2" />
                          <span className="font-medium">
                            {reservation.montant_total?.toLocaleString()} FCFA
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 pt-4 border-t flex justify-between items-center">
                        <button
                          onClick={() => navigate(`/reservation/${reservation.id}`)}
                          className="text-blue-600 hover:text-blue-800 font-medium text-sm flex items-center"
                        >
                          Détails <ChevronRight className="h-4 w-4 ml-1" />
                        </button>

                        {reservation.isUpcoming && (
                          <button
                            onClick={() => navigate(`/modifier-reservation/${reservation.id}`)}
                            className="text-amber-600 hover:text-amber-800 font-medium text-sm"
                          >
                            Modifier
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-xl shadow-sm">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">Aucune réservation</h3>
              <p className="mt-2 text-gray-500">
                Vous n'avez pas encore effectué de réservation.
              </p>
              <div className="mt-6">
                <button
                  onClick={() => navigate('/nouvelle-reservation')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Réserver maintenant
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MesReservationsPage;
