/**
 * Document racine publicShipmentTrack/{trackingPublicId} — lecture publique.
 * Sécurité « soft » : les données sont lisibles via l’API Firestore ; l’app n’affiche les détails
 * qu’après vérification du hash du code ticket ou des 4 derniers chiffres du tél. destinataire.
 */

export type PublicShipmentTimelineEntry = {
  eventType: string;
  eventLabel: string;
  atLabel: string;
  agencyLabel: string;
};

export type ClientTrackTimelineLine = { text: string; sub?: string; done: boolean };

/** Affichage suivi client (après déverrouillage). */
export type ClientTrackPayload = {
  v: 1;
  shipmentNumber: string;
  receiverName: string;
  clientStatusLabel: string;
  currentAgencyName: string;
  destinationAgencyName: string;
  timelineLines: ClientTrackTimelineLine[];
};

export interface PublicShipmentTrackDoc {
  companyId: string;
  shipmentId?: string;
  /** SHA-256 hex du trackingToken (envoi privé). */
  trackingTokenHash: string;

  /** Modèle actuel : champs utiles en clair + gate côté UI. */
  trackPayloadMode?: "plain";
  /** SHA-256 hex de `${trackingPublicId}:${last4digits}` si téléphone assez long. */
  phoneGateHash?: string;
  /** Indique si le déverrouillage par 4 chiffres est possible. */
  phoneUnlockAvailable?: boolean;
  /** 2 derniers chiffres du tél. destinataire (aide terrain, non bloquant). */
  phoneHintLast2?: string;

  clientStatusLabel?: string;
  shipmentNumber?: string;
  destinationAgencyName?: string;
  currentAgencyName?: string;
  receiverName?: string;
  timelineLines?: ClientTrackTimelineLine[];

  /** Ancien format (avant timelineLines). */
  currentStatus?: string;
  timeline?: PublicShipmentTimelineEntry[];

  /** Ancien format chiffré — sera remplacé au prochain sync. */
  trackSchemaVersion?: number;
  encTokenIv?: string;
  encTokenData?: string;
  encPhoneIv?: string;
  encPhoneData?: string;

  updatedAt: unknown;
}
