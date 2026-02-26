import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

export type AddReviewData = {
  nom: string;
  note: number;
  commentaire: string;
};

/**
 * Adds a review for a company into Firestore (companies/{companyId}/avis).
 * Sets visible: false and createdAt: serverTimestamp().
 */
export async function addCompanyReview(
  companyId: string,
  data: AddReviewData
): Promise<void> {
  const avisRef = collection(db, "companies", companyId, "avis");
  await addDoc(avisRef, {
    nom: data.nom,
    note: data.note,
    commentaire: data.commentaire,
    visible: false,
    createdAt: serverTimestamp(),
  });
}
