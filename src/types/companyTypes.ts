// ✅ src/types/companyTypes.ts

import { Timestamp } from 'firebase/firestore';

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
    label: string; // ✅ c'était "title", on met "label" partout
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
  duration?: string;
  departure: string;
  arrival: string;
  price?: number;
  frequency?: string; // ✅ Ajouté
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

// ✅ Le type principal corrigé avec tous les champs optionnels et cohérents
export interface Company {
  services?: string[]; // ✅ au lieu de never[]
  featuredTrips?: any[]; // ✅ au lieu de "any" seul
  id: string;
  nom: string;
  slug: string;
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
  plan?: 'free' | 'premium';
  createdAt?: Timestamp;
  commission?: number;
  
}

