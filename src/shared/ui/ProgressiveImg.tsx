// src/components/ui/ProgressiveImg.tsx
import React, { useEffect, useState } from "react";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & {
  placeholderSrc?: string;   // image locale légère (svg/png)
  fadeDurationMs?: number;   // durée du fondu
};

const ProgressiveImg: React.FC<Props> = ({
  src,
  placeholderSrc = "/images/placeholder.png",
  fadeDurationMs = 200,
  style,
  ...rest
}) => {
  const [loaded, setLoaded] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(placeholderSrc);

  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.decoding = "async";
    img.loading = "eager";     // on veut que ça arrive vite pour l’en-tête
    img.src = src;
    img.onload = () => {
      setCurrentSrc(src as string);
      setLoaded(true);
    };
  }, [src]);

  return (
    <img
      {...rest}
      src={currentSrc}
      style={{
        transition: `opacity ${fadeDurationMs}ms ease`,
        opacity: loaded ? 1 : 0.001,
        ...style,
      }}
    />
  );
};

export default ProgressiveImg;
