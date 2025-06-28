// src/components/dashboardCompagnie/SalesChannelsBreakdown.tsx
import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import './SalesChannelsBreakdown.css'; // 💥 Ton style

interface ChannelData {
  name: string;
  value: number;
}

interface SalesChannelsBreakdownProps {
  channels: { [canal: string]: number };
}

const COLORS = ['#00ffff', '#ff00ff', '#00ff99', '#ffaa00'];

const SalesChannelsBreakdown: React.FC<SalesChannelsBreakdownProps> = ({ channels }) => {
  const data: ChannelData[] = Object.entries(channels).map(([name, value]) => ({
    name,
    value,
  }));
  const total = data.reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="channels-card">
      <h3 className="channels-title">Répartition des Canaux</h3>
      <div className="channels-content">
        <div className="channels-chart">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
              >
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value: number) => `${value} réservations`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="channels-list">
          {data.map((item, index) => (
            <li key={item.name} className="channels-item">
              <span className="channel-name">{item.name}</span>
              <span className="channel-value">{item.value}</span>
              <span className="channel-percent">
                {total ? `${Math.round((item.value / total) * 100)}%` : '0%'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default SalesChannelsBreakdown;
