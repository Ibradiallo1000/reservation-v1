import React from "react";
import clsx from "clsx";

type Props = React.PropsWithChildren<{
  className?: string;
}>;

/** Titre centré, propre, sans traits parasites */
const SectionTitle: React.FC<Props> = ({ children, className }) => (
  <h2
    className={clsx(
      "text-center font-extrabold tracking-tight",
      "text-2xl md:text-[28px] text-gray-900",
      "mb-4",
      className
    )}
  >
    {children}
  </h2>
);

export default SectionTitle;
