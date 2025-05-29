// 🗺️ MapView.tsx – carte interactive des agences avec Leaflet
import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon not showing in some environments
delete (L.Icon.Default as any).prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
});

interface Agence {
  id: string;
  nomAgence: string;
  latitude: number;
  longitude: number;
  ville: string;
  pays: string;
  adresse?: string;
  telephone?: string;
}

interface Props {
  agences: Agence[];
  center?: [number, number];
}

const MapView: React.FC<Props> = ({ agences, center = [12.6392, -8.0029] }) => {
  return (
    <div className="h-[400px] w-full rounded-lg overflow-hidden shadow">
      <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {agences.map((agence) => (
          <Marker key={agence.id} position={[agence.latitude, agence.longitude]}>
            <Popup>
              <strong>{agence.nomAgence}</strong><br />
              {agence.ville}, {agence.pays}<br />
              {agence.adresse && <>{agence.adresse}<br /></>}
              {agence.telephone && <>📞 {agence.telephone}</>}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default MapView;
