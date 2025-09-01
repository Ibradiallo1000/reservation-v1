// =============================================
// src/pages/MediaPage.tsx
// =============================================
import React, { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { usePageHeader } from '@/contexts/PageHeaderContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import UploadImageCloudinary from './UploadImageCloudinary';

type ImageKind = 'logo' | 'banniere' | 'favicon' | 'slider' | 'autre';

interface ImageItem {
  id?: string;
  url: string;
  type: ImageKind;
  nom: string;
  createdAt?: Date | null;
}

const MediaPage: React.FC = () => {
  const { company } = useAuth();
  const theme = useCompanyTheme(company);
  const { setHeader, resetHeader } = usePageHeader();

  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------- Header : titre tout de suite ---------- */
  useEffect(() => {
    setHeader({
      title: 'Bibliothèque d’images',
      subtitle: 'Médias de la plateforme',
      bg: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      fg: '#fff',
    });
    return () => resetHeader();
    // on dépend seulement des couleurs (changent rarement)
  }, [theme.colors.primary, theme.colors.secondary, resetHeader, setHeader]);

  /* ---------- Met à jour le sous-titre quand le nombre change ---------- */
  // ---------- Met à jour le sous-titre quand le nombre change ----------
useEffect(() => {
  setHeader({
    title: 'Bibliothèque d’images',
    subtitle: images.length
      ? `${images.length} image${images.length > 1 ? 's' : ''}`
      : 'Aucune image',
    bg: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
    fg: '#fff',
  });
  // pas de reset ici : on ne veut pas effacer le header à chaque update
}, [images.length, theme.colors.primary, theme.colors.secondary, setHeader]);

  /* ---------- Charger les images ---------- */
  const fetchImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const snap = await getDocs(collection(db, 'mediaPlatform'));
      const data: ImageItem[] = snap.docs.map((d) => {
        const raw = d.data() as any;
        return {
          id: d.id,
          url: String(raw.url ?? ''),
          type: (raw.type as ImageKind) ?? 'autre',
          nom: String(raw.nom ?? 'Image'),
          createdAt: raw.createdAt?.toDate?.() ?? null,
        };
      });
      data.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      setImages(data);
    } catch (err) {
      console.error('Erreur chargement médias:', err);
      setError('Erreur lors du chargement des images');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  /* ---------- Suppression ---------- */
  const supprimerImage = async (img: ImageItem) => {
    if (!img.id) return;
    if (!window.confirm(`Supprimer l'image « ${img.nom} » ?`)) return;
    try {
      await deleteDoc(doc(db, 'mediaPlatform', img.id));
      fetchImages();
    } catch (err) {
      console.error('Erreur de suppression:', err);
      alert('Erreur lors de la suppression');
    }
  };

  /* ---------- Ajout après upload ---------- */
  const handleUpload = async (url: string, type: ImageKind = 'autre', nom = 'Nouvelle image') => {
    try {
      await addDoc(collection(db, 'mediaPlatform'), {
        url,
        type,
        nom,
        createdAt: Timestamp.now(),
      });
      fetchImages();
    } catch (err) {
      console.error('Erreur ajout média:', err);
      alert("Erreur lors de l'ajout du média");
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Uploader */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <UploadImageCloudinary
          label="Ajouter une image"
          dossier="platform"
          collectionName="mediaPlatform"
          onUpload={(url: string) => handleUpload(url, 'autre', 'Nouvelle image')}
          className="w-full"
        />
      </div>

      {/* Erreur */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4">
          {error}
        </div>
      )}

      {/* Contenu */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div
            className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2"
            style={{ borderColor: theme.colors.primary }}
          />
        </div>
      ) : images.length === 0 ? (
        <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded-lg p-6">
          Aucune image enregistrée pour la plateforme.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
            >
              <div className="relative h-40">
                <img
                  src={img.url}
                  alt={img.nom}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>

              <div className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{img.nom}</p>
                  <span
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${theme.colors.secondary}22`,
                      color: theme.colors.secondary,
                    }}
                  >
                    {img.type}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{img.createdAt ? img.createdAt.toLocaleDateString('fr-FR') : '—'}</span>
                  <button
                    onClick={() => supprimerImage(img)}
                    className="font-medium hover:underline"
                    style={{ color: theme.colors.primary }}
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MediaPage;
