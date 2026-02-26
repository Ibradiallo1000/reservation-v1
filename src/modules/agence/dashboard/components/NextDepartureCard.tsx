// ✅ src/components/dashboard/NextDepartureCard.tsx
import React, { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { TruckIcon } from "@heroicons/react/24/outline";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";

interface Departure {
  id: string;
  route: string;
  heure: string;
}

export const NextDepartureCard = ({ isLoading }: { isLoading: boolean }) => {
  const { user, company } = useAuth();
  const theme = useCompanyTheme(company);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(isLoading);

  // Charger et mettre à jour les départs
  useEffect(() => {
    if (!user?.companyId || !user?.agencyId) return;

    const loadDepartures = async () => {
      setLoading(true);
      const weeklyTripsRef = collection(
        db,
        `companies/${user.companyId}/agences/${user.agencyId}/weeklyTrips`
      );
      const snapshot = await getDocs(weeklyTripsRef);

      const today = new Date();
      const jourSemaine = today
        .toLocaleDateString("fr-FR", { weekday: "long" })
        .toLowerCase();

      let trips: Departure[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as any;
        if (data.active && data.horaires[jourSemaine]) {
          data.horaires[jourSemaine].forEach((heure: string) => {
            trips.push({
              id: `${doc.id}_${heure}`,
              route: `${data.departure} → ${data.arrival}`,
              heure,
            });
          });
        }
      });

      // Trier et garder max 3 départs à venir
      trips = trips
        .filter((d) => {
          const [h, m] = d.heure.split(":").map(Number);
          const depDate = new Date();
          depDate.setHours(h, m, 0, 0);
          return depDate >= new Date(); // uniquement futurs
        })
        .sort((a, b) => a.heure.localeCompare(b.heure))
        .slice(0, 3);

      setDepartures(trips);
      setLoading(false);
    };

    loadDepartures();

    // Mise à jour automatique chaque minute
    const interval = setInterval(loadDepartures, 60000);

    return () => clearInterval(interval);
  }, [user?.companyId, user?.agencyId]);

  return (
    <Card className="shadow-md border border-gray-200 bg-white">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle style={{ color: theme.colors.primary }}>
            Prochains départs
          </CardTitle>
          <TruckIcon className="h-5 w-5" style={{ color: theme.colors.secondary }} />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : departures.length === 0 ? (
          <p className="text-gray-500 text-center">Aucun départ à venir</p>
        ) : (
          <ul className="space-y-2">
            {departures.map((d, i) => (
              <li
                key={d.id}
                className={`flex justify-between items-center p-3 rounded-lg shadow-sm transition ${
                  i === 0
                    ? "bg-green-50 border border-green-200" // ✅ Highlight du prochain départ
                    : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <span
                  className="font-semibold"
                  style={{ color: theme.colors.primary }}
                >
                  {d.route}
                </span>
                <span
                  className="text-sm font-medium"
                  style={{ color: theme.colors.secondary }}
                >
                  {d.heure}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
