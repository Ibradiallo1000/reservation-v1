import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface UploadImageCloudinaryProps {
  label: string;
  onUpload?: (url: string) => void;
  dossier: string; 
  className?: string;
  collectionName?: string; // ✅ nouvelle prop
}

const UploadImageCloudinary: React.FC<UploadImageCloudinaryProps> = ({
  label,
  onUpload,
  dossier,
  className,
  collectionName = 'imagesBibliotheque', // par défaut : images compagnies
}) => {
  const { user } = useAuth();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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

      await addDoc(collection(db, collectionName), {
        companyId: user?.companyId || null,
        url: imageUrl,
        type: 'autre',
        nom,
        createdAt: new Date(),
      });

      if (onUpload) onUpload(imageUrl);
      alert('✅ Image ajoutée avec succès !');
    } catch (error) {
      console.error('Erreur Cloudinary:', error);
      alert('❌ Upload échoué.');
    }
  };

  return (
    <div className={`mb-4 ${className || ''}`}>
      <label className="font-semibold block mb-1">{label}</label>
      <input type="file" accept="image/*" onChange={handleFileChange} />
    </div>
  );
};

export default UploadImageCloudinary;
