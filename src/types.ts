// ✅ src/types/index.ts

export interface CustomUser {
  uid: string;
  email: string;
  role: string;
  companyId: string;
  agencyId?: string;
  companyName?: string;
  nom?: string;
  ville?: string;
  displayName?: string;
  agencyName?: string; // ajouté pour éviter le bug de Dashboard
  lastLogin?: any;
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
  whatsaoo?: string;
  [key: string]: string | undefined;
}

export interface Company {
  accroche: string;
  id: string;
  nom: string;
  email: string;
  pays: string;
  telephone: string;
  responsable: string;
  plan: 'free' | 'premium';
  createdAt: any; // ou Timestamp stricte
  commission: number;
  logoUrl?: string;
  banniereUrl?: string;
  description?: string;
  slug: string;
  latitude?: number | null;
  longitude?: number | null;
  imagesSlider?: string[];
  footerConfig?: FooterConfig;
  socialMedia?: SocialMediaLinks;
  themeStyle?: string; // moderne | classique | sombre | ...
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  couleurAccent?: string;
  couleurTertiaire?: string;
  police?: string;
}

export interface ThemeConfig {
  colors: {
    primary: string;
    secondary: string;
    accent?: string; // ✅ Accent ajouté (facultatif)
    background: string;
    text: string;
  };
  typography: string;
  buttons: string;
  effects: string;
  borders: string;
  animations: string;
}

export type SocialPlatform =
  | 'facebook'
  | 'instagram'
  | 'whatsapp'
  | 'tiktok'
  | 'linkedin'
  | 'youtube';

  // src/types.ts
export {}

declare global {
  interface Window {
    __NETLIFY_FIX_APPLIED?: boolean;
  }
}
