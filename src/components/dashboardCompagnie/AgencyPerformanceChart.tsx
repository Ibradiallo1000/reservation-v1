// src/components/dashboardCompagnie/AgencyPerformanceChart.tsx
import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList } from 'recharts';

interface AgencyStats {
  id: string;
  nom: string;
  revenus: number;
}

interface AgencyPerformanceChartProps {
  data: AgencyStats[];
}

const AgencyPerformanceChart: React.FC<AgencyPerformanceChartProps> = ({ data }) => {
  return (
    <div className="bg-white rounded-lg p-6 shadow">
      <h3 className="text-lg font-semibold mb-4 text-center text-purple-400 uppercase">
        Performance par agence
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <XAxis dataKey="nom" />
          <YAxis />
          <Tooltip formatter={(value) => [`${value.toLocaleString()} FCFA`, 'Revenus']} />
          <Bar dataKey="revenus" fill="#6366f1" radius={[4, 4, 0, 0]}>
            <LabelList dataKey="revenus" position="top" formatter={(value: { toLocaleString: () => any; }) => `${value.toLocaleString()} FCFA`} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default AgencyPerformanceChart;
