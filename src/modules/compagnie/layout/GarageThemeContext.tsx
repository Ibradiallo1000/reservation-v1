// Phase 1G — Contexte thème Garage (primary/secondary) pour pages Garage.
import React, { createContext, useContext } from "react";

export interface GarageTheme {
  primary: string;
  secondary: string;
  primaryDark?: string;
  primaryLight?: string;
  /** Couleur de texte lisible sur primary/secondary */
  buttonText?: string;
}

const defaultTheme: GarageTheme = {
  primary: "#3B82F6",
  secondary: "#6366F1",
};

const GarageThemeContext = createContext<GarageTheme>(defaultTheme);

export function useGarageTheme(): GarageTheme {
  return useContext(GarageThemeContext) ?? defaultTheme;
}

export const GarageThemeProvider = GarageThemeContext.Provider;
