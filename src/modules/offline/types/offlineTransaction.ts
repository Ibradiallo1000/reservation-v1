import type { CreateGuichetReservationParams } from "@/modules/agence/services/guichetReservationService";
import type { CreateShipmentParams } from "@/modules/logistics/services/createShipment";

export type OfflineTransactionType = "guichet_sale" | "courier_shipment";
export type OfflineTransactionStatus = "pending" | "synced" | "failed" | "conflict";

export type OfflineTransactionPayloadMap = {
  guichet_sale: {
    params: CreateGuichetReservationParams;
    deviceFingerprint?: string | null;
  };
  courier_shipment: {
    params: CreateShipmentParams;
  };
};

export type OfflineTransactionPayload<T extends OfflineTransactionType> =
  OfflineTransactionPayloadMap[T];

export type OfflineTransaction<T extends OfflineTransactionType = OfflineTransactionType> = {
  transactionId: string;
  type: T;
  status: OfflineTransactionStatus;
  createdAt: number;
  updatedAt: number;
  deviceId: string;
  userId: string;
  payload: OfflineTransactionPayload<T>;
  checksum: string;
  attempts: number;
  nextRetryAt: number;
  lastError?: string;
  serverId?: string;
  syncMeta?: {
    syncedAt?: number;
    message?: string;
  };
};

export type SaveOfflineTransactionInput<T extends OfflineTransactionType = OfflineTransactionType> = {
  transactionId?: string;
  createdAt?: number;
  type: T;
  userId: string;
  deviceId: string;
  payload: OfflineTransactionPayload<T>;
};

export type OfflineSyncServerResult = {
  status: "success" | "conflict" | "rejected";
  serverId?: string;
  message?: string;
};
