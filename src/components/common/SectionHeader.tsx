import React from "react";
import clsx from "clsx";

type Props = {
  title: string;
  subtitle?: string;
  className?: string;
};

/** Titre de section propre, centré, SANS traits décoratifs */
const SectionHeader: React.FC<Props> = ({ title, subtitle, className }) => {
  return (
    <div className={clsx("max-w-6xl mx-auto px-4 mb-4 text-center", className)}>
      <h2 className="text-2xl md:text-[28px] font-extrabold tracking-tight text-gray-900">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1 text-sm md:text-base text-gray-600">{subtitle}</p>
      )}
    </div>
  );
};

export default SectionHeader;
