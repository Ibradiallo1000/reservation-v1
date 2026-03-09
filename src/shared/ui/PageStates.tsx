import React from "react";

type PageLoadingStateProps = {
  blocks?: number;
};

export const PageLoadingState: React.FC<PageLoadingStateProps> = ({
  blocks = 2,
}) => (
  <div className="p-6 space-y-3 animate-fadein">
    {Array.from({ length: blocks }).map((_, index) => (
      <div
        key={`loading-block-${index}`}
        className="h-24 rounded-xl skeleton"
      />
    ))}
  </div>
);

type PageOfflineStateProps = {
  message?: string;
};

export const PageOfflineState: React.FC<PageOfflineStateProps> = ({
  message = "Connexion instable: certaines données peuvent être incomplètes.",
}) => (
  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-200">
    {message}
  </div>
);

type PageErrorStateProps = {
  message: string;
  onRetry: () => void;
  retryLabel?: string;
};

export const PageErrorState: React.FC<PageErrorStateProps> = ({
  message,
  onRetry,
  retryLabel = "Réessayer",
}) => (
  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
    <span>{message}</span>
    <button
      type="button"
      onClick={onRetry}
      className="px-3 py-1.5 rounded border border-red-300 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40"
    >
      {retryLabel}
    </button>
  </div>
);
