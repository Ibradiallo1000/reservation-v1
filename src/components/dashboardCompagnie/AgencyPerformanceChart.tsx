// ✅ src/components/dashboardCompagnie/AgencyPerformanceChart.tsx
import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface AgencyStats {
  id: string;
  nom: string;
  revenus: number;
}

interface Props {
  data: AgencyStats[];
}

const AgencyPerformanceChart: React.FC<Props> = ({ data }) => {
  return (
    <div className="bg-white rounded shadow p-4">
      <h3 className="font-semibold mb-2">Performance par agence</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="nom" />
          <YAxis />
          <Tooltip formatter={(value) => `${value.toLocaleString()} FCFA`} />
          <Bar dataKey="revenus" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AgencyPerformanceChart;
