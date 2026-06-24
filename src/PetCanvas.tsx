import { useEffect, useMemo, useRef, useState } from "react";
import type { PetAnimationState, PetManifest, PetStateName } from "./types";

interface PetCanvasProps {
  manifest: PetManifest;
  spriteDataUrl: string;
  stateName: PetStateName;
  scale: number;
  onLoopEnd?: () => void;
}

export function PetCanvas({
  manifest,
  spriteDataUrl,
  stateName,
  scale,
  onLoopEnd,
}: PetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef(0);
  const lastTickRef = useRef(0);
  const [loaded, setLoaded] = useState(false);

  const state: PetAnimationState = useMemo(() => {
    return manifest.states[stateName] ?? manifest.states[manifest.defaultState];
  }, [manifest, stateName]);

  useEffect(() => {
    // Image loading is an external resource boundary; this resets visual readiness.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoaded(false);
    frameRef.current = 0;
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setLoaded(true);
    };
    image.src = spriteDataUrl;
  }, [spriteDataUrl]);

  useEffect(() => {
    frameRef.current = 0;
    lastTickRef.current = 0;
  }, [stateName]);

  useEffect(() => {
    if (!loaded) return;

    let raf = 0;
    const frameMs = 1000 / Math.max(1, state.fps);
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const image = imageRef.current;

    const draw = (time: number) => {
      if (!canvas || !context || !image) return;

      if (!lastTickRef.current) lastTickRef.current = time;
      if (time - lastTickRef.current >= frameMs) {
        lastTickRef.current = time;
        const nextFrame = frameRef.current + 1;
        if (nextFrame >= state.frames) {
          frameRef.current = state.loop ? 0 : state.frames - 1;
          if (!state.loop) onLoopEnd?.();
        } else {
          frameRef.current = nextFrame;
        }
      }

      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.drawImage(
        image,
        frameRef.current * manifest.cellWidth,
        state.row * manifest.cellHeight,
        manifest.cellWidth,
        manifest.cellHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [loaded, manifest, onLoopEnd, state]);

  return (
    <canvas
      ref={canvasRef}
      className="pet-canvas"
      width={Math.round(manifest.cellWidth * scale)}
      height={Math.round(manifest.cellHeight * scale)}
      aria-label={`${manifest.displayName} desktop pet`}
    />
  );
}
