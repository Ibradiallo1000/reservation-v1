import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import ImageSelectorModal from '../components/ui/ImageSelectorModal';
import { HexColorPicker } from 'react-colorful';
import { 
  CheckCircle, AlertCircle, Save, Trash2, Upload,
  Image as ImageIcon, Palette, Moon, Sun, Type,
  Settings, TextCursorInput, Heading1, Text
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
    accroche: '',
    instructionRecherche: '',
    nom: '',
    telephone: '',
    description: '',
    logoUrl: '',
    faviconUrl: '',
    banniereUrl: '',
    imagesSlider: [] as string[],
    couleurPrimaire: '#3B82F6',
    couleurSecondaire: '#10B981',
    couleurAccent: '#FBBF24',
    couleurTertiaire: '#F472B6',
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
  const [showColorPicker, setShowColorPicker] = useState<'primary' | 'secondary' | 'accent' | 'tertiary' | null>(null);

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
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-5xl mx-auto"
      >
        {/* Bannière de titre */}
        <div className="bg-white rounded-xl shadow-md p-6 mb-8 flex items-center gap-4 border-l-4" style={{ borderLeftColor: companyData.couleurPrimaire }}>
          <Settings className="h-8 w-8 text-gray-700" />
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Personnalisation de la vitrine</h1>
            <p className="text-gray-500">Configurez l'apparence de votre page publique</p>
          </div>
        </div>

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Section Informations */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-6"
          >
            {/* Section Texte */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-700">
                <TextCursorInput className="text-blue-500" />
                Textes personnalisés
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phrase d'accroche (titre principal)
                  </label>
                  <input
                    type="text"
                    name="accroche"
                    value={companyData.accroche}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: Réservez votre billet en un clic"
                  />
                  <p className="mt-1 text-xs text-gray-500">Sera affiché en grand sur votre bannière</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Instruction de recherche
                  </label>
                  <input
                    type="text"
                    name="instructionRecherche"
                    value={companyData.instructionRecherche}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: Remplissez les champs ci-dessous pour trouver votre trajet"
                  />
                  <p className="mt-1 text-xs text-gray-500">S'affiche au-dessus du formulaire de recherche</p>
                </div>
              </div>
            </div>

            {/* Section Couleurs */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-700">
                <Palette className="text-purple-500" />
                Couleurs
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: 'Primaire', key: 'couleurPrimaire', value: companyData.couleurPrimaire },
                  { name: 'Secondaire', key: 'couleurSecondaire', value: companyData.couleurSecondaire },
                  { name: 'Accent', key: 'couleurAccent', value: companyData.couleurAccent },
                  { name: 'Tertiaire', key: 'couleurTertiaire', value: companyData.couleurTertiaire },
                ].map((color) => (
                  <div key={color.key}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {color.name}
                    </label>
                    <div className="flex items-center gap-3">
                      <div 
                        className="h-10 w-10 rounded-lg cursor-pointer border-2 border-gray-200 shadow-sm"
                        style={{ backgroundColor: color.value }}
                        onClick={() => setShowColorPicker(color.key as any)}
                      />
                      <span className="text-sm font-mono">{color.value}</span>
                    </div>
                    {showColorPicker === color.key && (
                      <div className="absolute z-10 mt-2 bg-white p-3 rounded-xl shadow-xl border border-gray-200">
                        <HexColorPicker
                          color={color.value}
                          onChange={(newColor) => setCompanyData({ ...companyData, [color.key]: newColor })}
                        />
                        <div className="mt-3 flex justify-between items-center">
                          <input
                            type="text"
                            value={color.value}
                            onChange={(e) => setCompanyData({...companyData, [color.key]: e.target.value})}
                            className="text-sm border rounded-lg px-3 py-1.5 w-24"
                          />
                          <button 
                            onClick={() => setShowColorPicker(null)}
                            className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
                          >
                            Valider
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Section Images */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-700">
                <ImageIcon className="text-pink-500" />
                Images
              </h3>
              
              <div className="space-y-6">
                {/* Logo */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
                  {companyData.logoUrl ? (
                    <div className="flex items-center gap-4">
                      <div className="p-2 border border-gray-200 rounded-lg bg-gray-50">
                        <img src={companyData.logoUrl} alt="Logo" className="h-16 w-16 object-contain" />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setModalType('logo')}
                          className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
                        >
                          Changer
                        </button>
                        <button 
                          onClick={() => setCompanyData({...companyData, logoUrl: ''})}
                          className="text-sm bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setModalType('logo')}
                      className="w-full py-6 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 transition-all"
                    >
                      <ImageIcon className="mb-2 h-8 w-8" />
                      <span className="font-medium">Ajouter un logo</span>
                      <span className="text-xs mt-1">Recommandé : 300x300px</span>
                    </button>
                  )}
                </div>

                {/* Favicon */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Favicon</label>
                  {companyData.faviconUrl ? (
                    <div className="flex items-center gap-4">
                      <div className="p-2 border border-gray-200 rounded-lg bg-gray-50">
                        <img src={companyData.faviconUrl} alt="Favicon" className="h-8 w-8 object-contain" />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setModalType('favicon')}
                          className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
                        >
                          Changer
                        </button>
                        <button 
                          onClick={() => setCompanyData({...companyData, faviconUrl: ''})}
                          className="text-sm bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setModalType('favicon')}
                      className="w-full py-6 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 transition-all"
                    >
                      <ImageIcon className="mb-2 h-8 w-8" />
                      <span className="font-medium">Ajouter un favicon</span>
                      <span className="text-xs mt-1">Recommandé : 32x32px</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Section Thème et Bannière */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-6"
          >
            {/* Section Thème */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-700">
                <Moon className="text-indigo-500" />
                Thème graphique
              </h3>
              
              <div className="grid grid-cols-2 gap-3">
                {themeOptions.map((theme) => (
                  <motion.div 
                    key={theme.value}
                    whileHover={{ y: -2 }}
                    onClick={() => setCompanyData({...companyData, themeStyle: theme.value})}
                    className={`p-4 border rounded-xl cursor-pointer transition-all ${
                      companyData.themeStyle === theme.value 
                        ? 'ring-2 ring-blue-500 border-transparent bg-blue-50' 
                        : 'hover:shadow-md border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      {theme.icon}
                      <span className="capitalize font-medium text-gray-700">{theme.name}</span>
                    </div>
                    <p className="text-xs text-gray-500">{theme.description}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Section Bannière */}
            <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-700">
                <ImageIcon className="text-amber-500" />
                Bannière
              </h3>
              
              <div className="space-y-6">
                {/* Bannière statique */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Image de couverture statique
                  </label>
                  {companyData.banniereUrl ? (
                    <div className="flex flex-col gap-3">
                      <div className="relative rounded-lg overflow-hidden border border-gray-200">
                        <img 
                          src={companyData.banniereUrl} 
                          alt="Bannière" 
                          className="h-40 w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent flex items-end p-4">
                          <h3 className="text-white font-bold text-lg">{companyData.accroche || 'Votre phrase d\'accroche'}</h3>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setModalType('banniereStatique')}
                          className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg"
                        >
                          Changer l'image
                        </button>
                        <button 
                          onClick={() => setCompanyData({...companyData, banniereUrl: ''})}
                          className="text-sm bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setModalType('banniereStatique')}
                      className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 transition-all"
                    >
                      <ImageIcon className="mb-2 h-8 w-8" />
                      <span className="font-medium">Ajouter une bannière</span>
                      <span className="text-xs mt-1">Recommandé : 1200x400px</span>
                    </button>
                  )}
                </div>

                {/* Slider */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Images du slider ({companyData.imagesSlider.length})
                  </label>
                  {companyData.imagesSlider.length > 0 ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        {companyData.imagesSlider.map((url, index) => (
                          <motion.div 
                            key={index} 
                            className="relative group"
                            whileHover={{ scale: 1.02 }}
                          >
                            <img 
                              src={url} 
                              alt={`Slide ${index}`} 
                              className="h-24 w-full object-cover rounded-lg border border-gray-200" 
                            />
                            <button
                              onClick={() => handleImageRemove(index)}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow-md hover:bg-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </motion.div>
                        ))}
                      </div>
                      <button 
                        onClick={() => setModalType('banniere')}
                        className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1.5 mt-2"
                      >
                        <Upload size={14} /> Ajouter des images
                      </button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => setModalType('banniere')}
                      className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 hover:text-gray-600 hover:border-gray-400 bg-gray-50 hover:bg-gray-100 transition-all"
                    >
                      <ImageIcon className="mb-2 h-8 w-8" />
                      <span className="font-medium">Ajouter des images au slider</span>
                      <span className="text-xs mt-1">Recommandé : 3-5 images</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Bouton de sauvegarde */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 flex justify-end"
        >
          <button
            onClick={handleSave}
            className={`px-6 py-3 text-white font-medium rounded-lg shadow-md transition flex items-center justify-center gap-2 ${
              message.type === 'success' 
                ? 'bg-green-500 hover:bg-green-600' 
                : message.type === 'error'
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            style={{ 
              backgroundColor: message.type ? undefined : companyData.couleurPrimaire,
              minWidth: '200px'
            }}
          >
            {message.type === 'success' ? (
              <>
                <CheckCircle className="h-5 w-5" />
                <span>Enregistré !</span>
              </>
            ) : message.type === 'error' ? (
              <>
                <AlertCircle className="h-5 w-5" />
                <span>Réessayer</span>
              </>
            ) : (
              <>
                <Save className="h-5 w-5" />
                <span>Enregistrer</span>
              </>
            )}
          </button>
        </motion.div>

        {modalType && user?.companyId && (
          <ImageSelectorModal
            companyId={user.companyId}
            onSelect={handleImageSelect}
            onClose={() => setModalType(null)}
          />
        )}
      </motion.div>
    </div>
  );
};

export default ParametresVitrine;