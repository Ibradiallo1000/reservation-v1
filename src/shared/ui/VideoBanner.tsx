import React from 'react';

interface Props {
  videoUrl: string;
  fallbackImage: string;
  children?: React.ReactNode;
}

const VideoBanner: React.FC<Props> = ({ videoUrl, fallbackImage, children }) => {
  return (
    <div className="relative h-[420px] w-full overflow-hidden">
      <video
        className="absolute inset-0 w-full h-full object-cover"
        src={videoUrl}
        autoPlay
        muted
        loop
        playsInline
        poster={fallbackImage}
      />
      <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col justify-center items-center text-white text-center px-4">
        {children}
      </div>
    </div>
  );
};

export default VideoBanner;