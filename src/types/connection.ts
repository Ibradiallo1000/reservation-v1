/**
 * Correspondances : trajet multi-segments avec changement de bus.
 * Ex. Abidjan → Bamako, puis Bamako → Dakar.
 */

export type ConnectionSegment = {
  tripInstanceId: string;
  originStopOrder: number;
  destinationStopOrder: number;
};

export type ConnectionStatus = "active" | "completed" | "cancelled" | "missed";

export interface Connection {
  id?: string;
  companyId: string;
  /** Segments du trajet (chaque segment = un bus). */
  segments: ConnectionSegment[];
  status: ConnectionStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ConnectionDocWithId extends Connection {
  id: string;
}
