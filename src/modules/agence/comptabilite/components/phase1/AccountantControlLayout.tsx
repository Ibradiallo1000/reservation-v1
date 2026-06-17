import React from "react";

export const AccountantControlLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="min-w-0 space-y-5">
    {children}
  </section>
);
