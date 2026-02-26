import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

export type SaveCompanyImageData = {
  url: string;
  nom?: string;
  type?: string;
  uploadedBy?: string;
};

/**
 * Saves a company image to Firestore (companies/{companyId}/imagesBibliotheque).
 * Sets createdAt: serverTimestamp().
 */
export async function saveCompanyImage(
  companyId: string,
  data: SaveCompanyImageData
): Promise<void> {
  const ref = collection(db, "companies", companyId, "imagesBibliotheque");
  await addDoc(ref, {
    url: data.url,
    nom: data.nom,
    type: data.type ?? "image",
    ...(data.uploadedBy != null && { uploadedBy: data.uploadedBy }),
    createdAt: serverTimestamp(),
  });
}
