import React from "react";

/** État du header de page (contrôlé par chaque page) */
export type HeaderState = {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  actions?: React.ReactNode; // fallback si right non fourni
  bg?: string;               // background (couleur / dégradé)
  fg?: string;               // ✅ couleur du texte
};

type Ctx = {
  header: HeaderState;
  setHeader: (patch: HeaderState) => void;
  resetHeader: () => void;
};

const PageHeaderContext = React.createContext<Ctx | undefined>(undefined);

const defaultHeader: HeaderState = {};

export const PageHeaderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [header, setHeaderState] = React.useState<HeaderState>(defaultHeader);

  const setHeader = React.useCallback((patch: HeaderState) => {
    setHeaderState(patch || {});
  }, []);

  const resetHeader = React.useCallback(() => {
    setHeaderState(defaultHeader);
  }, []);

  const value = React.useMemo<Ctx>(() => ({ header, setHeader, resetHeader }), [header, setHeader, resetHeader]);

  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
};

export const usePageHeader = (): Ctx => {
  const ctx = React.useContext(PageHeaderContext);
  if (!ctx) throw new Error("usePageHeader must be used within PageHeaderProvider");
  return ctx;
};
