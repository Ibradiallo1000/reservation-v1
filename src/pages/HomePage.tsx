import React from "react";
import Header from "@/components/home/Header";
import HeroSection from "@/components/home/HeroSection";
import PartnersSection from "@/components/home/PartnersSection";
import FeaturesSection from "@/components/home/FeaturesSection";
import TestimonialsSection from "@/components/home/TestimonialsSection";
import CTASection from "@/components/home/CTASection";
import Footer from "@/components/home/Footer";
import MyBookingsCTA from "@/components/common/MyBookingsCTA";
import SectionHeader from "@/components/common/SectionHeader"; // ⬅️ new

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-grow">
        <HeroSection />

        <section className="py-6 px-4 max-w-5xl mx-auto">
          <MyBookingsCTA />
        </section>

        {/* Partenaires */}
        <section className="py-8 md:py-10">
          <SectionHeader title="Nos compagnies partenaires" />
          <PartnersSection />
        </section>

        {/* Pourquoi choisir Teliya ? */}
        <section className="py-8 md:py-10 bg-gray-50">
          <SectionHeader title="Pourquoi choisir Teliya ?" />
          <FeaturesSection />
        </section>

        <section className="py-8 md:py-10">
          <TestimonialsSection />
        </section>

        <section className="py-10 md:py-12 bg-orange-600 text-white">
          <CTASection />
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default HomePage;
