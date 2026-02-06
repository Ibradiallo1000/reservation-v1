import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageSliderProps {
  images: string[];
  primaryColor: string;
}

export default function CompanyImageSlider({
  images,
  primaryColor,
}: ImageSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNav = (direction: 'prev' | 'next') => {
    setCurrentIndex((prev) =>
      direction === 'prev'
        ? prev === 0
          ? images.length - 1
          : prev - 1
        : prev === images.length - 1
        ? 0
        : prev + 1
    );
  };

  useEffect(() => {
    if (images.length <= 1) return;
    const interval = setInterval(() => handleNav('next'), 6000);
    return () => clearInterval(interval);
  }, [images]);

  if (!images || images.length === 0) return null;

  return (
    <section className="relative w-full max-w-5xl mx-auto my-10">
      {/* Conteneur carré */}
      <div className="relative aspect-square rounded-2xl overflow-hidden shadow-lg border border-gray-200 bg-white">
        <AnimatePresence mode="wait">
          <motion.img
            key={currentIndex}
            src={images[currentIndex]}
            alt={`Slide ${currentIndex + 1}`}
            initial={{ opacity: 0.6, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </AnimatePresence>

        {/* Boutons navigation */}
        {images.length > 1 && (
          <div className="absolute inset-0 flex justify-between items-center px-3">
            <button
              onClick={() => handleNav('prev')}
              className="p-2 rounded-full bg-white/80 backdrop-blur hover:bg-white shadow-md transition"
            >
              <ChevronLeft className="h-5 w-5 text-gray-700" />
            </button>
            <button
              onClick={() => handleNav('next')}
              className="p-2 rounded-full bg-white/80 backdrop-blur hover:bg-white shadow-md transition"
            >
              <ChevronRight className="h-5 w-5 text-gray-700" />
            </button>
          </div>
        )}

        {/* Bullets */}
        {images.length > 1 && (
          <div className="absolute bottom-4 w-full flex justify-center gap-2">
            {images.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition-all ${
                  index === currentIndex
                    ? 'scale-125'
                    : 'opacity-60'
                }`}
                style={{
                  backgroundColor:
                    index === currentIndex
                      ? primaryColor
                      : 'rgba(255,255,255,0.7)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
