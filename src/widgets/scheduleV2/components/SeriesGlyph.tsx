import type { FC, SVGProps } from 'react';

/** Маленькая «петля» (Material `repeat`) — маркер повторяющегося урока. */
export const SeriesGlyph: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
  </svg>
);
