import React from "react";
import { StandardLayoutWrapper, EmptyState } from "@/ui";

interface AgencyPlaceholderPageProps {
  title: string;
  message?: string;
}

/** Page placeholder pour les entrées de menu en construction (ex. Clients, Maintenance). */
export default function AgencyPlaceholderPage({ title, message }: AgencyPlaceholderPageProps) {
  const text = message ?? "Cette page est en cours de préparation.";
  return (
    <StandardLayoutWrapper>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{title}</h1>
        <EmptyState message={text} />
      </div>
    </StandardLayoutWrapper>
  );
}
