// ════════════════════════════════════════════════════════════════════
// DATA API — stvarni podaci 7-9 jun + deterministički generisana istorija
// Premešteno iz app/page.tsx — logika generisanja je identična (isti seed).
// ════════════════════════════════════════════════════════════════════

const PUBLISHERS = [
  "Buka Magazin", "SEKTOR 51", "Wireless Media Group", "[HR] 24sata",
  "Hercegovina Info", "HotSport RS", "[RS] Novosti", "Oslobodjenje",
  "[HR] Večernji list", "RTV SLON", "[RS] Srbija Danas Doo"
];

type Row = { date: string; publisher: string; impressions: number; revenue: number; rpm: number };

const REAL_DATA: Row[] = [
  { date: "2026-06-07", publisher: "Buka Magazin", impressions: 39622, revenue: 8.23, rpm: 0.208 },
  { date: "2026-06-07", publisher: "SEKTOR 51", impressions: 38301, revenue: 29.33, rpm: 0.766 },
  { date: "2026-06-07", publisher: "Wireless Media Group", impressions: 950281, revenue: 509.05, rpm: 0.536 },
  { date: "2026-06-07", publisher: "[HR] 24sata", impressions: 298225, revenue: 68.78, rpm: 0.231 },
  { date: "2026-06-07", publisher: "Hercegovina Info", impressions: 93423, revenue: 59.95, rpm: 0.642 },
  { date: "2026-06-07", publisher: "HotSport RS", impressions: 4624, revenue: 1.00, rpm: 0.216 },
  { date: "2026-06-07", publisher: "[RS] Novosti", impressions: 574995, revenue: 144.76, rpm: 0.252 },
  { date: "2026-06-07", publisher: "Oslobodjenje", impressions: 92546, revenue: 57.56, rpm: 0.622 },
  { date: "2026-06-07", publisher: "[HR] Večernji list", impressions: 93480, revenue: 23.56, rpm: 0.252 },
  { date: "2026-06-07", publisher: "RTV SLON", impressions: 8407, revenue: 1.01, rpm: 0.120 },
  { date: "2026-06-07", publisher: "[RS] Srbija Danas Doo", impressions: 235682, revenue: 105.19, rpm: 0.446 },
  { date: "2026-06-08", publisher: "Buka Magazin", impressions: 67836, revenue: 15.55, rpm: 0.229 },
  { date: "2026-06-08", publisher: "SEKTOR 51", impressions: 41951, revenue: 34.66, rpm: 0.826 },
  { date: "2026-06-08", publisher: "Wireless Media Group", impressions: 924789, revenue: 476.00, rpm: 0.515 },
  { date: "2026-06-08", publisher: "[HR] 24sata", impressions: 322270, revenue: 73.25, rpm: 0.227 },
  { date: "2026-06-08", publisher: "Hercegovina Info", impressions: 84276, revenue: 52.71, rpm: 0.625 },
  { date: "2026-06-08", publisher: "HotSport RS", impressions: 5005, revenue: 1.23, rpm: 0.247 },
  { date: "2026-06-08", publisher: "[RS] Novosti", impressions: 551325, revenue: 156.72, rpm: 0.284 },
  { date: "2026-06-08", publisher: "Oslobodjenje", impressions: 33715, revenue: 22.62, rpm: 0.671 },
  { date: "2026-06-08", publisher: "[HR] Večernji list", impressions: 95995, revenue: 23.48, rpm: 0.245 },
  { date: "2026-06-08", publisher: "RTV SLON", impressions: 5142, revenue: 0.71, rpm: 0.138 },
  { date: "2026-06-08", publisher: "[RS] Srbija Danas Doo", impressions: 194439, revenue: 83.43, rpm: 0.429 },
  { date: "2026-06-09", publisher: "Buka Magazin", impressions: 44617, revenue: 12.68, rpm: 0.284 },
  { date: "2026-06-09", publisher: "SEKTOR 51", impressions: 36740, revenue: 31.96, rpm: 0.870 },
  { date: "2026-06-09", publisher: "Wireless Media Group", impressions: 872418, revenue: 495.91, rpm: 0.568 },
  { date: "2026-06-09", publisher: "[HR] 24sata", impressions: 300217, revenue: 73.70, rpm: 0.245 },
  { date: "2026-06-09", publisher: "Hercegovina Info", impressions: 81416, revenue: 56.62, rpm: 0.695 },
  { date: "2026-06-09", publisher: "HotSport RS", impressions: 5453, revenue: 1.35, rpm: 0.248 },
  { date: "2026-06-09", publisher: "[RS] Novosti", impressions: 428574, revenue: 132.38, rpm: 0.309 },
  { date: "2026-06-09", publisher: "Oslobodjenje", impressions: 22801, revenue: 15.78, rpm: 0.692 },
  { date: "2026-06-09", publisher: "[HR] Večernji list", impressions: 84837, revenue: 22.70, rpm: 0.268 },
  { date: "2026-06-09", publisher: "RTV SLON", impressions: 12707, revenue: 1.67, rpm: 0.131 },
  { date: "2026-06-09", publisher: "[RS] Srbija Danas Doo", impressions: 189924, revenue: 84.92, rpm: 0.447 },
];

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

const BASE_RPM: Record<string, number> = {
  "Buka Magazin": 0.22, "SEKTOR 51": 0.78, "Wireless Media Group": 0.53,
  "[HR] 24sata": 0.24, "Hercegovina Info": 0.65, "HotSport RS": 0.23,
  "[RS] Novosti": 0.27, "Oslobodjenje": 0.64, "[HR] Večernji list": 0.26,
  "RTV SLON": 0.13, "[RS] Srbija Danas Doo": 0.44
};
const BASE_IMP: Record<string, number> = {
  "Buka Magazin": 50000, "SEKTOR 51": 40000, "Wireless Media Group": 900000,
  "[HR] 24sata": 310000, "Hercegovina Info": 88000, "HotSport RS": 5000,
  "[RS] Novosti": 520000, "Oslobodjenje": 60000, "[HR] Večernji list": 90000,
  "RTV SLON": 8000, "[RS] Srbija Danas Doo": 220000
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
