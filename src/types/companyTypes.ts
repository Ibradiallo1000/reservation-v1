export interface Company {
  id: string;
  nom: string;
  slug: string;
  description: string;
  logoUrl: string;
  banniereUrl?: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  couleurAccent?: string;
  couleurTertiaire?: string;
  themeStyle?: string;
  accroche?: string;
  instructionRecherche?: string; // ✅ nouveau champ ajouté
  telephone?: string;
  email?: string;
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    tiktok?: string;
    linkedin?: string;
    youtube?: string;
  };
  footerConfig?: {
    showSocialMedia?: boolean;
    showTestimonials?: boolean;
    showContactForm?: boolean;
    showLegalLinks?: boolean;
  };
  imagesSlider?: string[];
}

export interface Agence {
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
  departure: string;
  arrival: string;
  price: number;
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
  suggestions: { departure: string[]; arrival: string[] };
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
