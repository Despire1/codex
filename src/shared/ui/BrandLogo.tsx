import type { CSSProperties, FC } from 'react';

interface BrandLogoProps {
  width?: number;
  height?: number;
  className?: string;
  style?: CSSProperties;
}

const BRAND_LOGO_URL = '/pwa-icon.svg';

export const BrandLogo: FC<BrandLogoProps> = ({ width = 20, height = 20, className, style }) => (
  <span
    className={className}
    style={{
      display: 'inline-block',
      width,
      height,
      backgroundColor: 'currentColor',
      WebkitMask: `url(${BRAND_LOGO_URL}) center / contain no-repeat`,
      mask: `url(${BRAND_LOGO_URL}) center / contain no-repeat`,
      ...style,
    }}
  />
);
