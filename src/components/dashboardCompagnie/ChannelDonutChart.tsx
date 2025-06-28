// src/components/dashboardCompagnie/ChannelDonutChart.tsx

import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface ChannelDonutChartProps {
  data: { [canal: string]: number };
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

const ChannelDonutChart: React.FC<ChannelDonutChartProps> = ({ data }) => {
  const total = Object.values(data).reduce((sum, val) => sum + val, 0);
  const chartData = Object.entries(data).map(([key, value], index) => ({
    name: key,
    value,
    color: COLORS[index % COLORS.length],
  }));

  return (
    <div className="flex flex-col lg:flex-row bg-white rounded-lg shadow p-6 relative">
      <div className="w-full lg:w-1/2 h-64">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center">
          <p className="text-xl font-bold text-gray-800">{total}</p>
          <p className="text-sm text-gray-500">Réservations</p>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col justify-center mt-6 lg:mt-0 lg:pl-8">
        {chartData.map((entry) => {
          const percent = ((entry.value / total) * 100).toFixed(1);
          return (
            <div key={entry.name} className="mb-4">
              <div className="flex justify-between mb-1">
                <span className="text-sm font-medium text-gray-700">{entry.name}</span>
                <span className="text-sm font-medium text-gray-700">{percent}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 rounded-full"
                  style={{
                    width: `${percent}%`,
                    backgroundColor: entry.color,
                  }}
                ></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChannelDonutChart;
