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
export interface Trip {
  id: string;
  date: string;
  time: string;
  departure: string;
  arrival: string;
  price: number;
  agencyId: string;
  companyId: string;
  places: number;
  remainingSeats: number;
}
