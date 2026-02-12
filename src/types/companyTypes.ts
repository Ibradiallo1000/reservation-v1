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

/* =========================
   WHY CHOOSE US (DYNAMIQUE)
========================= */
export interface WhyChooseItem {
  label: string;
  description?: string;
  icon?: "shield" | "clock" | "award" | "support" | "star" | "bus";
}

/* =========================
   FOOTER
========================= */
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
  departure: string;
  arrival: string;
  price?: number;
  days?: string[];
  imageUrl?: string;
  duration?: string;
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
   COMPANY (VERSION PROPRE)
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

  /* ⚠️ On supprime sliderImages si on enlève les sliders */
  imagesSlider?: string[];

  /* --- SERVICES À BORD --- */
  services?: string[];

  /* --- WHY CHOOSE (NOUVEAU) --- */
  whyChooseUs?: {
    items: WhyChooseItem[];
  };

  /* --- Autres --- */
  socialMedia?: SocialMediaLinks;
  footerConfig?: FooterConfig;
  responsable?: string;
  plan?: PlanType;
  commission?: number;
  preuveUrl?: string;

  villesDisponibles?: string[];
  suggestions?: string[];
  featuredTrips?: any[];

  paymentConfig?: PaymentConfig;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
