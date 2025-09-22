// src/pages/HomePage.tsx
import React from "react";
import Header from "@/components/home/Header";
import HeroSection from "@/components/home/HeroSection";
import PartnersSection from "@/components/home/PartnersSection";
import FeaturesSection from "@/components/home/FeaturesSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import CTASection from "@/components/home/CTASection";
import Footer from "@/components/home/Footer";
import MyBookingsCTA from "@/components/common/MyBookingsCTA"; // ⬅️ nouveau

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-grow">
        <HeroSection />

        {/* 🔶 Bouton “Voir mes réservations” (plateforme) */}
        <section className="py-6 px-4 max-w-5xl mx-auto">
          <MyBookingsCTA />
        </section>

        <section className="py-8 md:py-10"><PartnersSection /></section>
        <section className="py-8 md:py-10 bg-gray-50"><FeaturesSection /></section>
        <section className="py-8 md:py-10"><TestimonialsSection /></section>
        <section className="py-10 md:py-12 bg-orange-600 text-white">
          <CTASection />
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default HomePage;
