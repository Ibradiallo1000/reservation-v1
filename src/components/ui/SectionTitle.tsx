import React from "react";

export default function SectionTitle({
  children,
  className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-6 ${className}`}>
      <h2 className="text-orange-600 text-2xl md:text-3xl font-extrabold tracking-tight">
        {children}
      </h2>
      <div className="mt-2 h-1 w-16 bg-orange-500 rounded"></div>
    </div>
  );
}
