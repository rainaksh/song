import { useState } from 'react';
import { Disc3 } from 'lucide-react';

interface ArtworkImageProps {
  src: string;
  alt: string;
  className?: string;
  iconSize?: number;
}

export function ArtworkImage({
  src,
  alt,
  className = '',
  iconSize = 20,
}: ArtworkImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-gradient-to-br from-[#1C2026] to-[#111317] text-zinc-500 border border-white/[0.06] ${className}`}
        aria-label={alt}
      >
        <Disc3 size={iconSize} className="opacity-70" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={`object-cover bg-[#17191E] ${className}`}
    />
  );
}
