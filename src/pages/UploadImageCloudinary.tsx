// ✅ src/pages/UploadImageCloudinary.tsx

import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface UploadImageCloudinaryProps {
  label: string;
  onUpload?: (url: string) => void; // Optionnel si utilisé seul
  dossier: string; // exemple : compagnies/companyId
}

const UploadImageCloudinary: React.FC<UploadImageCloudinaryProps> = ({ label, onUpload, dossier }) => {
  const { user } = useAuth();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.companyId) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'ml_default');
    formData.append('public_id', `${dossier}/${uuidv4()}`);

    try {
      const response = await axios.post(
        'https://api.cloudinary.com/v1_1/dj697honl/image/upload',
        formData
      );

      const imageUrl = response.data.secure_url;
      const nom = prompt("Nom de l'image (ex: logo, bannière, etc.)") || 'image';

      await addDoc(collection(db, 'imagesBibliotheque'), {
        companyId: user.companyId,
        url: imageUrl,
        type: 'libre', // toutes les images uploadées sont utilisables librement
        nom,
        createdAt: new Date()
      });

      if (onUpload) onUpload(imageUrl);
      alert('Image ajoutée avec succès.');

    } catch (error) {
      console.error('Erreur lors du téléversement sur Cloudinary :', error);
      alert("Échec de l'upload. Vérifie ta connexion et ton VPN.");
    }
  };

  return (
    <div className="mb-4">
      <label className="font-semibold block mb-1">{label}</label>
      <input type="file" accept="image/*" onChange={handleFileChange} />
    </div>
  );
};

export default UploadImageCloudinary;
