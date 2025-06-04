// src/components/PageLoaderComponent.tsx
import React from 'react';

interface PageLoaderProps {
  fullScreen?: boolean;
}

const PageLoaderComponent: React.FC<PageLoaderProps> = ({ fullScreen = false }) => {
  return (
    <div className={`flex items-center justify-center ${fullScreen ? 'fixed inset-0' : 'py-12'}`}>
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
    </div>
  );
};

export default PageLoaderComponent;
