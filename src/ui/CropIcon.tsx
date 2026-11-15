/**
 * Small crop illustrations. Always shown next to the crop name; decorative
 * (aria-hidden). Colours identify the plant, never approval.
 */
export type IconId = "maize" | "tomato" | "squash" | "onion" | "rye" | "oat" | "vetch" | "vetch-oat" | "leftovers";

const S = { strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export function CropIcon({ id, size = 28 }: { id: IconId | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false" className="crop-icon">
      {draw(id)}
    </svg>
  );
}

const FRUIT: Record<string, string> = {'apple': '#c8402f', 'pear': '#a8b83a', 'peach': '#f08a4b', 'nectarine': '#e2563a', 'plum': '#6b3a7a', 'cherry': '#b3142b', 'apricot': '#f2a33a', 'almond': '#a7865a', 'pecan': '#7a5230', 'walnut': '#8b6a3f', 'orange': '#f08c1a', 'mandarin': '#f39a2b', 'lemon': '#e8d034', 'grapefruit': '#f2a35a'};

function tree(fruit: string, evergreen: boolean) {
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      <rect x={14.6} y={19} width={2.8} height={10} rx={1} fill="#7a5a3a" />
      <circle cx={16} cy={13} r={10} fill={evergreen ? "#2f7a3a" : "#6fae4a"} stroke="#3f6b22" strokeWidth={0.8} />
      {[[11, 11], [19, 9], [20, 16], [12, 17], [16, 13]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={1.9} fill={fruit} />)}
    </g>
  );
}

function cerealHead(dx = 0, spikelets = 6, awns = true) {
  const parts = [];
  for (let i = 0; i < spikelets; i++) {
    const y = 6 + i * 3.2;
    parts.push(<ellipse key={`l${i}`} cx={14.2 + dx} cy={y} rx={1.8} ry={1.3} fill="#d4a94a" stroke="#8a6a1f" strokeWidth={0.7} transform={`rotate(-30 ${14.2 + dx} ${y})`} />);
    parts.push(<ellipse key={`r${i}`} cx={17.8 + dx} cy={y} rx={1.8} ry={1.3} fill="#d4a94a" stroke="#8a6a1f" strokeWidth={0.7} transform={`rotate(30 ${17.8 + dx} ${y})`} />);
    if (awns) {
      parts.push(<line key={`al${i}`} x1={13 + dx} y1={y - 1} x2={10 + dx} y2={y - 5} stroke="#8a6a1f" strokeWidth={0.6} />);
      parts.push(<line key={`ar${i}`} x1={19 + dx} y1={y - 1} x2={22 + dx} y2={y - 5} stroke="#8a6a1f" strokeWidth={0.6} />);
    }
  }
  return parts;
}

