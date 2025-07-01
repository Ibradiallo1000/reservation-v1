// ✅ src/components/dashboardCompagnie/RevenueLineChart.tsx
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface DailyRevenue {
  date: string;
  revenue: number;
}

interface RevenueLineChartProps {
  data: DailyRevenue[];
}

const RevenueLineChart: React.FC<RevenueLineChartProps> = ({ data }) => {
  return (
    <div className="bg-white rounded shadow p-4">
      <h3 className="font-semibold mb-2">Évolution des revenus</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip formatter={(value) => `${value.toLocaleString()} FCFA`} />
          <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RevenueLineChart;
