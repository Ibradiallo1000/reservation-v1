import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebaseConfig';

const useAdminStats = () => {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalReservations: 0,
    totalCompanies: 0,
    totalActiveTrips: 0,
    totalRevenue: 0,
    totalCommission: 0,
    totalInvoices: 0,
    totalAgents: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      const usersSnap = await getDocs(collection(db, 'users'));
      const reservationsSnap = await getDocs(collection(db, 'reservations'));
      const companiesSnap = await getDocs(collection(db, 'compagnies'));
      const tripsSnap = await getDocs(collection(db, 'trips'));
      const invoicesSnap = await getDocs(collection(db, 'invoices'));
      const agentsSnap = await getDocs(collection(db, 'agents'));

      const reservations = reservationsSnap.docs.map(doc => doc.data());
      const revenue = reservations.reduce((sum, r) => sum + (r.amount || 0), 0);
      const commission = revenue * 0.1;

      setStats({
        totalUsers: usersSnap.size,
        totalReservations: reservationsSnap.size,
        totalCompanies: companiesSnap.size,
        totalActiveTrips: tripsSnap.size,
        totalRevenue: revenue,
        totalCommission: commission,
        totalInvoices: invoicesSnap.size,
        totalAgents: agentsSnap.size,
      });
    };

    fetchData();
  }, []);

  return stats;
};

export default useAdminStats;
