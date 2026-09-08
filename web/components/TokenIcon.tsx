/* eslint-disable @next/next/no-img-element */

/**
 * Token mark. Served from `public/` rather than a token-list CDN, so the page
 * makes no third-party request and cannot show a broken icon if that CDN moves.
 */
export function TokenIcon({
  src,
  symbol,
  size = 26,
}: {
  src: string;
  symbol: string;
  size?: number;
}) {
  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      aria-hidden
      className="shrink-0 rounded-full"
      style={{ width: size, height: size }}
    />
  );
}
