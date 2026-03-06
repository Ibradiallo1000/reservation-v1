/**
 * Product presentation modules for TELIYA marketing homepage.
 * Single visual structure: Direction, Agences, Guichet, Réservation, Embarquement, Courrier, Flotte, Comptabilité.
 * Stored in platform/settings under productPresentation.
 */

export interface ProductPresentationModule {
  id: string;
  title: string;
  description: string;
  features: string[];
  imageId?: string;
  imageUrl?: string;
  displayOrder: number;
  enabled: boolean;
}

export const DEFAULT_PRODUCT_PRESENTATION: ProductPresentationModule[] = [
  {
    id: "direction",
    title: "Direction",
    description: "Pilotez toute votre compagnie depuis un seul tableau de bord.",
    features: [
      "Suivi des réservations",
      "Analyse des revenus",
      "Performance des agences",
      "Statistiques en temps réel",
    ],
    displayOrder: 1,
    enabled: true,
  },
  {
    id: "agences",
    title: "Agences",
    description: "Connectez toutes vos agences sur une seule plateforme.",
    features: [
      "Gestion multi-agences",
      "Synchronisation des données",
      "Suivi des performances par agence",
    ],
    displayOrder: 2,
    enabled: true,
  },
  {
    id: "guichet",
    title: "Guichet",
    description: "Vendez les billets directement en agence.",
    features: [
      "Vente rapide de billets",
      "Gestion des encaissements",
      "Sessions de caisse",
    ],
    displayOrder: 3,
    enabled: true,
  },
  {
    id: "reservation-en-ligne",
    title: "Réservation en ligne",
    description: "Vos clients réservent directement depuis votre site.",
    features: [
      "Réservation simple",
      "Paiements locaux",
      "Billets numériques",
    ],
    displayOrder: 4,
    enabled: true,
  },
  {
    id: "embarquement",
    title: "Embarquement",
    description: "Contrôlez les passagers avant le départ.",
    features: [
      "Scan des billets",
      "Validation des passagers",
      "Suivi des départs",
    ],
    displayOrder: 5,
    enabled: true,
  },
  {
    id: "courrier",
    title: "Courrier",
    description: "Gérez les colis et les envois.",
    features: [
      "Enregistrement des colis",
      "Suivi des expéditions",
      "Gestion des livraisons",
    ],
    displayOrder: 6,
    enabled: true,
  },
  {
    id: "flotte",
    title: "Flotte",
    description: "Suivez vos véhicules et leur maintenance.",
    features: [
      "Gestion des bus",
      "Affectation aux trajets",
      "Suivi maintenance",
    ],
    displayOrder: 7,
    enabled: true,
  },
  {
    id: "comptabilite",
    title: "Comptabilité",
    description: "Suivez vos revenus et mouvements financiers.",
    features: [
      "Revenus par agence",
      "Historique des transactions",
      "Rapports financiers",
    ],
    displayOrder: 8,
    enabled: true,
  },
];
