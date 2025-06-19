// ✅ COMPOSANT : ParticleBackground - Fond animé avec particules flottantes
// Utilisé dans la section Hero pour renforcer l'esthétique moderne et dynamique

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';

interface ParticleProps {
  color: string;
}

const ParticleBackground: React.FC<ParticleProps> = ({ color }) => {
  // Génération des particules avec des positions, tailles et vitesses aléatoires
  const particles = useMemo(() =>
    Array.from({ length: 30 }).map((_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 2,
      duration: 5 + Math.random() * 10
    })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute rounded-full"
          style={{
            backgroundColor: color,
            width: `${particle.size}px`,
            height: `${particle.size}px`,
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            opacity: 0.6
          }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.6, 0],
            y: [`${particle.y}%`, `${particle.y + 10}%`]
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            repeatType: 'reverse'
          }}
        />
      ))}
    </div>
  );
};

export default ParticleBackground;
