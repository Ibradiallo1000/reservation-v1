// src/pages/UploadImageCloudinary.tsx
import React from "react";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";

interface UploadImageCloudinaryProps {
  label: string;
  /** Dossier/chemin pour le public_id Cloudinary (ex: 'logos', 'bannieres/accueil') */
  dossier: string;
  /** (Optionnel) Collection Firestore cible. 
   *  - Omettre pour écrire dans `companies/{companyId}/imagesBibliotheque`
   *  - Mettre "mediaPlatform" (ou tout chemin Firestore) pour écrire ailleurs.
   */
  collectionName?: string;
  /** Callback avec l’URL Cloudinary une fois l’upload terminé */
  onUpload?: (url: string) => void | Promise<void>;
  className?: string;
}

const UploadImageCloudinary: React.FC<UploadImageCloudinaryProps> = ({
  label,
  dossier,
  collectionName,
  onUpload,
  className,
}) => {
  const { user } = useAuth();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!collectionName && !user?.companyId) {
      alert("❌ Impossible d’identifier la compagnie. Veuillez vous reconnecter.");
      event.currentTarget.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    // ⚠️ adapte 'ml_default' à ton upload_preset Cloudinary si besoin
    formData.append("upload_preset", "ml_default");
    formData.append("public_id", `${dossier}/${uuidv4()}`);

    try {
      // 1) Upload sur Cloudinary
      const response = await axios.post(
        "https://api.cloudinary.com/v1_1/dj697honl/image/upload",
        formData
      );

      const imageUrl: string = response.data.secure_url;
      const nom =
        window.prompt("Nom de l'image (ex: logo, bannière, slider #1)") || "image";

      // 2) Écriture Firestore
      //    - si collectionName fourni, on écrit dans cette collection (chemin simple ou avec sous-collections)
      //    - sinon, on écrit dans la sous-collection de la compagnie
      const path = collectionName
        ? collectionName
        : `companies/${user!.companyId}/imagesBibliotheque`;

      await addDoc(collection(db, path), {
        url: imageUrl,
        nom,
        type: "autre",
        createdAt: serverTimestamp(),
      });

      if (onUpload) await onUpload(imageUrl);
      alert("✅ Image ajoutée avec succès !");
    } catch (error) {
      console.error("Erreur Cloudinary:", error);
      alert("❌ Upload échoué.");
    } finally {
      // reset input pour pouvoir réuploader la même image si besoin
      event.currentTarget.value = "";
    }
  };

  return (
    <div className={`mb-4 ${className || ""}`}>
      <label className="font-semibold block mb-1">{label}</label>
      <input type="file" accept="image/*" onChange={handleFileChange} />
      <p className="text-xs text-gray-500 mt-1">
        Formats acceptés : JPG, PNG, WEBP, SVG
      </p>
    </div>
  );
};

export default UploadImageCloudinary;
