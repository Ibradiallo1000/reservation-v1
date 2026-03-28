export type ServerTransactionStatus = "success" | "conflict" | "rejected";

export type ServerTransactionResponse = {
  status: ServerTransactionStatus;
  reason: string;
  serverId?: string;
  serverTimestamp: number;
};
