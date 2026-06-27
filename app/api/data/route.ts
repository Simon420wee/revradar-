// ════════════════════════════════════════════════════════════════════
// DATA API — stvarni podaci 7-9 jun + deterministički generisana istorija
// Premešteno iz app/page.tsx — logika generisanja je identična (isti seed).
// ════════════════════════════════════════════════════════════════════

const PUBLISHERS = ["Oslobodjenje"];

type Row = { date: string; publisher: string; impressions: number; revenue: number; rpm: number };

const REAL_DATA: Row[] = [
  { date: "2026-06-07", publisher: "Oslobodjenje", impressions: 92546, revenue: 57.56, rpm: 0.622 },
  { date: "2026-06-08", publisher: "Oslobodjenje", impressions: 33715, revenue: 22.62, rpm: 0.671 },
  { date: "2026-06-09", publisher: "Oslobodjenje", impressions: 22801, revenue: 15.78, rpm: 0.692 },
];

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

const BASE_RPM: Record<string, number> = {
  "Oslobodjenje": 0.64
};
const BASE_IMP: Record<string, number> = {
  "Oslobodjenje": 60000
};

function generateHistory(): Row[] {
  const rows: Row[] = [];
  const start = new Date("2026-03-12");
  for (let d = 0; d < 87; d++) {
    const date = new Date(start);
    date.setDate(start.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    PUBLISHERS.forEach((pub, pi) => {
      const seed = d * 100 + pi;
      const noise = 0.85 + seededRandom(seed) * 0.3;
      const wf = isWeekend ? 0.75 : 1;
      const imp = Math.round(BASE_IMP[pub] * noise * wf);
      const rpm = +(BASE_RPM[pub] * (0.9 + seededRandom(seed + 5000) * 0.2)).toFixed(3);
      const rev = +((imp / 1000) * rpm).toFixed(2);
      rows.push({ date: dateStr, publisher: pub, impressions: imp, revenue: rev, rpm });
    });
  }
  return rows;
}

const ALL_DATA: Row[] = [...generateHistory(), ...REAL_DATA];

// ── GET /api/data ──────────────────────────────────────────────────
//   /api/data                                  → svi redovi
//   /api/data?publisher=Oslobodjenje           → filter po publisheru
//   /api/data?from=2026-06-07&to=2026-06-09     → filter po opsegu datuma (inkluzivno)
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const publisher = searchParams.get("publisher");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let rows = ALL_DATA;
  if (publisher) rows = rows.filter(r => r.publisher === publisher);
  if (from) rows = rows.filter(r => r.date >= from); // ISO datumi se sortiraju leksikografski
  if (to) rows = rows.filter(r => r.date <= to);

  return Response.json(rows);
}
