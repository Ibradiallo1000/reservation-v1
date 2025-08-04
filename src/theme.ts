// src/theme.ts

export const theme = {
  colors: {
    primary: "#2563EB",       // bleu (exemple) → à personnaliser
    primaryLight: "#3B82F6", 
    primaryDark: "#1E40AF",
    secondary: "#F97316",     // orange (exemple)
    secondaryLight: "#FB923C",
    secondaryDark: "#C2410C",
    background: "#F9FAFB",
    surface: "#FFFFFF",
    textPrimary: "#111827",
    textSecondary: "#6B7280",
    success: "#10B981",
    error: "#EF4444",
    warning: "#FACC15",
  },
  typography: {
    fontFamily: "'Inter', sans-serif",
    heading: "text-xl font-bold text-gray-900",
    subHeading: "text-sm text-gray-500",
    body: "text-base text-gray-700",
    small: "text-sm text-gray-500",
  },
  layout: {
    borderRadius: "1rem", // équivaut à rounded-2xl
    cardPadding: "1rem",  // p-4
    sectionGap: "1.5rem", // gap-6
    shadow: "0 2px 8px rgba(0,0,0,0.05)",
  },
};
