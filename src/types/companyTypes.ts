// ✅ src/types/companyTypes.ts

import type React from "react";
import { Timestamp } from "firebase/firestore";

/* =========================
   SOCIAL & FOOTER
========================= */
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

/* =========================
   AGENCE
========================= */
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

/* =========================
   TRIPS / SEARCH
========================= */
export interface TripSuggestion {
  imageUrl?: string;
  duration?: string;
  departure: string;
  arrival: string;
  price?: number;
  frequency?: string;
}

/* =========================
   HERO SECTION
========================= */
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

/* =========================
   PAYMENTS
========================= */
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

/* =========================
   PLAN
========================= */
export type PlanType = "free" | "premium" | "pro" | "enterprise";

/* =========================
   COMPANY (✅ VERSION FINALE)
========================= */
export interface Company {
  id: string;
  nom: string;
  slug: string;

  /* --- Flags plan --- */
  publicPageEnabled?: boolean;
  onlineBookingEnabled?: boolean;
  guichetEnabled?: boolean;

  /* --- Infos générales --- */
  sousTitre?: string;
  description?: string;
  logoUrl?: string;
  banniereUrl?: string;

  /* --- Thème --- */
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  couleurAccent?: string;
  couleurTertiaire?: string;
  themeStyle?: string;

  /* --- Contact --- */
  email?: string;
  pays?: string;
  telephone?: string;
  adresse?: string;
  horaires?: string;

  /* --- Vitrine --- */
  accroche?: string;
  instructionRecherche?: string;
  imagesSlider?: string[];
  sliderImages?: string[];

  /* ✅ SERVICES À BORD (clé Firestore → string[]) */
  services?: string[];

  /* --- Autres --- */
  socialMedia?: SocialMediaLinks;
  footerConfig?: FooterConfig;
  responsable?: string;
  plan?: PlanType;
  commission?: number;

  villesDisponibles?: string[];
  suggestions?: string[];
  featuredTrips?: any[];

  paymentConfig?: PaymentConfig;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
