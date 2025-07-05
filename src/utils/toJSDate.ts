// ✅ src/utils/toJSDate.ts
import type { Timestamp } from 'firebase/firestore';

export function toJSDate(input: Date | Timestamp): Date {
  if ((input as Timestamp).toDate) {
    return (input as Timestamp).toDate();
  }
  return input as Date;
}
