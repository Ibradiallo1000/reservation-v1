import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Company } from '@/types/companyTypes';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { buildValidTripsFromWeeklyTrips } from '@/modules/compagnie/tripInstances/publicValidTripsService';

interface Trip {
  id: string;
  departure: string;
  arrival: string;
  date: string;
  time: string;
  price: number;
  remainingSeats: number;
  agencyId: string;
}

interface Props {
  company: Company;
}

const ResultatsAgencePage: React.FC<Props> = ({ company }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const searchParams = new URLSearchParams(location.search);
  const departure = searchParams.get('departure') || '';
  const arrival = searchParams.get('arrival') || '';

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!company.id || !departure.trim() || !arrival.trim()) {
      setTrips([]);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const { validTrips } = await buildValidTripsFromWeeklyTrips({
        companyId: company.id,
        depNorm: departure.trim(),
        arrNorm: arrival.trim(),
        daysAhead: 14,
        limitCount: 50,
      });
      if (!cancelled) {
        setTrips(validTrips);
        setLoading(false);
      }
    };

    void load().catch(() => {
      if (!cancelled) {
        setTrips([]);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [company.id, departure, arrival]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-700">
        Chargement des trajets...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">
            {departure} → {arrival}
          </h1>
          <button
            type="button"
            onClick={() => navigate(`/${company.slug}`)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50"
          >
            Retour
          </button>
        </div>

        {trips.length === 0 ? (
          <div className="rounded-xl border border-gray-200 p-6 text-center text-gray-600">
            Aucun trajet disponible
          </div>
        ) : (
          <div className="space-y-3">
            {trips.map((trip) => (
              <div key={trip.id} className="rounded-xl border border-gray-200 p-4 bg-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-gray-500">{trip.date} - {trip.time}</div>
                    <div className="font-semibold text-gray-900">{trip.departure} → {trip.arrival}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Prix</div>
                    <div className="font-bold text-gray-900">{money(trip.price)}</div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Places restantes: <span className="font-semibold">{trip.remainingSeats}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      navigate(`/${company.slug}/booking`, {
                        state: {
                          tripData: {
                            ...trip,
                            companyId: company.id,
                            agenceId: trip.agencyId,
                            compagnieNom: company.nom,
                            logoUrl: company.logoUrl,
                          },
                          companyInfo: {
                            id: company.id,
                            slug: company.slug,
                            nom: company.nom,
                            logoUrl: company.logoUrl,
                          },
                        },
                      })
                    }
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                  >
                    Réserver
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResultatsAgencePage;