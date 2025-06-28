import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import React from "react";

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  isCurrency?: boolean;
  unit?: string;
  link?: string;
  isLoading?: boolean;
}

const colorClasses = {
  primary: 'bg-indigo-100 text-indigo-600',
  success: 'bg-emerald-100 text-emerald-600',
  warning: 'bg-amber-100 text-amber-600',
  danger: 'bg-rose-100 text-rose-600',
  info: 'bg-blue-100 text-blue-600'
};

export const MetricCard = ({
  title,
  value,
  icon,
  color = 'primary',
  isCurrency = false,
  unit = '',
  link,
  isLoading = false
}: MetricCardProps) => {
  const formattedValue = isCurrency
    ? `${Number(value).toLocaleString()} FCFA`
    : typeof value === 'number'
      ? `${value.toLocaleString()}${unit}`
      : value;

  const content = (
    <Card className="h-full transition-all hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-3/4" />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-2xl font-bold"
          >
            {formattedValue}
          </motion.div>
        )}
      </CardContent>
    </Card>
  );

  return link ? (
    <a href={link} className="block h-full">
      {content}
    </a>
  ) : content;
};
