import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

export type SendContactMessageData = {
  nom: string;
  email: string;
  message: string;
  companyId?: string;
};

/**
 * Writes a contact message to Firestore (collection "messages").
 * Sets createdAt: serverTimestamp() and lu: false.
 */
export async function sendContactMessage(
  data: SendContactMessageData
): Promise<void> {
  const messagesRef = collection(db, "messages");
  await addDoc(messagesRef, {
    nom: data.nom,
    email: data.email,
    message: data.message,
    ...(data.companyId != null && { companyId: data.companyId }),
    createdAt: serverTimestamp(),
    lu: false,
  });
}
