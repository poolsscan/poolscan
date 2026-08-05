/* eslint-disable @next/next/no-img-element */
interface Props {
  symbol: string;
  hue: number;
  size?: number;
  logoUrl?: string;
}

export default function TokenAvatar({ symbol, hue, size = 34, logoUrl }: Props) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full object-cover"
        style={{
          width: size,
          height: size,
          boxShadow: "inset 0 0 0 1px rgba(18,33,29,0.08), 0 1px 2px rgba(18,33,29,0.10)",
        }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(145deg, hsl(${hue} 52% 64%), hsl(${(hue + 40) % 360} 46% 50%))`,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25), 0 1px 2px rgba(18,33,29,0.12)",
      }}
      aria-hidden
    >
      {symbol.slice(0, 1)}
    </span>
  );
}
