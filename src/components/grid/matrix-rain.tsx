'use client';

import { useEffect, useRef } from 'react';

/**
 * The falling-glyph backdrop for the console.
 *
 * Drawn on a canvas rather than with DOM nodes: one column per ~14px of width
 * means several hundred animated glyphs, which the compositor would not enjoy as
 * elements. The trail is the classic trick — instead of clearing the frame, a
 * translucent black rectangle is painted over it, so older glyphs fade out on
 * their own.
 *
 * Honours `prefers-reduced-motion` by painting a single static frame.
 */

const GLYPHS = 'ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789:・.=*+-<>¦｜';
const FONT_SIZE = 14;
const FRAME_MS = 55;

export function MatrixRain({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let drops: number[] = [];
    let raf = 0;
    let last = 0;

    const resize = () => {
      // Backing store stays at CSS pixels: the glyphs are decorative and a 1x
      // canvas is a third of the fill cost of a retina one.
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      const columns = Math.ceil(canvas.width / FONT_SIZE);
      drops = Array.from({ length: columns }, () => Math.random() * -50);
      ctx.font = `${FONT_SIZE}px ui-monospace, monospace`;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    const paint = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < drops.length; i++) {
        const glyph = GLYPHS[(Math.random() * GLYPHS.length) | 0];
        const y = drops[i] * FONT_SIZE;
        // The head of each column is brighter than its tail.
        ctx.fillStyle = Math.random() > 0.97 ? '#d7ffe4' : '#1c8f3f';
        ctx.fillText(glyph, i * FONT_SIZE, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        else drops[i]++;
      }
    };

    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      paint();
    };

    resize();
    if (reduced) {
      for (let i = 0; i < 40; i++) paint();
    } else {
      raf = requestAnimationFrame(loop);
    }

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
