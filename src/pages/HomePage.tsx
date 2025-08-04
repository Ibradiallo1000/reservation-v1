import React from "react";
import Header from "@/components/home/Header";
import HeroSection from "@/components/home/HeroSection";
import PopularCities from "@/components/home/PopularCities";
import PartnersSection from "@/components/home/PartnersSection";
import Footer from "@/components/home/Footer";

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col 
      bg-white 
      bg-[url('/images/world-pattern.png')] 
      bg-repeat">
      
      {/* Header avec logo + bouton connexion */}
      <Header />

      <main className="flex-grow">
        {/* Hero avec image universelle */}
        <HeroSection />

        {/* Destinations populaires */}
        <section className="py-12">
          <PopularCities />
        </section>

        {/* Compagnies partenaires dynamiques */}
        <section className="py-12 bg-gray-50">
          <PartnersSection />
        </section>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default HomePage;
