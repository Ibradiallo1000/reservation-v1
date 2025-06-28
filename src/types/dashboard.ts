import { Timestamp } from 'firebase/firestore';

export interface DailyStat {
  date: string;
  reservations: number;
  revenue: number;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  lastActive: string;
  avatar?: string;
}

export interface DestinationStat {
  name: string;
  value: number;
}

export interface FinancialStat {
  expenses: number;
  income: number;
  netProfit: number;
}

export interface DashboardStats {
  sales: number;
  totalRevenue: number;
  sentMail: number;
  receivedMail: number;
  pendingMail: number;
  delays: number;
  satisfaction: number;
  occupancyRate: number;
  agents: Agent[];
  topDestination: string;
  nextDeparture: string;
  dailyStats: DailyStat[];
  destinations: DestinationStat[];
  financials: FinancialStat;
}