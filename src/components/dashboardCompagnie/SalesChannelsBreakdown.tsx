import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface SalesChannelsBreakdownProps {
  channels: { [canal: string]: number };
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

const SalesChannelsBreakdown: React.FC<SalesChannelsBreakdownProps> = ({ channels }) => {
  const data = Object.entries(channels).map(([name, value]) => ({ name, value }));
  const total = data.reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="bg-white p-4 rounded shadow">
      <h3 className="font-bold mb-2">Répartition des canaux</h3>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-4">
        {data.map((item) => (
          <li key={item.name} className="flex justify-between">
            <span>{item.name}</span>
            <span>{Math.round((item.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SalesChannelsBreakdown;
