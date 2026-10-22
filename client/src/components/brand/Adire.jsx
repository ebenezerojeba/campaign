// Original motifs in the spirit of Adire, the indigo resist-dyed cloth of
// Yoruba textile tradition, redrawn in the programme palette. Each tile is a
// square SVG; the hero composes them into a "cloth wall".

const PALETTES = {
  forest: { bg: '#143826', fg: '#3E7A57', hi: '#C9A227' },
  green: { bg: '#12813C', fg: '#0E6B31', hi: '#EAF5EE' },
  gold: { bg: '#C9A227', fg: '#A9851A', hi: '#0E2A1C' },
  mist: { bg: '#EEF4EF', fg: '#B8CDBE', hi: '#12813C' },
  paper: { bg: '#FBFCFA', fg: '#D6EBDD', hi: '#0E2A1C' },
  deep: { bg: '#0E2A1C', fg: '#1F4C34', hi: '#1A9A4A' },
};

function Oniko({ c }) {
  // Tied-circle motif: concentric rings in a 2×2 grid.
  const rings = (cx, cy) => [34, 24, 14, 5].map((r, i) => (
    <circle key={`${cx}${cy}${r}`} cx={cx} cy={cy} r={r} fill="none" stroke={i === 3 ? c.hi : c.fg} strokeWidth={i === 3 ? 10 : 5} />
  ));
  return <>{rings(50, 50)}{rings(150, 50)}{rings(50, 150)}{rings(150, 150)}</>;
}

function Stitch({ c }) {
  // Alabere: hand-stitched running lines.
  return (
    <>
      {[30, 70, 110, 150, 190].map((y) => (
        <line key={y} x1="0" y1={y - 10} x2="200" y2={y - 10} stroke={c.fg} strokeWidth="6" strokeDasharray="14 10" strokeLinecap="round" />
      ))}
      <circle cx="100" cy="100" r="22" fill={c.hi} />
    </>
  );
}

function Lagoon({ c }) {
  const wave = (y, color, w) => (
    <path key={y} d={`M-10 ${y} q 27.5 -22 55 0 t 55 0 t 55 0 t 55 0`} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" />
  );
  return <>{[40, 80, 120, 160].map((y, i) => wave(y, i === 1 ? c.hi : c.fg, i === 1 ? 7 : 6))}</>;
}

function Sun({ c }) {
  // Rays radiating from a corner.
  const rays = Array.from({ length: 9 }, (_, i) => {
    const a = (i / 8) * (Math.PI / 2);
    return <line key={i} x1="0" y1="200" x2={Math.cos(a) * 230} y2={200 - Math.sin(a) * 230} stroke={c.fg} strokeWidth="7" />;
  });
  return <>{rays}<circle cx="0" cy="200" r="58" fill={c.hi} /><circle cx="0" cy="200" r="34" fill={c.bg} /></>;
}

function Dots({ c }) {
  const dots = [];
  for (let x = 20; x < 200; x += 32) for (let y = 20; y < 200; y += 32) {
    const centre = x > 70 && x < 130 && y > 70 && y < 130;
    dots.push(<circle key={`${x}-${y}`} cx={x} cy={y} r={centre ? 11 : 6} fill={centre ? c.hi : c.fg} />);
  }
  return <>{dots}</>;
}

function Leaf({ c }) {
  // Four-petal flower formed by intersecting arcs.
  return (
    <>
      <path d="M100 100 C 100 40, 160 40, 160 100 C 160 160, 100 160, 100 100 Z" fill={c.fg} />
      <path d="M100 100 C 100 40, 40 40, 40 100 C 40 160, 100 160, 100 100 Z" fill={c.fg} />
      <path d="M100 100 C 40 100, 40 40, 100 40 C 160 40, 160 100, 100 100 Z" fill={c.fg} opacity="0.7" />
      <path d="M100 100 C 40 100, 40 160, 100 160 C 160 160, 160 100, 100 100 Z" fill={c.fg} opacity="0.7" />
      <circle cx="100" cy="100" r="13" fill={c.hi} />
      {[[12, 12], [188, 12], [12, 188], [188, 188]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="7" fill={c.fg} />)}
    </>
  );
}

function Chevron({ c }) {
  return (
    <>
      {[20, 60, 100, 140, 180].map((y, i) => (
        <path key={y} d={`M-10 ${y + 18} L 25 ${y - 12} L 60 ${y + 18} L 95 ${y - 12} L 130 ${y + 18} L 165 ${y - 12} L 200 ${y + 18} L 235 ${y - 12}`} fill="none" stroke={i === 2 ? c.hi : c.fg} strokeWidth="7" strokeLinejoin="round" />
      ))}
    </>
  );
}

function Checks({ c }) {
  const cells = [];
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) {
    if ((i + j) % 2 === 0) cells.push(<rect key={`${i}${j}`} x={i * 50 + 9} y={j * 50 + 9} width="32" height="32" rx="4" fill={(i === 1 && j === 1) || (i === 2 && j === 2) ? c.hi : c.fg} />);
  }
  return <>{cells}</>;
}

const MOTIFS = { oniko: Oniko, stitch: Stitch, lagoon: Lagoon, sun: Sun, dots: Dots, leaf: Leaf, chevron: Chevron, checks: Checks };

export function AdireTile({ motif = 'oniko', palette = 'forest', className, title }) {
  const c = PALETTES[palette];
  const Motif = MOTIFS[motif];
  return (
    <svg viewBox="0 0 200 200" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true} preserveAspectRatio="xMidYMid slice">
      {title && <title>{title}</title>}
      <rect width="200" height="200" fill={c.bg} />
      <Motif c={c} />
    </svg>
  );
}

// A thin horizontal band of motifs used as a section divider / footer edge.
export function AdireBand({ className }) {
  const seq = [['oniko', 'forest'], ['lagoon', 'green'], ['dots', 'gold'], ['stitch', 'deep'], ['leaf', 'mist'], ['chevron', 'forest'], ['sun', 'green'], ['checks', 'gold']];
  return (
    <div className={className} aria-hidden>
      <div className="flex h-full">
        {[...seq, ...seq, ...seq].map(([m, p], i) => <AdireTile key={i} motif={m} palette={p} className="h-full w-auto shrink-0" />)}
      </div>
    </div>
  );
}
