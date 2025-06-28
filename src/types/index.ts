// ✅ src/types/index.ts

import type { Timestamp } from 'firebase/firestore';

export interface Reservation {
  trajetId: string;
  canal: string;
  id: string;
  montant: number;
  createdAt: Timestamp;
  agenceId?: string;
  clientNom?: string;
  statut?: string;
  date?: string; // 🔥 à ajouter
  heure?: string; // 🔥 à ajouter
  depart?: string; // 🔥 à ajouter
  arrivee?: string; // 🔥 à ajouter
  // 🔁 Ajoute ici d'autres champs si ton Firestore contient plus d'infos (ex: tripId, telephone, etc.)
}

export interface ThemeConfig {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    text: string;
  };
  typography: string;
  buttons: string;
  effects: string;
  borders: string;
  animations: string;
}

export interface FooterConfig {
  showSocialMedia: boolean;
  showTestimonials: boolean;
  showLegalLinks: boolean;
  showContactForm: boolean;
  customLinks: {
    title: string;
    url: string;
  }[];
}

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

export interface Company {
  id: string;
  nom: string;
  email: string;
  pays: string;
  telephone: string;
  responsable: string;
  plan: 'free' | 'premium';
  createdAt: any;
  commission: number;
  slug: string;
  logoUrl?: string;
  banniereUrl?: string;
  description?: string;
  latitude?: number | null;
  longitude?: number | null;
  imagesSlider?: string[];
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  couleurAccent?: string;
  couleurTertiaire?: string;
  themeStyle?: string;
  police?: string;
  footerConfig?: FooterConfig;
  socialMedia?: SocialMediaLinks;
  accroche?: string;
}

export interface AvisClient {
  nom: string;
  note: number;
  commentaire: string;
  visible: boolean;
  companyId: string;
  createdAt: any;
}

export interface MessageClient {
  nom: string;
  email: string;
  message: string;
  companyId: string;
  createdAt: any;
}

// ✅ Ajout des types pour le dashboard compagnie

export interface Agency {
  id: string;
  nom: string;
  ville: string;
  companyId: string;
  statut?: 'active' | 'inactive';
}

export interface AgencyStats extends Agency {
  reservations: number;
  revenus: number;
  courriers: number;
  canaux: { [canal: string]: number };
}

export interface GlobalStats {
  totalAgencies: number;
  totalReservations: number;
  totalRevenue: number;
  totalCouriers: number;
  growthRate: number;
  totalChannels: { [canal: string]: number };
}
