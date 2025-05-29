var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
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
        const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
            const usersSnap = yield getDocs(collection(db, 'users'));
            const reservationsSnap = yield getDocs(collection(db, 'reservations'));
            const companiesSnap = yield getDocs(collection(db, 'compagnies'));
            const tripsSnap = yield getDocs(collection(db, 'trips'));
            const invoicesSnap = yield getDocs(collection(db, 'invoices'));
            const agentsSnap = yield getDocs(collection(db, 'agents'));
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
        });
        fetchData();
    }, []);
    return stats;
};
export default useAdminStats;
