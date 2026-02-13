import React from "react";
import Header from "@/modules/public/components/home/Header";
import HeroSection from "@/modules/public/components/home/HeroSection";
import PartnersSection from "@/modules/public/components/home/PartnersSection";
import FeaturesSection from "@/modules/public/components/home/FeaturesSection";
import TestimonialsSection from "@/modules/public/components/home/TestimonialsSection";
import Footer from "@/modules/public/components/home/Footer";

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950">
      {/* ✅ header déjà sticky dans ton fichier Header.tsx */}
      <Header />
      {/* Spacer pour compenser le header fixed */}
      <div className="h-[56px] md:h-[60px]" />

      <main className="flex-grow">
        <HeroSection />

        {/* fine séparation visuelle */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-orange-300/40 to-transparent dark:via-orange-500/30" />

        {/* Partenaires immédiatement sous le hero */}
        <section className="py-6 md:py-8 bg-white dark:bg-gray-950">
          <PartnersSection />
        </section>

        {/* Pourquoi choisir Teliya ? — fond doux en sombre */}
        <section className="py-8 md:py-10 bg-gray-50 dark:bg-gray-900/40">
          <FeaturesSection />
        </section>

        <section className="py-8 md:py-10 bg-white dark:bg-gray-950">
          <TestimonialsSection />
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default HomePage;
