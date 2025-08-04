import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageSliderProps {
  images: string[];
  primaryColor: string;
}

export default function CompanyImageSlider({ images, primaryColor }: ImageSliderProps) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNav = (direction: 'prev' | 'next') => {
    setCurrentIndex((prev) =>
      direction === 'prev'
        ? prev === 0 ? images.length - 1 : prev - 1
        : prev === images.length - 1 ? 0 : prev + 1
    );
  };

  useEffect(() => {
    const interval = setInterval(() => handleNav('next'), 6000);
    return () => clearInterval(interval);
  }, [images]);

  if (!images || images.length === 0) return null;

  return (
    <section className="relative w-full max-w-6xl mx-auto my-10 rounded-xl overflow-hidden shadow border border-gray-200">
      <div className="relative h-64 md:h-96">
        <AnimatePresence mode="wait">
          <motion.img
            key={currentIndex}
            src={images[currentIndex]}
            alt={`Slide ${currentIndex}`}
            initial={{ opacity: 0.6, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.02 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </AnimatePresence>

        {/* Navigation buttons */}
        <div className="absolute inset-0 flex justify-between items-center px-4">
          <button
            onClick={() => handleNav('prev')}
            className="p-2 rounded-full bg-white/80 hover:bg-white shadow"
          >
            <ChevronLeft className="h-5 w-5 text-gray-700" />
          </button>
          <button
            onClick={() => handleNav('next')}
            className="p-2 rounded-full bg-white/80 hover:bg-white shadow"
          >
            <ChevronRight className="h-5 w-5 text-gray-700" />
          </button>
        </div>

        {/* Bullets */}
        <div className="absolute bottom-3 w-full flex justify-center gap-2">
          {images.map((_, index) => (
            <div
              key={index}
              className={`h-2 w-2 rounded-full transition-all duration-300 ${
                index === currentIndex ? 'bg-white' : 'bg-gray-400'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
