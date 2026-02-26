// src/shared/ui/PageLoader.tsx

import React from "react";

export interface PageLoaderProps {
  fullScreen?: boolean;
}

function PageLoader({ fullScreen }: PageLoaderProps): React.JSX.Element {
  return (
    <div
      className={`flex items-center justify-center ${
        fullScreen ? "min-h-screen bg-white dark:bg-gray-950" : "py-10"
      }`}
    >
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500" />
    </div>
  );
}

export default PageLoader;
