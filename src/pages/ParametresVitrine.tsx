// ✅ VERSION COMPLÈTE ET STABLE DU FICHIER `ParametresVitrine.tsx`
// Ce fichier contient : logo, favicon, bannières, thème, couleur, police, réseaux sociaux, footer config

import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import ImageSelectorModal from '../components/ui/ImageSelectorModal';
import { HexColorPicker } from 'react-colorful';
import { SocialPlatform } from '@/types';
import {
  CheckCircle, AlertCircle, Save, Trash2, Upload,
  Image as ImageIcon, Palette, Moon, Sun, Type
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ThemeOption {
  name: string;
  value: 'moderne' | 'classique' | 'sombre' | 'contraste' | 'minimaliste' | 'glassmorphism';
  description: string;
  icon: JSX.Element;
}

const ParametresVitrine = () => {
  const { user } = useAuth();
  const [companyData, setCompanyData] = useState({
  nom: '',
  telephone: '',
  description: '',
  logoUrl: '',
  faviconUrl: '',
  banniereUrl: '',
  imagesSlider: [] as string[],
  couleurPrimaire: '#3B82F6',
  couleurSecondaire: '#10B981',
  themeStyle: 'moderne',
  police: 'sans-serif',
  socialMedia: {
    facebook: '', instagram: '', whatsapp: '', tiktok: '', linkedin: '', youtube: ''
  },
  footerConfig: {
    showSocialMedia: true,
    showTestimonials: true,
    showLegalLinks: true,
    showContactForm: true,
    customLinks: []
  }
});
  const [message, setMessage] = useState({ text: '', type: '' });
  const [modalType, setModalType] = useState<null | 'logo' | 'banniere' | 'favicon' | 'banniereStatique'>(null);
  const [showColorPicker, setShowColorPicker] = useState<'primary' | 'secondary' | null>(null);

  const themeOptions: ThemeOption[] = [
    { name: 'moderne', value: 'moderne', description: 'Style contemporain avec couleurs vives', icon: <Palette size={16} /> },
    { name: 'classique', value: 'classique', description: 'Style traditionnel épuré', icon: <Type size={16} /> },
    { name: 'sombre', value: 'sombre', description: 'Mode nuit élégant', icon: <Moon size={16} /> },
    { name: 'contraste', value: 'contraste', description: 'Fort impact visuel', icon: <Sun size={16} /> },
    { name: 'minimaliste', value: 'minimaliste', description: 'Design ultra épuré', icon: <Type size={16} /> },
    { name: 'glassmorphism', value: 'glassmorphism', description: 'Effets de transparence moderne', icon: <Palette size={16} /> },
  ];

  useEffect(() => {
    if (user?.companyId) {
      const fetchData = async () => {
        const docRef = doc(db, 'companies', user.companyId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setCompanyData(prev => ({
            ...prev,
            ...docSnap.data()
          }));
        }
      };
      fetchData();
    }
  }, [user]);

  const handleSave = async () => {
    if (!user?.companyId) return;
    setMessage({ text: 'Enregistrement en cours...', type: 'info' });
    try {
      const docRef = doc(db, 'companies', user.companyId);
      await updateDoc(docRef, companyData);
      setMessage({ text: 'Modifications enregistrées avec succès', type: 'success' });
    } catch (err) {
      console.error("Erreur d'enregistrement:", err);
      setMessage({ text: "Échec de l'enregistrement. Veuillez réessayer.", type: 'error' });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setCompanyData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageSelect = (url: string) => {
    if (!modalType) return;
    setCompanyData(prev => ({
      ...prev,
      ...(modalType === 'logo' && { logoUrl: url }),
      ...(modalType === 'favicon' && { faviconUrl: url }),
      ...(modalType === 'banniereStatique' && { banniereUrl: url }),
      ...(modalType === 'banniere' && { imagesSlider: [...prev.imagesSlider, url] })
    }));
    setModalType(null);
  };

  const handleImageRemove = (index: number) => {
    setCompanyData(prev => ({
      ...prev,
      imagesSlider: prev.imagesSlider.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="max-w-5xl mx-auto p-6 bg-white rounded-lg shadow-sm">
      <h2 className="text-2xl font-bold mb-4">Personnalisation de la vitrine</h2>
      
      <AnimatePresence>
  {message.text && (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`fixed top-4 right-4 p-4 rounded-md shadow-lg z-50 ${
        message.type === 'success'
          ? 'bg-green-100 text-green-800 border-l-4 border-green-500'
          : message.type === 'error'
          ? 'bg-red-100 text-red-800 border-l-4 border-red-500'
          : 'bg-blue-100 text-blue-800 border-l-4 border-blue-500'
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center">
          {message.type === 'success' ? (
            <CheckCircle className="h-6 w-6 mr-2" />
          ) : message.type === 'error' ? (
            <AlertCircle className="h-6 w-6 mr-2" />
          ) : (
            <div className="h-6 w-6 mr-2 animate-spin rounded-full border-t-2 border-b-2 border-blue-500" />
          )}
          <span>{message.text}</span>
        </div>

        {/* ✅ Bouton OK visible uniquement en cas de succès */}
        {message.type === 'success' && (
          <button
            onClick={() => setMessage({ text: '', type: '' })}
            className="text-sm underline text-green-800 hover:text-green-900"
            type="button"
          >
            OK
          </button>
        )}
      </div>
    </motion.div>
  )}
</AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Section Informations */}
        <div className="space-y-6">
          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Palette size={18} />
              Identité visuelle
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Couleur principale
                </label>
                <div className="flex items-center gap-3">
                  <div 
                    className="h-10 w-10 rounded-md cursor-pointer border"
                    style={{ backgroundColor: companyData.couleurPrimaire }}
                    onClick={() => setShowColorPicker('primary')}
                  />
                  {showColorPicker === 'primary' && (
                    <div className="absolute z-10 mt-2 bg-white p-2 rounded-md shadow-xl">
                      <HexColorPicker
                        color={companyData.couleurPrimaire}
                        onChange={(color) => setCompanyData({...companyData, couleurPrimaire: color})}
                      />
                      <div className="mt-2 flex justify-between items-center">
                        <input
                          type="text"
                          value={companyData.couleurPrimaire}
                          onChange={(e) => setCompanyData({...companyData, couleurPrimaire: e.target.value})}
                          className="text-sm border rounded px-2 py-1 w-24"
                        />
                        <button 
                          onClick={() => setShowColorPicker(null)}
                          className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded"
                        >
                          Valider
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Couleur secondaire
                </label>
                <div className="flex items-center gap-3">
                  <div 
                    className="h-10 w-10 rounded-md cursor-pointer border"
                    style={{ backgroundColor: companyData.couleurSecondaire }}
                    onClick={() => setShowColorPicker('secondary')}
                  />
                  {showColorPicker === 'secondary' && (
                    <div className="absolute z-10 mt-2 bg-white p-2 rounded-md shadow-xl">
                      <HexColorPicker
                        color={companyData.couleurSecondaire}
                        onChange={(color) => setCompanyData({...companyData, couleurSecondaire: color})}
                      />
                      <div className="mt-2 flex justify-between items-center">
                        <input
                          type="text"
                          value={companyData.couleurSecondaire}
                          onChange={(e) => setCompanyData({...companyData, couleurSecondaire: e.target.value})}
                          className="text-sm border rounded px-2 py-1 w-24"
                        />
                        <button 
                          onClick={() => setShowColorPicker(null)}
                          className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded"
                        >
                          Valider
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Police de caractères
                </label>
                <select
                  name="police"
                  value={companyData.police}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  <option value="sans-serif">Moderne (sans-serif)</option>
                  <option value="serif">Classique (serif)</option>
                  <option value="monospace">Technique (monospace)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ImageIcon size={18} />
              Images
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
                {companyData.logoUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={companyData.logoUrl} alt="Logo" className="h-16 w-16 object-contain" />
                    <button 
                      onClick={() => setModalType('logo')}
                      className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded"
                    >
                      Changer
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setModalType('logo')}
                    className="w-full py-4 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400"
                  >
                    <ImageIcon className="mb-1" />
                    <span>Ajouter un logo</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Favicon</label>
                {companyData.faviconUrl ? (
                  <div className="flex items-center gap-3">
                    <img src={companyData.faviconUrl} alt="Favicon" className="h-8 w-8 object-contain" />
                    <button 
                      onClick={() => setModalType('favicon')}
                      className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded"
                    >
                      Changer
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setModalType('favicon')}
                    className="w-full py-4 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400"
                  >
                    <ImageIcon className="mb-1" />
                    <span>Ajouter un favicon</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Section Thème et Bannière */}
        <div className="space-y-6">
          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Palette size={18} />
              Thème graphique
            </h3>
            
            <div className="grid grid-cols-2 gap-3">
              {themeOptions.map((theme) => (
                <div 
                  key={theme.value}
                  onClick={() => setCompanyData({...companyData, themeStyle: theme.value})}
                  className={`p-3 border rounded-lg cursor-pointer transition-all ${
                    companyData.themeStyle === theme.value 
                      ? 'ring-2 ring-yellow-500 border-transparent' 
                      : 'hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {theme.icon}
                    <span className="capitalize font-medium">{theme.name}</span>
                  </div>
                  <p className="text-xs text-gray-500">{theme.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="border-b pb-4">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ImageIcon size={18} />
              Bannière
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Image de couverture statique
                </label>
                {companyData.banniereUrl ? (
                  <div className="flex flex-col">
                    <img 
                      src={companyData.banniereUrl} 
                      alt="Bannière" 
                      className="h-32 w-full object-cover rounded mb-2"
                    />
                    <button 
                      onClick={() => setModalType('banniereStatique')}
                      className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded self-start"
                    >
                      Changer l'image
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setModalType('banniereStatique')}
                    className="w-full py-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400"
                  >
                    <ImageIcon className="mb-1" />
                    <span>Ajouter une bannière</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Images du slider ({companyData.imagesSlider.length})
                </label>
                {companyData.imagesSlider.length > 0 ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-2">
                      {companyData.imagesSlider.map((url, index) => (
                        <div key={index} className="relative group">
                          <img 
                            src={url} 
                            alt={`Slide ${index}`} 
                            className="h-20 w-full object-cover rounded" 
                          />
                          <button
                            onClick={() => handleImageRemove(index)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={() => setModalType('banniere')}
                      className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    >
                      <Upload size={14} /> Ajouter des images
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setModalType('banniere')}
                    className="w-full py-8 border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400"
                  >
                    <ImageIcon className="mb-1" />
                    <span>Ajouter des images au slider</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
  <button
    onClick={handleSave}
    className={`px-6 py-2 text-white font-medium rounded-md shadow-sm transition flex items-center justify-center ${
      message.type === 'success' 
        ? 'bg-green-500 hover:bg-green-600' 
        : message.type === 'error'
        ? 'bg-red-500 hover:bg-red-600'
        : 'bg-yellow-600 hover:bg-yellow-700'
    }`}
    style={{ backgroundColor: message.type ? undefined : companyData.couleurPrimaire }}
    disabled={false} // <-- NE PAS désactiver le bouton
  >
    {message.type === 'success' ? (
      <>
        <CheckCircle className="h-5 w-5 mr-2" />
<span>Enregistré !</span>
      </>
    ) : message.type === 'error' ? (
      <>
        <AlertCircle className="h-5 w-5 mr-2" />
        Réessayer
      </>
    ) : (
      <>
        <Save className="h-5 w-5 mr-2" />
        Enregistrer les modifications
      </>
    )}
  </button>
</div>

      {modalType && user?.companyId && (
        <ImageSelectorModal
          companyId={user.companyId}
          onSelect={handleImageSelect}
          onClose={() => setModalType(null)}
        />
      )}
    </div>
  );
};

export default ParametresVitrine;