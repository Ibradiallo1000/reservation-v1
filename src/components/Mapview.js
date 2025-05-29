import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// Fix for default marker icon not showing in some environments
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.3/dist/images/marker-shadow.png',
});
const MapView = ({ agences, center = [12.6392, -8.0029] }) => {
    return (_jsx("div", { className: "h-[400px] w-full rounded-lg overflow-hidden shadow", children: _jsxs(MapContainer, { center: center, zoom: 6, style: { height: '100%', width: '100%' }, children: [_jsx(TileLayer, { attribution: '\u00A9 <a href="http://osm.org/copyright">OpenStreetMap</a> contributors', url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" }), agences.map((agence) => (_jsx(Marker, { position: [agence.latitude, agence.longitude], children: _jsxs(Popup, { children: [_jsx("strong", { children: agence.nomAgence }), _jsx("br", {}), agence.ville, ", ", agence.pays, _jsx("br", {}), agence.adresse && _jsxs(_Fragment, { children: [agence.adresse, _jsx("br", {})] }), agence.telephone && _jsxs(_Fragment, { children: ["\uD83D\uDCDE ", agence.telephone] })] }) }, agence.id)))] }) }));
};
export default MapView;
