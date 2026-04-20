export interface NormalizedReservation {
  reservation: {
    id?: string;
    status: string;
    channel: string;
    createdAt?: Date;
  };
  payment: {
    amount: number;
    status: string;
    method?: string;
  };
  trip: {
    departure?: string;
    arrival?: string;
    date?: string;
    time?: string;
  };
  customer: {
    name?: string;
    phone?: string;
  };
}
