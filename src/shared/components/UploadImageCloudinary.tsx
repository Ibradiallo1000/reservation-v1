import React from "react";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyImageUpload } from "@/shared/hooks/useCompanyImageUpload";

export type UploadImageCloudinaryProps = {
  label: string;
  dossier: string;
  onUpload?: (imageUrl: string) => void | Promise<void>;
  className?: string;
  /** Sous-collection compagnie : priorité sur le `companyId` du profil (URL / tenant). */
  companyId?: string | null;
  /**
   * Si true (défaut), enregistre aussi dans `companies/{companyId}/imagesBibliotheque`.
   * Mettre false pour un flux « Cloudinary + onUpload » uniquement (ex. collection `medias` plateforme).
   */
  saveToCompanyLibrary?: boolean;
};

const UploadImageCloudinary = ({
  label,
  dossier,
  onUpload,
  className,
  companyId: companyIdProp,
  saveToCompanyLibrary = true,
}: UploadImageCloudinaryProps) => {
  const { user } = useAuth();
  const { uploadImage } = useCompanyImageUpload();

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const targetCompanyId =
      companyIdProp?.trim() || user?.companyId?.trim() || "";

    if (saveToCompanyLibrary) {
      if (!user) {
        alert("Vous devez être connecté pour ajouter une image.");
        return;
      }
      if (!targetCompanyId) {
        alert("Aucune compagnie cible : impossible d’enregistrer l’image.");
        return;
      }
    } else if (!user) {
      alert("Vous devez être connecté.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "ml_default");
    formData.append("public_id", `${dossier}/${uuidv4()}`);

    try {
      const response = await axios.post(
        "https://api.cloudinary.com/v1_1/dj697honl/image/upload",
        formData
      );

      const imageUrl = response.data.secure_url;
      const nom =
        window.prompt("Nom de l'image")?.trim() || "Image";

      if (saveToCompanyLibrary) {
        await uploadImage(targetCompanyId, {
          url: imageUrl,
          nom,
          type: "image",
          uploadedBy: user!.uid,
        });
      }

      if (onUpload) await onUpload(imageUrl);
      alert("✅ Image ajoutée avec succès");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        console.error("Upload Cloudinary (API):", err.response?.data ?? err.message);
      } else {
        console.error("Upload Cloudinary:", err);
      }
      alert("❌ Erreur lors de l’upload");
    } finally {
      if (input) input.value = "";
    }
  };

  return (
    <div className={`mb-4 ${className || ""}`}>
      <label className="font-semibold block mb-1">{label}</label>
      <input type="file" accept="image/*" onChange={handleFileChange} />
    </div>
  );
};

export default UploadImageCloudinary;
