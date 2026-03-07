import React from "react";
import Header from "@/modules/plateforme/components/Header";
import HeroSection from "@/modules/plateforme/components/HeroSection";
import ProblemSection from "@/modules/plateforme/components/ProblemSection";
import ProductShowcaseSection from "@/modules/plateforme/components/ProductShowcaseSection";
import HowItWorksSection from "@/modules/plateforme/components/HowItWorksSection";
import PlatformStatsSection from "@/modules/plateforme/components/PlatformStatsSection";
import FinalCTASection from "@/modules/plateforme/components/FinalCTASection";
import FloatingDemoButton from "@/modules/plateforme/components/FloatingDemoButton";
import Footer from "@/modules/plateforme/components/Footer";

const HomePage: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900">
      <Header />

      <main className="flex-grow">
        <HeroSection />

        <div className="h-px w-full bg-gradient-to-r from-transparent via-orange-300/40 to-transparent dark:via-orange-400/30" />

        <ProblemSection />
        <ProductShowcaseSection />
        <HowItWorksSection />
        <PlatformStatsSection />
        <FinalCTASection />
      </main>

      <FloatingDemoButton />
      <Footer />
    </div>
  );
};

export default HomePage;
