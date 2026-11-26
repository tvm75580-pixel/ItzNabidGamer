import React, { useEffect, useState } from 'react';
import { bake3DCharacterSnapshot } from '../engine/minecraft3d';
import { SkinModel } from '../types';

interface PlayerAvatar3DProps {
  skinDataUrl: string;
  model: SkinModel;
  ign: string;
  variant?: 'bust' | 'full';
  forceSoftware2D?: boolean;
  className?: string;
}

/**
 * Renders a crisp 3D-baked Minecraft character portrait for ranked cards & tier cells.
 * Never displays raw 2D skin PNG files. Uses a single shared offscreen 3D renderer
 * so mobile browsers never hit WebGL context limits.
 */
export const PlayerAvatar3D: React.FC<PlayerAvatar3DProps> = ({
  skinDataUrl,
  model,
  ign,
  variant = 'bust',
  forceSoftware2D = false,
  className = '',
}) => {
  const [renderedSrc, setRenderedSrc] = useState<string>('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);

    if (!skinDataUrl) {
      setRenderedSrc('');
      return;
    }

    bake3DCharacterSnapshot({
      skinDataUrl,
      model,
      variant,
      forceSoftware2D,
    })
      .then((url) => {
        if (active) {
          setRenderedSrc(url);
        }
      })
      .catch(() => {
        if (active) {
          setFailed(true);
        }
      });

    return () => {
      active = false;
    };
  }, [skinDataUrl, model, variant, forceSoftware2D]);

  if (failed || !renderedSrc) {
    return (
      <div
        className={`flex items-center justify-center bg-[#0b0e14] text-xs font-semibold text-slate-500 select-none ${className}`}
        aria-label={`${ign} 3D model loading`}
      >
        <span className="font-display tracking-wider text-[#f97316]/70">
          {ign.slice(0, 2).toUpperCase()}
        </span>
      </div>
    );
  }

  return (
    <img
      src={renderedSrc}
      alt={`3D Minecraft character of ${ign}`}
      draggable={false}
      referrerPolicy="no-referrer"
      className={`pixelated object-contain select-none pointer-events-none ${className}`}
    />
  );
};
