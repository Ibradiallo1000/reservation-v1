// src/components/dashboardCompagnie/RevenueLineChart.tsx
import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

import './RevenueLineChart.css'; // 💥 Tes styles sci-fi

interface DailyRevenue {
  date: string; // format court : "01/06"
  revenue: number;
}

interface RevenueLineChartProps {
  data: DailyRevenue[];
}

const RevenueLineChart: React.FC<RevenueLineChartProps> = ({ data }) => {
  return (
    <div className="line-chart-container">
      <h3 className="chart-title">Évolution des revenus</h3>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,255,255,0.1)" />
          <XAxis dataKey="date" stroke="#00ffff" />
          <YAxis stroke="#00ffff" />
          <Tooltip
            formatter={(value: number) => `${value.toLocaleString()} FCFA`}
            labelFormatter={(label) => `Jour : ${label}`}
            contentStyle={{ background: '#0a0a2a', border: '1px solid #00ffff' }}
          />
          <Line
            type="monotone"
            dataKey="revenue"
            stroke="#00ffff"
            strokeWidth={2}
            dot={{ r: 4, stroke: '#00ffff', strokeWidth: 2, fill: '#0a0a2a' }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default RevenueLineChart;
