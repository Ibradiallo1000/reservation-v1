// ✅ AGENCY ITEM - Version Professionnelle
import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Phone, Globe, ExternalLink } from 'lucide-react';
import { Agence } from '@/types/companyTypes';

interface AgencyItemProps {
  agence: Agence;
  primaryColor: string;
}

const AgencyItem: React.FC<AgencyItemProps> = ({ agence, primaryColor }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="p-5 my-3 rounded-xl shadow-sm hover:shadow-md transition-all"
      style={{
        backgroundColor: '#ffffff',
        borderLeft: `4px solid ${primaryColor}`,
        boxShadow: '0 2px 12px rgba(0,0,0,0.05)'
      }}
    >
      <div className="flex justify-between items-start">
        <h3 className="font-bold text-lg mb-2" style={{ color: primaryColor }}>
          {agence.nomAgence}
        </h3>
        {agence.latitude && agence.longitude && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${agence.latitude},${agence.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm px-2 py-1 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            <span>Maps</span>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-gray-100">
            <Globe className="h-4 w-4" style={{ color: primaryColor }} />
          </div>
          <span className="text-gray-700">{agence.pays}</span>
        </div>

        {agence.quartier && (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-gray-100">
              <MapPin className="h-4 w-4" style={{ color: primaryColor }} />
            </div>
            <span className="text-gray-700">{agence.quartier}</span>
          </div>
        )}

        {agence.telephone && (
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full bg-gray-100">
              <Phone className="h-4 w-4" style={{ color: primaryColor }} />
            </div>
            <a 
              href={`tel:${agence.telephone}`} 
              className="text-gray-700 hover:underline hover:text-gray-900 transition-colors"
            >
              {agence.telephone}
            </a>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default AgencyItem;