import type { Timestamp } from 'firebase/firestore';

// ✅ Statuts possibles pour les réservations
export type ReservationStatus = 'en_attente' | 'payé' | 'preuve_recue' | 'refusé' | 'annulé';

// ✅ Canaux possibles
export type Channel = 'en ligne' | 'agence' | 'téléphone';

// ✅ Reservation complète pour le hook
export interface Reservation {
  preuveUrl: any;
  preuveMessage: any;
  agencyTelephone: string;
  agencyNom: string;
  id: string;
  trajetId?: string; // optionnel si pas toujours utilisé
  canal: Channel; // 🔥 Type précis au lieu de string
  montant: number;
  createdAt: Timestamp | Date;
  agenceId?: string;
  clientNom?: string;
  nomClient?: string; // pour compatibilité
  telephone?: string; // recommandé
  email?: string;
  statut: ReservationStatus; // 🔥 Type précis au lieu de string
  date?: string;
  heure?: string;
  depart?: string;
  arrivee?: string;
  referenceCode?: string;
  seatsGo?: number;
  seatsReturn?: number;
  compagnieId?: string;
  companySlug?: string;
  agenceNom?: string;
  agenceTelephone?: string;
  latitude?: number;
  longitude?: number;
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
