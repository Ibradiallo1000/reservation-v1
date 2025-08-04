export interface WeeklyTrip {
  id: string;
  departure?: string;
  arrival?: string;
  depart?: string;
  arrivee?: string;
  horaires?: {
    [dayName: string]: string[];
  };
  price: number;
  places: number;
  [key: string]: any;
}
