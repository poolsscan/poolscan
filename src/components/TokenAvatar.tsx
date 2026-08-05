interface Props {
  symbol: string;
  hue: number;
  size?: number;
}

export default function TokenAvatar({ symbol, hue, size = 34 }: Props) {
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