function draw(id: string) {
  switch (id) {
    case "maize":
      return (
        <g {...S}>
          <path d="M16 29 C10 25 9 16 12 8 C13.5 5 18.5 5 20 8 C23 16 22 25 16 29 Z" fill="#f2c94c" stroke="#9a7417" strokeWidth={1} />
          {[10, 13, 16, 19, 22].map((y) => (
            <g key={y}>
              <circle cx={14} cy={y} r={1.2} fill="#e0a722" />
              <circle cx={16.2} cy={y + 0.6} r={1.2} fill="#e0a722" />
              <circle cx={18.3} cy={y} r={1.2} fill="#e0a722" />
            </g>
          ))}
          <path d="M16 29 C9 27 5 20 7 11 C10 17 12 22 16 29 Z" fill="#7fb069" stroke="#3f6b2a" strokeWidth={1} />
          <path d="M16 29 C23 27 27 20 25 11 C22 17 20 22 16 29 Z" fill="#6aa159" stroke="#3f6b2a" strokeWidth={1} />
          <path d="M16 5 C15 3 15.5 2 16.5 1.5 M16 5 C17.5 3.5 18.5 3.2 19.5 3.5" fill="none" stroke="#b8862b" strokeWidth={1} />
        </g>
      );
    case "tomato":
      return (
        <g {...S}>
          <circle cx={16} cy={18} r={10.5} fill="#e5533d" stroke="#9e2b1c" strokeWidth={1} />
          <path d="M11 13 C13 11 15 11 16 12 C17 11 19 11 21 13" fill="none" stroke="#c43c28" strokeWidth={0.8} />
          <path d="M16 9 L13 6.5 M16 9 L19 6.5 M16 9 L11.5 9.5 M16 9 L20.5 9.5 M16 9 L16 5" stroke="#3f7d32" strokeWidth={1.8} fill="none" />
        </g>
      );
    case "squash":
      return (
        <g {...S}>
          <path d="M16 9 C24 9 28 14 28 19 C28 25 22 29 16 29 C10 29 4 25 4 19 C4 14 8 9 16 9 Z" fill="#e8913a" stroke="#9a5413" strokeWidth={1} />
          <path d="M16 10 C13 14 13 24 16 28 M16 10 C19 14 19 24 16 28 M10 11.5 C7.5 16 8 24 11 27.5 M22 11.5 C24.5 16 24 24 21 27.5" fill="none" stroke="#b8661b" strokeWidth={0.9} />
          <path d="M16 9.5 C15.5 7 16.5 5 18.5 4" fill="none" stroke="#4f6b2a" strokeWidth={2} />
        </g>
      );
    case "onion":
      return (
        <g {...S}>
          <path d="M16 29 C9 29 6 24 7 19.5 C8 15 13 13 16 9 C19 13 24 15 25 19.5 C26 24 23 29 16 29 Z" fill="#c98bb0" stroke="#7b3d63" strokeWidth={1} />
          <path d="M16 11 C14 16 14 24 16 28 M16 11 C18 16 18 24 16 28" fill="none" stroke="#9e5a83" strokeWidth={0.8} />
          <path d="M16 10 C15 6 13 3 11 1.5 M16 10 C16 6 17 3 19 1.5 M16 10 C16.5 7 18.5 4.5 21.5 3.5" fill="none" stroke="#4f8f3a" strokeWidth={1.6} />
          <path d="M14 29.5 L13 31 M16 29.5 L16 31.2 M18 29.5 L19 31" stroke="#8a6a50" strokeWidth={0.8} />
        </g>
      );
    case "rye":
      return (
        <g {...S}>
          <line x1={16} y1={30} x2={16} y2={4} stroke="#8a6a1f" strokeWidth={1.2} />
          {cerealHead(0, 7, true)}
          <path d="M16 26 C12 24 9 21 8 17" fill="none" stroke="#7fb069" strokeWidth={1.6} />
        </g>
      );
    case "oat":
      return (
        <g {...S}>
          <path d="M16 30 L16 6" stroke="#8a6a1f" strokeWidth={1.2} />
          {[[16, 6, 11, 11], [16, 9, 21, 14], [16, 13, 10, 18], [16, 16, 22, 21], [16, 20, 11, 25]].map(([x1, y1, x2, y2], i) => (
            <g key={i}>
              <path d={`M${x1} ${y1} Q${(x1 + x2) / 2} ${y1} ${x2} ${y2}`} fill="none" stroke="#8a6a1f" strokeWidth={0.8} />
              <ellipse cx={x2} cy={y2 + 1.6} rx={1.5} ry={2.4} fill="#e2c26b" stroke="#8a6a1f" strokeWidth={0.7} />
            </g>
          ))}
        </g>
      );
    case "vetch":
    case "vetch-oat":
      return (
        <g {...S}>
          <path d="M8 30 C10 22 14 16 22 6" fill="none" stroke="#4f8f3a" strokeWidth={1.4} />
          {[[11, 23], [14, 18], [17, 13]].map(([x, y], i) => (
            <g key={i}>
              <ellipse cx={x - 3} cy={y - 0.5} rx={2.4} ry={1.1} fill="#7fb069" transform={`rotate(-25 ${x - 3} ${y - 0.5})`} />
              <ellipse cx={x + 2.5} cy={y + 1.5} rx={2.4} ry={1.1} fill="#7fb069" transform={`rotate(20 ${x + 2.5} ${y + 1.5})`} />
            </g>
          ))}
          {[0, 1, 2, 3, 4].map((i) => (
            <path key={i} d={`M${21 + i * 0.6} ${6 + i * 2.2} l3 -1.2 l-0.6 2.6 z`} fill="#8e5cc4" stroke="#5b3290" strokeWidth={0.5} />
          ))}
          <path d="M22 6 C24 4 26 4 27.5 5.5" fill="none" stroke="#4f8f3a" strokeWidth={1} />
          {id === "vetch-oat" && <path d="M6 30 L6 14 M6 16 L3.5 20 M6 19 L8.5 23" stroke="#b8862b" strokeWidth={1} fill="none" />}
        </g>
      );
    case "leftovers":
      return (
        <g {...S}>
          <rect x={3} y={22} width={26} height={6} rx={2} fill="#a98b62" />
          <path d="M6 22 L9 15 M11 22 L12 17 M17 22 L20 14 M23 22 L22 16 M26 22 L28 18" stroke="#c9a96b" strokeWidth={1.6} />
        </g>
      );
    case "apple":
    case "pear":
    case "peach":
    case "nectarine":
    case "plum":
    case "cherry":
    case "apricot":
    case "almond":
    case "pecan":
    case "walnut":
    case "orange":
    case "mandarin":
    case "lemon":
    case "grapefruit":
      return tree(FRUIT[id], id === "orange" || id === "mandarin" || id === "lemon" || id === "grapefruit");
    case "strawberry":
      return (
        <g {...S}>
          <path d="M16 9 C9 9 7 15 9 20 C11 25 14 28 16 28 C18 28 21 25 23 20 C25 15 23 9 16 9 Z" fill="#d7263d" stroke="#8a1323" strokeWidth={0.8} />
          <path d="M11 9 L16 5 L21 9 L18 8 L16 10 L14 8 Z" fill="#4f8f3a" />
          {[[13, 15], [19, 15], [16, 19], [12, 21], [20, 21], [16, 24]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={0.8} fill="#f6e27a" />)}
        </g>
      );
    case "pea":
    case "faba":
      return (
        <g {...S}>
          <path d="M6 22 C10 12 22 8 27 10 C25 16 16 24 6 22 Z" fill="#7fb24a" stroke="#3f6b22" strokeWidth={0.9} />
          {[0, 1, 2].map((i) => <circle key={i} cx={12 + i * 4.5} cy={18 - i * 2.6} r={id === "faba" ? 2.2 : 1.8} fill="#b6d97a" stroke="#3f6b22" strokeWidth={0.6} />)}
        </g>
      );
    case "radish":
      return (
        <g {...S}>
          <path d="M16 12 C21 12 22 18 19 24 L16 30 L13 24 C10 18 11 12 16 12 Z" fill="#f2f0e6" stroke="#9a8f78" strokeWidth={0.9} />
          <path d="M16 12 L12 4 M16 12 L16 3 M16 12 L20 4" stroke="#4f8f3a" strokeWidth={1.8} />
        </g>
      );
    case "buckwheat":
      return (
        <g {...S}>
          <path d="M16 30 L16 12" stroke="#a24d3a" strokeWidth={1.4} />
          {[[16, 8], [12, 11], [20, 11], [14, 6], [18, 6]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={2.2} fill="#fff" stroke="#c9a3a3" strokeWidth={0.7} />)}
          <path d="M16 20 C11 18 9 21 9 21 C12 23 15 22 16 20 Z" fill="#4f8f3a" />
        </g>
      );
    case "clover":
      return (
        <g {...S}>
          <path d="M16 30 L16 18" stroke="#3f6b22" strokeWidth={1.4} />
          {[[12, 15], [20, 15], [16, 10]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r={4} fill="#6fae4a" stroke="#3f6b22" strokeWidth={0.7} />)}
          <circle cx={16} cy={6} r={2.4} fill="#f2b6c6" />
        </g>
      );
    default:
      return (
        <g {...S}>
          <path d="M16 28 C8 22 8 10 16 4 C24 10 24 22 16 28 Z" fill="#9cc47a" stroke="#4f7a32" strokeWidth={0.9} />
          <path d="M16 28 L16 8" stroke="#4f7a32" strokeWidth={0.9} />
        </g>
      );
  }
}
