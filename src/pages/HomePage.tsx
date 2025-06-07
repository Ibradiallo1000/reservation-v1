// ✅ src/pages/HomePage.tsx — version corrigée
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, MapPin, Search, Settings } from 'lucide-react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

console.log("✅ HomePage est bien monté !");

const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<{ departure: string; arrival: string }>({
    departure: '',
    arrival: '',
  });

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, () => {});
    return () => unsubscribe();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ Vérification anti JSON "undefined"
    const departure = formData.departure?.trim();
    const arrival = formData.arrival?.trim();

    if (!departure || !arrival || departure === "undefined" || arrival === "undefined") {
      alert("Veuillez saisir une ville de départ et d'arrivée valides.");
      return;
    }

    navigate('/resultats', { state: { departure, arrival } });
  };

  return (
    <>
      <header className="bg-white shadow-md p-4">
        <div className="flex justify-between items-center max-w-7xl mx-auto">
          <div className="flex items-center space-x-2">
            <Bus className="h-8 w-8 text-yellow-600" />
            <span className="text-xl font-bold text-yellow-600">TIKETA</span>
          </div>
          <div>
            <button
              onClick={() => navigate('/login')}
              className="text-gray-600 hover:text-yellow-700"
              title="Connexion"
            >
              <Settings className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      <div
        className="relative bg-cover bg-center h-[450px] md:h-[500px]"
        style={{
          backgroundImage:
            'url(https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&q=80)',
        }}
      >
        <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col justify-center px-4">
          <div className="text-center text-white">
            <h1 className="text-3xl md:text-5xl font-bold">
              Réservez votre voyage en toute simplicité
            </h1>
            <p className="mt-2 text-lg md:text-xl">
              Trouvez et achetez vos billets de bus partout au Mali et en Afrique
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-white/20 backdrop-blur rounded-xl shadow-lg mt-6 p-6 w-full max-w-4xl mx-auto text-left"
          >
            <div className="grid md:grid-cols-2 sm:grid-cols-2 grid-cols-1 gap-4">
              <div>
                <label className="text-sm text-white">Ville de départ</label>
                <div className="relative">
                  <MapPin className="absolute left-2 top-2.5 h-5 w-5 text-gray-500" />
                  <input
                    type="text"
                    name="departure"
                    value={formData.departure}
                    onChange={handleChange}
                    required
                    placeholder="Ex: Bamako"
                    className="pl-9 w-full border border-gray-300 rounded py-2 px-2 text-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm text-white">Ville d'arrivée</label>
                <div className="relative">
                  <MapPin className="absolute left-2 top-2.5 h-5 w-5 text-gray-500" />
                  <input
                    type="text"
                    name="arrival"
                    value={formData.arrival}
                    onChange={handleChange}
                    required
                    placeholder="Ex: Dakar"
                    className="pl-9 w-full border border-gray-300 rounded py-2 px-2 text-gray-800"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-center sm:justify-end">
              <button
                type="submit"
                className="flex items-center bg-yellow-600 text-white px-6 py-2 rounded hover:bg-yellow-700"
              >
                <Search className="h-5 w-5 mr-2" />
                Rechercher un trajet
              </button>
            </div>
          </form>

          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-white">
            <button
              onClick={() => navigate('/ClientMesReservationsPage')}
              className="bg-white/70 backdrop-blur text-gray-800 border px-4 py-2 rounded shadow hover:shadow-md"
            >
              Voir mes réservations
            </button>
            <button
              onClick={() => navigate('/tracking')}
              className="bg-white/70 backdrop-blur text-gray-800 border px-4 py-2 rounded shadow hover:shadow-md"
            >
              Suivre un trajet
            </button>
            <button
              onClick={() => navigate('/aide')}
              className="bg-white/70 backdrop-blur text-gray-800 border px-4 py-2 rounded shadow hover:shadow-md"
            >
              Aide
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default HomePage;
