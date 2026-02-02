import React from "react";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";

const UploadImageCloudinary = ({
  label,
  dossier,
  onUpload,
  className,
}: any) => {
  const { user } = useAuth();

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    // 🔒 Sécurité : uniquement admin compagnie
    if (!user?.companyId) {
      alert("Accès refusé");
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

      // ✅ ÉCRITURE DANS LA COMPAGNIE (ET PAS PLATEFORME)
      await addDoc(
        collection(
          db,
          "companies",
          user.companyId,
          "imagesBibliotheque"
        ),
        {
          url: imageUrl,
          nom,
          type: "image",
          createdAt: serverTimestamp(),
          uploadedBy: user.uid,
        }
      );

      if (onUpload) await onUpload(imageUrl);
      alert("✅ Image ajoutée avec succès");
    } catch (err) {
      console.error("Upload Cloudinary:", err);
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
