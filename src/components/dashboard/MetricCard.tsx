// ✅ src/components/dashboard/MetricCard.tsx
import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/hooks/useCompanyTheme";

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color?: "primary" | "secondary" | "success" | "warning" | "info";
  isCurrency?: boolean;
  unit?: string;
  link?: string;
  isLoading?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  icon,
  color = "primary",
  isCurrency = false,
  unit = "",
  link,
  isLoading = false,
}) => {
  const { company } = useAuth();
  const theme = useCompanyTheme(company);

  const colorMap: Record<string, string> = {
    primary: theme.colors.primary,
    secondary: theme.colors.secondary,
    success: "#10B981", 
    warning: "#F59E0B",
    info: "#3B82F6",
  };

  const selectedColor = colorMap[color] || theme.colors.primary;
  const textColor = "#1e293b"; // ✅ forcer un gris foncé lisible

  const formattedValue = isCurrency
    ? `${Number(value).toLocaleString()} FCFA`
    : typeof value === "number"
    ? `${value.toLocaleString()}${unit}`
    : value;

  const content = (
    <Card className="h-full transition-all hover:shadow-xl border border-gray-300 bg-white rounded-xl shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle
          className="text-base font-semibold tracking-wide"
          style={{ color: textColor }}
        >
          {title}
        </CardTitle>
        <div
          className="p-2 rounded-lg shadow-md"
          style={{
            backgroundColor: `${selectedColor}20`,
            color: selectedColor,
          }}
        >
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-3/4 rounded-md" />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-3xl font-bold"
            style={{ color: selectedColor }}
          >
            {formattedValue}
          </motion.div>
        )}
        <p className="text-xs text-gray-500 mt-1">Tableau de bord – Réservations</p>
      </CardContent>
    </Card>
  );

  return link ? (
    <a href={link} className="block h-full">
      {content}
    </a>
  ) : (
    content
  );
};
