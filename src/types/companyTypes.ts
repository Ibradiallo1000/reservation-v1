// ✅ src/types/companyTypes.ts

import type React from "react";
import { Timestamp } from "firebase/firestore";

export interface SocialMediaLinks {
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  youtube?: string;
  tiktok?: string;
  whatsapp?: string;
  [key: string]: string | undefined;
}

export interface FooterConfig {
  showAbout?: boolean;
  showContact?: boolean;
  showSocial?: boolean;
  showTestimonials?: boolean;
  showLegalLinks?: boolean;
  customLinks?: {
    label: string;
    url: string;
    external?: boolean;
  }[];
  testimonialButtonText?: string;
  aboutTitle?: string;
  contactTitle?: string;
  socialTitle?: string;
  testimonialsTitle?: string;
}

export interface Agence {
  longitude: number;
  latitude: number;
  id: string;
  nomAgence: string;
  ville: string;
  pays: string;
  quartier?: string;
  adresse?: string;
  telephone?: string;
  companyId: string;
}

export interface TripSuggestion {
  imageUrl?: string; // ✅ optionnel
  duration?: string;
  departure: string;
  arrival: string;
  price?: number;
  frequency?: string;
}

export interface CityInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  onSelectSuggestion: (city: string) => void;
  icon: React.ReactNode;
  placeholder: string;
  classes: any;
}

export interface HeroSectionProps {
  company: Company;
  departure: string;
  arrival: string;
  suggestions: {
    departure: string[];
    arrival: string[];
  };
  setDeparture: (value: string) => void;
  setArrival: (value: string) => void;
  setSuggestions: (value: { departure: string[]; arrival: string[] }) => void;
  handleSubmit: (e: React.FormEvent) => void;
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    tertiary: string;
    text: string;
    background: string;
  };
  classes: any;
  t: (key: string) => string;
}

export type PaymentMethod =
  | "espèces"
  | "mobile_money"
  | "carte"
  | "orange_money"
  | "mtn_money";

export interface PaymentConfig {
  methods: PaymentMethod[];
  defaultMethod?: PaymentMethod;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  price?: number;
  icon?: string;
}

export type PlanType = "free" | "premium" | "pro" | "enterprise";

export interface Company {
  id: string;
  nom: string;
  slug: string;

  // ✅ Flags liés au plan (optionnels pour compatibilité avec les anciens docs)
  publicPageEnabled?: boolean;       // vitrine active
  onlineBookingEnabled?: boolean;    // réservation en ligne active
  guichetEnabled?: boolean;          // guichet actif

  sousTitre?: string;
  description?: string;
  logoUrl?: string;
  banniereUrl?: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  couleurAccent?: string;
  couleurTertiaire?: string;
  themeStyle?: string;
  email?: string;
  pays?: string;
  telephone?: string;
  adresse?: string;
  horaires?: string;
  accroche?: string;
  instructionRecherche?: string;
  socialMedia?: SocialMediaLinks;
  footerConfig?: FooterConfig;
  responsable?: string;
  plan?: PlanType;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  commission?: number;
  imagesSlider?: string[];
  sliderImages?: string[];
  suggestions?: string[];
  villesDisponibles?: string[];
  services?: Service[];
  featuredTrips?: any[];
  paymentConfig?: PaymentConfig;
}
