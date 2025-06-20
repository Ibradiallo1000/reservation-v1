export interface Company {
  id: string;
  nom: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  banniereUrl?: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  couleurAccent?: string;         // ✅ Ajoute ça
  couleurTertiaire?: string;      // ✅ Et ça
  themeStyle?: string;            // ✅ Et ça
  email?: string;
  telephone?: string;
  adresse?: string;        // ✅ à ajouter
  horaires?: string;       // ✅ à ajouter
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
  };
  footerConfig?: FooterConfig; // ✅ assure-toi que c’est bien lié
  accroche?: string; // ✅ phrase marketing ou titre sur la bannière
  instructionRecherche?: string; // ✅ phrase courte sous le titre
}

export interface FooterConfig {
  showAbout?: boolean;
  showContact?: boolean;
  showSocial?: boolean;
  showTestimonials?: boolean;
  showLegalLinks?: boolean;
  customLinks?: { label: string; url: string; external?: boolean }[];
  testimonialButtonText?: string;
  aboutTitle?: string;
  contactTitle?: string;
  socialTitle?: string;
  testimonialsTitle?: string;
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
