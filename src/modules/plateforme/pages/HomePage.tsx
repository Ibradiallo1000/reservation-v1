import React from "react";
import Header from "@/modules/plateforme/components/Header";
import HeroSection from "@/modules/plateforme/components/HeroSection";
import ProblemSection from "@/modules/plateforme/components/ProblemSection";
import SolutionSection from "@/modules/plateforme/components/SolutionSection";
import HowItWorksSection from "@/modules/plateforme/components/HowItWorksSection";
import ProductShowcaseSection from "@/modules/plateforme/components/ProductShowcaseSection";
import PlatformStatsSection from "@/modules/plateforme/components/PlatformStatsSection";
import TrustSection from "@/modules/plateforme/components/TrustSection";
import FinalCTASection from "@/modules/plateforme/components/FinalCTASection";
import RequestDemoSection from "@/modules/plateforme/components/RequestDemoSection";
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
        <SolutionSection />
        <HowItWorksSection />
        <ProductShowcaseSection />
        <TrustSection />
        <PlatformStatsSection />
        <FinalCTASection />
        <RequestDemoSection />
      </main>

      <FloatingDemoButton />
      <Footer />
    </div>
  );
};

export default HomePage;
