"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell
} from "recharts";
import { useAuth } from "./context/AuthContext";
import PublisherDashboard from "./components/PublisherDashboard";
import {
  PubStatus, PublisherMeta, DailyEntry, AdUnitEntry,
  getPublishers, setPublishers, getAllData, setAllData,
  getAllAdUnits, setAllAdUnits, getMessages, setMessages, calcRpm,
} from "./lib/store";

// ════════════════════════════════════════════════════════════════════
// DATA LAYER — stvarni podaci 7-9 jun + deterministički generisana istorija
// ════════════════════════════════════════════════════════════════════

const PUBLISHERS = [
  "Buka Magazin", "SEKTOR 51", "Wireless Media Group", "[HR] 24sata",
  "Hercegovina Info", "HotSport RS", "[RS] Novosti", "Oslobodjenje",
  "[HR] Večernji list", "RTV SLON", "[RS] Srbija Danas Doo"
];

type Row = { date: string; publisher: string; impressions: number; revenue: number; rpm: number };

// Podaci se učitavaju sa GET /api/data (premešteno iz ovog fajla).
// Helperi ispod (seededRandom, BASE_RPM, BASE_IMP) ostaju jer ih koristi
// logika računanja u publisherDeepData.

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

const NETWORK_AVG_RPM = 0.43; // prosek mreže

// ── Deep analytics per publisher — deterministički generisano ──────────────
type AdUnit = { name: string; impressions: number; revenue: number; rpm: number; fillRate: number; viewability: number };
type GeoRow = { country: string; share: number; rpm: number };
type DeviceRow = { device: string; share: number; rpm: number };
type BidderRow = { bidder: string; winRate: number; avgCpm: number; timeout: number };
type HourRow = { hour: string; rpm: number; impressions: number };
type Insight = { severity: "critical" | "warning" | "positive" | "info"; title: string; detail: string; action: string };

const AD_UNIT_TEMPLATES = [
  { name: "Billboard 970×250", rpmMult: 1.6, share: 0.18 },
  { name: "Leaderboard 728×90", rpmMult: 0.8, share: 0.22 },
  { name: "In-Article 300×250", rpmMult: 1.2, share: 0.28 },
  { name: "Sticky Sidebar 300×600", rpmMult: 1.4, share: 0.15 },
  { name: "Anchor Mobile 320×100", rpmMult: 0.9, share: 0.17 },
];

const SSP_BIDDERS = ["Google AdX", "Criteo", "Pubmatic", "Index Exchange", "OpenX", "Smart AdServer"];

function publisherDeepData(pub: string, fallback?: { rpm: number; imp: number }) {
  const known = PUBLISHERS.indexOf(pub);
  const pi = known >= 0 ? known : pub.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 97;
  const baseRpm = BASE_RPM[pub] ?? fallback?.rpm ?? NETWORK_AVG_RPM;
  const baseImp = BASE_IMP[pub] ?? fallback?.imp ?? 50000;
  const s = (n: number) => seededRandom(pi * 1000 + n);

  // Ad units
  const adUnits: AdUnit[] = AD_UNIT_TEMPLATES.map((t, i) => {
    const imp = Math.round(baseImp * t.share * (0.9 + s(i) * 0.2));
    const rpm = +(baseRpm * t.rpmMult * (0.85 + s(i + 10) * 0.3)).toFixed(3);
    return {
      name: t.name,
      impressions: imp,
      revenue: +((imp / 1000) * rpm).toFixed(2),
      rpm,
      fillRate: Math.round(55 + s(i + 20) * 40),
      viewability: Math.round(40 + s(i + 30) * 50),
    };
  });

  // Geo
  const geoPool = pub.startsWith("[HR]")
    ? [["HR", 62], ["BA", 14], ["DE", 9], ["AT", 6], ["Ostalo", 9]]
    : pub.startsWith("[RS]")
    ? [["RS", 66], ["BA", 11], ["DE", 8], ["CH", 5], ["Ostalo", 10]]
    : [["BA", 58], ["RS", 15], ["HR", 9], ["DE", 8], ["Ostalo", 10]];
  const geo: GeoRow[] = geoPool.map(([c, sh], i) => ({
    country: c as string,
    share: sh as number,
    rpm: +(baseRpm * (c === "DE" || c === "AT" || c === "CH" ? 2.2 + s(i + 40) : 0.8 + s(i + 40) * 0.4)).toFixed(3),
  }));

  // Devices
  const mobShare = Math.round(58 + s(50) * 25);
  const devices: DeviceRow[] = [
    { device: "Mobile", share: mobShare, rpm: +(baseRpm * (0.75 + s(51) * 0.2)).toFixed(3) },
    { device: "Desktop", share: Math.round((100 - mobShare) * 0.8), rpm: +(baseRpm * (1.3 + s(52) * 0.3)).toFixed(3) },
    { device: "Tablet", share: 100 - mobShare - Math.round((100 - mobShare) * 0.8), rpm: +(baseRpm * (1.0 + s(53) * 0.2)).toFixed(3) },
  ];

  // SSP bidders
  const bidders: BidderRow[] = SSP_BIDDERS.map((b, i) => ({
    bidder: b,
    winRate: Math.round(8 + s(i + 60) * 30),
    avgCpm: +(baseRpm * (0.7 + s(i + 70) * 1.2)).toFixed(2),
    timeout: Math.round(2 + s(i + 80) * 12),
  })).sort((a, b) => b.winRate - a.winRate);

  // Hourly RPM pattern
  const hourly: HourRow[] = Array.from({ length: 24 }, (_, h) => {
    const peak = h >= 8 && h <= 22 ? 1 : 0.55;
    const evening = h >= 18 && h <= 21 ? 1.25 : 1;
    return {
      hour: String(h).padStart(2, "0") + "h",
      rpm: +(baseRpm * peak * evening * (0.9 + s(h + 100) * 0.2)).toFixed(3),
      impressions: Math.round((baseImp / 24) * peak * evening * (0.85 + s(h + 130) * 0.3)),
    };
  });

  // Overall health metrics
  const fillRate = Math.round(adUnits.reduce((sum, u) => sum + u.fillRate, 0) / adUnits.length);
  const viewability = Math.round(adUnits.reduce((sum, u) => sum + u.viewability, 0) / adUnits.length);

  // Auto insights
  const insights: Insight[] = [];
  const rpmVsNetwork = ((baseRpm - NETWORK_AVG_RPM) / NETWORK_AVG_RPM) * 100;
  if (rpmVsNetwork < -25) insights.push({
    severity: "critical",
    title: `RPM ${Math.abs(rpmVsNetwork).toFixed(0)}% ispod proseka mreže`,
    detail: `Trenutni RPM €${baseRpm.toFixed(3)} vs prosek mreže €${NETWORK_AVG_RPM.toFixed(3)}. Impresije su stabilne, problem nije u trafficu.`,
    action: "Proveri floor price u Google Ad Manageru — verovatno je postavljen prenisko ili ne postoji."
  });
  const worstUnit = [...adUnits].sort((a, b) => a.viewability - b.viewability)[0];
  if (worstUnit.viewability < 55) insights.push({
    severity: "warning",
    title: `${worstUnit.name} ima viewability ${worstUnit.viewability}%`,
    detail: `Industrijski standard je 70%+. Oglas se učitava ali ga korisnici ne vide, što obara cenu na aukciji.`,
    action: "Premesti ad unit iznad folda ili uključi lazy loading da se učitava tek kad je vidljiv."
  });
  const worstFill = [...adUnits].sort((a, b) => a.fillRate - b.fillRate)[0];
  if (worstFill.fillRate < 65) insights.push({
    severity: "warning",
    title: `${worstFill.name} fill rate samo ${worstFill.fillRate}%`,
    detail: `Više od trećine aukcija završi bez prodate impresije — to je čist izgubljen prihod.`,
    action: "Dodaj još SSP partnera za ovaj format ili snizi floor price za neprodati inventory."
  });
  const slowBidder = bidders.find(b => b.timeout > 9);
  if (slowBidder) insights.push({
    severity: "info",
    title: `${slowBidder.bidder} timeout rate ${slowBidder.timeout}%`,
    detail: `Bidder često ne stigne da odgovori u auction windowu, pa njegove ponude propadaju.`,
    action: "Produži prebid timeout sa 1000ms na 1500ms ili prebaci bidder na server-side."
  });
  const deImpact = geo.find(g => g.country === "DE");
  if (deImpact && deImpact.rpm > baseRpm * 1.8) insights.push({
    severity: "positive",
    title: `Dijaspora traffic (DE) ima RPM €${deImpact.rpm.toFixed(3)}`,
    detail: `Nemački posetioci donose ${(deImpact.rpm / baseRpm).toFixed(1)}x veći RPM od domaćih. Trenutno čine samo ${deImpact.share}% poseta.`,
    action: "Razmotri content targetiran dijaspori — svaki dodatni % DE traffica značajno diže ukupan prihod."
  });
  const bestUnit = [...adUnits].sort((a, b) => b.rpm - a.rpm)[0];
  insights.push({
    severity: "positive",
    title: `${bestUnit.name} je top format — RPM €${bestUnit.rpm.toFixed(3)}`,
    detail: `Ovaj format donosi ${((bestUnit.revenue / adUnits.reduce((sum, u) => sum + u.revenue, 0)) * 100).toFixed(0)}% prihoda publishera.`,
    action: "Razmotri dodavanje još jedne pozicije ovog formata na stranicama sa dugim sadržajem."
  });

  return { adUnits, geo, devices, bidders, hourly, fillRate, viewability, insights };
}

// ════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════

const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : String(n);
const fmtEur = (n: number) => "€" + n.toFixed(2);
const fmtRpm = (n: number) => "€" + n.toFixed(3);

function getCountry(pub: string) {
  if (pub.startsWith("[HR]")) return "HR";
  if (pub.startsWith("[RS]")) return "RS";
  return "BA";
}

const COUNTRY_COLOR: Record<string, string> = { HR: "#38bdf8", RS: "#f472b6", BA: "#a78bfa" };
const PIE_COLORS = ["#818cf8", "#7dd3fc", "#f472b6", "#fbbf24", "#4ade80", "#a78bfa"];
const CMP_COLORS = ["#818cf8", "#4ade80", "#fbbf24", "#f472b6"];

function aggregateByDate(data: Row[]) {
  const map: Record<string, { date: string; impressions: number; revenue: number }> = {};
  data.forEach(r => {
    if (!map[r.date]) map[r.date] = { date: r.date, impressions: 0, revenue: 0 };
    map[r.date].impressions += r.impressions;
    map[r.date].revenue += r.revenue;
  });
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    ...d,
    rpm: +((d.revenue / (d.impressions / 1000))).toFixed(3),
    dateLabel: d.date.slice(5).replace("-", "/")
  }));
}

function aggregateByPublisher(data: Row[]) {
  const map: Record<string, { publisher: string; impressions: number; revenue: number; days: number }> = {};
  data.forEach(r => {
    if (!map[r.publisher]) map[r.publisher] = { publisher: r.publisher, impressions: 0, revenue: 0, days: 0 };
    map[r.publisher].impressions += r.impressions;
    map[r.publisher].revenue += r.revenue;
    map[r.publisher].days += 1;
  });
  return Object.values(map).map(d => ({
    ...d,
    rpm: +((d.revenue / (d.impressions / 1000))).toFixed(3),
    country: getCountry(d.publisher)
  })).sort((a, b) => b.revenue - a.revenue);
}

function getAlerts(data: Row[]) {
  const byPub: Record<string, Row[]> = {};
  data.forEach(r => { if (!byPub[r.publisher]) byPub[r.publisher] = []; byPub[r.publisher].push(r); });
  const alerts: { type: string; publisher: string; message: string; value: string }[] = [];
  Object.entries(byPub).forEach(([pub, rows]) => {
    rows.sort((a, b) => b.date.localeCompare(a.date));
    if (rows.length < 2) return;
    const today = rows[0], yesterday = rows[1];
    const rpmDiff = ((today.rpm - yesterday.rpm) / yesterday.rpm) * 100;
    const impDiff = ((today.impressions - yesterday.impressions) / yesterday.impressions) * 100;
    const revDiff = ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100;
    if (revDiff < -15) alerts.push({ type: "critical", publisher: pub, message: `Prihod pao ${Math.abs(revDiff).toFixed(0)}% vs juče`, value: fmtEur(today.revenue) });
    else if (revDiff > 20) alerts.push({ type: "positive", publisher: pub, message: `Prihod porastao ${revDiff.toFixed(0)}% vs juče`, value: fmtEur(today.revenue) });
    if (rpmDiff < -15) alerts.push({ type: "warning", publisher: pub, message: `RPM pao ${Math.abs(rpmDiff).toFixed(0)}% vs juče`, value: fmtRpm(today.rpm) });
    if (impDiff < -30) alerts.push({ type: "warning", publisher: pub, message: `Impresije pale ${Math.abs(impDiff).toFixed(0)}% vs juče`, value: fmt(today.impressions) });
  });
  return alerts.sort((a, b) => a.type === "critical" ? -1 : b.type === "critical" ? 1 : 0);
}

// ── CSV Import — LTBA format: datum, publisher, impressions, revenue, RPM ──

function parseLtbaCsv(text: string): { rows: Row[]; errors: string[] } {
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], errors: ["Fajl je prazan"] };
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const splitLine = (line: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === delim && !q) { out.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const header = splitLine(lines[0]).map(h => h.toLowerCase());
  const idx = {
    date: header.findIndex(h => h.includes("dat") || h.includes("date")),
    publisher: header.findIndex(h => h.includes("publisher") || h.includes("sajt") || h.includes("site")),
    impressions: header.findIndex(h => h.includes("impres") || h === "imp"),
    revenue: header.findIndex(h => h.includes("revenue") || h.includes("prihod")),
    rpm: header.findIndex(h => h.includes("rpm") || h.includes("ecpm")),
  };
  if (idx.date < 0 || idx.publisher < 0 || idx.impressions < 0 || idx.revenue < 0) {
    return { rows: [], errors: ["Header nije prepoznat kao LTBA format — potrebne kolone: datum, publisher, impressions, revenue, RPM"] };
  }
  const parseNum = (raw: string) => {
    let s = raw.replace(/[€\s"]/g, "");
    if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(",", ".");
    return parseFloat(s);
  };
  const parseDate = (raw: string) => {
    const s = raw.replace(/"/g, "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return null;
  };
  const rows: Row[] = [];
  lines.slice(1).forEach((line, i) => {
    const cols = splitLine(line);
    const date = parseDate(cols[idx.date] ?? "");
    const publisher = (cols[idx.publisher] ?? "").replace(/"/g, "").trim();
    const impressions = Math.round(parseNum(cols[idx.impressions] ?? ""));
    const revenue = parseNum(cols[idx.revenue] ?? "");
    let rpm = idx.rpm >= 0 ? parseNum(cols[idx.rpm] ?? "") : NaN;
    if (!date || !publisher || isNaN(impressions) || isNaN(revenue)) {
      errors.push(`Red ${i + 2}: nevalidan zapis — preskočen`);
      return;
    }
    if (isNaN(rpm)) rpm = +(revenue / (impressions / 1000)).toFixed(3);
    rows.push({ date, publisher, impressions, revenue, rpm });
  });
  return { rows, errors };
}

// ── Tooltip objašnjenja metrika ──────────────────────────────────────

const METRIC_TIPS: Record<string, string> = {
  rpm: "RPM (Revenue per Mille) — prihod na 1.000 impresija. Glavna mera koliko inventar vredi.",
  revenue: "Ukupan prihod od svih prodatih impresija u izabranom periodu.",
  impressions: "Broj prikazanih oglasa — jedan učitan i prikazan oglas = 1 impresija.",
  fillRate: "Fill rate — procenat ad requestova koji završe prodatom impresijom. Nizak fill = neprodat inventar.",
  viewability: "Viewability — procenat impresija koje je korisnik stvarno video (min. 50% piksela bar 1s, IAB standard).",
  winRate: "Win rate — koliko često bidder pobedi na aukciji za impresiju.",
  cpm: "Prosečan CPM — cena koju bidder plaća za 1.000 impresija kad pobedi.",
  timeout: "Timeout rate — procenat aukcija u kojima bidder ne stigne da odgovori u auction windowu.",
};

const TIP_FOR_HEADER: Record<string, string> = {
  RPM: METRIC_TIPS.rpm,
  Impresije: METRIC_TIPS.impressions,
  Prihod: METRIC_TIPS.revenue,
  "Fill Rate": METRIC_TIPS.fillRate,
  Viewability: METRIC_TIPS.viewability,
  Win: METRIC_TIPS.winRate,
  CPM: METRIC_TIPS.cpm,
  "T/O": METRIC_TIPS.timeout,
};

// ════════════════════════════════════════════════════════════════════
// UI COMPONENTS
// ════════════════════════════════════════════════════════════════════

const card: React.CSSProperties = {
  background: "linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.015))",
  border: "1px solid rgba(255,255,255,0.09)",
  borderRadius: 18,
  padding: 24,
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)",
};
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#94a3b8", marginBottom: 16 };
const glow = (c: string, strength = 0.45) => `0 0 22px ${c}${Math.round(strength * 255).toString(16).padStart(2, "0")}`;
const AURORA_BG = "radial-gradient(900px circle at 8% -5%, rgba(99,102,241,0.18), transparent 42%), radial-gradient(1000px circle at 100% 0%, rgba(236,72,153,0.12), transparent 45%), radial-gradient(900px circle at 88% 100%, rgba(56,189,248,0.12), transparent 45%), radial-gradient(700px circle at 18% 95%, rgba(139,92,246,0.14), transparent 45%), #060912";

function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 6, verticalAlign: "middle" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <span style={{ fontSize: 9, width: 14, height: 14, borderRadius: "50%", border: "1px solid #4b5563", color: "#6b7280", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "help", lineHeight: 1, fontWeight: 700 }}>?</span>
      {show && (
        <span style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", width: 220, background: "#1e2330", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "8px 10px", fontSize: 11, color: "#cbd5e1", lineHeight: 1.5, zIndex: 50, textTransform: "none", letterSpacing: 0, fontWeight: 400, whiteSpace: "normal", textAlign: "left", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>{text}</span>
      )}
    </span>
  );
}

function PageSkeleton() {
  const sk: React.CSSProperties = { background: "linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.09) 50%, rgba(255,255,255,0.04) 75%)", backgroundSize: "200% 100%", animation: "skeletonShimmer 1.2s linear infinite", borderRadius: 12 };
  return (
    <div>
      <style>{`@keyframes skeletonShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      <div style={{ ...sk, width: 260, height: 28, marginBottom: 10 }} />
      <div style={{ ...sk, width: 180, height: 14, marginBottom: 28 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 }}>
        {[0, 1, 2, 3].map(i => <div key={i} style={{ ...sk, height: 110 }} />)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
        <div style={{ ...sk, height: 250 }} />
        <div style={{ ...sk, height: 250 }} />
      </div>
      <div style={{ ...sk, height: 220 }} />
    </div>
  );
}

function KPICard({ label, value, sub, trend, color, tip, index = 0, numericValue, format }: { label: string; value: string; sub?: string; trend?: number; color?: string; tip?: string; index?: number; numericValue?: number; format?: (n: number) => string }) {
  const isUp = (trend ?? 0) > 0;
  const accent = color || "#a5b4fc";
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.08, ease: "easeOut" }}
      whileHover={{ y: -4, boxShadow: `0 18px 48px rgba(0,0,0,0.5), 0 0 0 1px ${accent}55, inset 0 1px 0 rgba(255,255,255,0.08)` }}
      style={{ position: "relative", background: "linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: "20px 22px", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", boxShadow: "0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)" }}>
      <div style={{ position: "absolute", top: -1, left: 24, right: 24, height: 1, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.6 }} />
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>{label}{tip && <InfoTip text={tip} />}</div>
      <div style={{ fontSize: 27, fontWeight: 800, color: accent, letterSpacing: -0.6, textShadow: glow(accent, 0.35), whiteSpace: "nowrap" }}>{numericValue !== undefined && format ? <CountUp value={numericValue} format={format} /> : value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ marginTop: 8, fontSize: 12, color: isUp ? "#4ade80" : "#f87171", fontWeight: 600 }}>
          {isUp ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}% vs juče
        </div>
      )}
    </motion.div>
  );
}

function GaugeRing({ value, label, color, tip }: { value: number; label: string; color: string; tip?: string }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ position: "relative", width: 110, height: 110, margin: "0 auto" }}>
        <svg width="110" height="110" viewBox="0 0 110 110">
          <circle cx="55" cy="55" r="46" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="9" />
          <circle cx="55" cy="55" r="46" fill="none" stroke={color} strokeWidth="9"
            strokeDasharray={`${(value / 100) * 289} 289`}
            strokeLinecap="round" transform="rotate(-90 55 55)"
            style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color, textShadow: glow(color, 0.4) }}>
          {value}%
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}{tip && <InfoTip text={tip} />}</div>
    </div>
  );
}

const SEVERITY_CFG: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: "#f87171", bg: "rgba(239,68,68,0.1)", label: "KRITIČNO" },
  warning: { color: "#fbbf24", bg: "rgba(251,191,36,0.08)", label: "UPOZORENJE" },
  positive: { color: "#4ade80", bg: "rgba(74,222,128,0.08)", label: "PRILIKA" },
  info: { color: "#7dd3fc", bg: "rgba(125,211,252,0.08)", label: "INFO" },
};

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ color: string; name: string; value: number }>; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1e2330", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", fontSize: 12 }}>
      <div style={{ color: "#94a3b8", marginBottom: 6 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, fontWeight: 600 }}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
};

// ── Heatmap boja po RPM vrednosti: crvena (nizak) → žuta (srednji) → zelena (visok) ──
function heatColor(rpm: number) {
  const t = Math.max(0, Math.min(1, rpm / 0.8)); // 0..1, ~0.8 RPM = puna zelena
  const hue = t * 130; // 0 crveno → 130 zeleno
  return {
    bg: `hsla(${hue}, 72%, 46%, ${0.2 + t * 0.55})`,
    border: `hsla(${hue}, 78%, 55%, 0.45)`,
    text: `hsl(${hue}, 85%, 85%)`,
  };
}

function HeatCell({ rpm, revenue, impressions, date, publisher }: { rpm: number | null; revenue: number | null; impressions: number | null; date: string; publisher: string }) {
  const [hover, setHover] = useState(false);
  if (rpm == null) {
    return <div style={{ height: 36, borderRadius: 7, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }} />;
  }
  const c = heatColor(rpm);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative", height: 36, borderRadius: 7, background: c.bg, border: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "default", transition: "transform 0.12s", transform: hover ? "scale(1.08)" : "scale(1)", boxShadow: hover ? `0 0 14px ${c.border}` : "none", zIndex: hover ? 5 : 1 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: c.text }}>{rpm.toFixed(2)}</span>
      {hover && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", width: 180, background: "#1e2330", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, padding: "10px 12px", zIndex: 50, boxShadow: "0 8px 24px rgba(0,0,0,0.5)", pointerEvents: "none" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f1f5f9", marginBottom: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{publisher}</div>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>{date.split("-").reverse().join(".")}.</div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 3 }}><span>RPM</span><span style={{ color: "#7dd3fc", fontWeight: 600 }}>{fmtRpm(rpm)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8", marginBottom: 3 }}><span>Prihod</span><span style={{ color: "#a5b4fc", fontWeight: 600 }}>{revenue != null ? fmtEur(revenue) : "—"}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}><span>Impresije</span><span>{impressions != null ? fmt(impressions) : "—"}</span></div>
        </div>
      )}
    </div>
  );
}

// ── Count-up animacija (requestAnimationFrame, bez eksternih biblioteka) ──
function CountUp({ value, format, duration = 800 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{format(display)}</>;
}

// ════════════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════════════

export default function RevRadar() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [page, setPage] = useState("overview");
  const [selectedPub, setSelectedPub] = useState<string | null>(null);
  const [navLoading, setNavLoading] = useState(false);
  const [dateRange, setDateRange] = useState<7 | 30 | 90>(30);
  const [pubSearch, setPubSearch] = useState("");
  const [importedData, setImportedData] = useState<Row[] | null>(null);
  const [importPreview, setImportPreview] = useState<{ rows: Row[]; errors: string[]; fileName: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [simRpmBoost, setSimRpmBoost] = useState(0.05);
  const [simImpBoost, setSimImpBoost] = useState(0);
  const [simPublisher, setSimPublisher] = useState("Wireless Media Group");
  const [pubRange, setPubRange] = useState<7 | 30 | 90>(7);
  const [cmpPubs, setCmpPubs] = useState<string[]>(() => PUBLISHERS.slice(0, 2));
  const [cmpRange, setCmpRange] = useState<7 | 30 | 90>(30);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState("");
  const [cmdIndex, setCmdIndex] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  // ── Route protection — bez logina nazad na /login ──
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [authLoading, user, router]);

  // ── Admin Panel — store-backed metadata + dnevni podaci + ad units + poruke ──
  const [pubMeta, setPubMeta] = useState<Record<string, PublisherMeta>>({});
  const [storeData, setStoreData] = useState<Record<string, DailyEntry[]>>({});
  const [storeAdUnits, setStoreAdUnits] = useState<Record<string, AdUnitEntry[]>>({});
  const [storeMessages, setStoreMessages] = useState<Record<string, string>>({});
  useEffect(() => {
    setPubMeta(getPublishers());
    setStoreData(getAllData());
    setStoreAdUnits(getAllAdUnits());
    setStoreMessages(getMessages());
  }, []);

  type ModalState = {
    key: string | null;
    tab: 1 | 2 | 3 | 4;
    meta: PublisherMeta;
    daily: DailyEntry[];
    dailyDraft: DailyEntry;
    adUnits: AdUnitEntry[];
    message: string;
  };
  const [editingModal, setEditingModal] = useState<ModalState | null>(null);

  // ── Učitavanje podataka sa /api/data — samo za admin ──
  const [fetchedData, setFetchedData] = useState<Row[] | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (user?.role !== "admin") return;
    let cancelled = false;
    fetch("/api/data")
      .then(res => {
        if (!res.ok) throw new Error(`Server je vratio HTTP ${res.status}`);
        return res.json();
      })
      .then((rows: Row[]) => {
        if (!cancelled) { setFetchedData(rows); setDataLoading(false); }
      })
      .catch((e: unknown) => {
        if (!cancelled) { setDataError(e instanceof Error ? e.message : "Nepoznata greška"); setDataLoading(false); }
      });
    return () => { cancelled = true; };
  }, [reloadKey, user]);

  const retryLoad = () => { setDataError(null); setDataLoading(true); setReloadKey(k => k + 1); };

  const sourceData = useMemo(() => importedData ?? fetchedData ?? [], [importedData, fetchedData]);
  const sourcePublishers = useMemo(() => [...new Set(sourceData.map(r => r.publisher))], [sourceData]);
  const sortedDates = useMemo(() => [...new Set(sourceData.map(r => r.date))].sort(), [sourceData]);
  const lastDate = sortedDates[sortedDates.length - 1];
  const lastDateLabel = lastDate ? lastDate.split("-").reverse().join(".") + "." : "—";

  const last30 = useMemo(() => {
    const dates = sortedDates.slice(-30);
    return sourceData.filter(r => dates.includes(r.date));
  }, [sourceData, sortedDates]);

  const last7 = useMemo(() => {
    const dates = sortedDates.slice(-7);
    return sourceData.filter(r => dates.includes(r.date));
  }, [sourceData, sortedDates]);

  const lastRange = useMemo(() => {
    const dates = sortedDates.slice(-dateRange);
    return sourceData.filter(r => dates.includes(r.date));
  }, [sourceData, sortedDates, dateRange]);

  const todayData = useMemo(() => sourceData.filter(r => r.date === lastDate), [sourceData, lastDate]);
  const yesterdayData = useMemo(() => sourceData.filter(r => r.date === sortedDates[sortedDates.length - 2]), [sourceData, sortedDates]);

  const todayTotals = useMemo(() => ({
    impressions: todayData.reduce((s, r) => s + r.impressions, 0),
    revenue: todayData.reduce((s, r) => s + r.revenue, 0),
  }), [todayData]);

  const yestTotals = useMemo(() => ({
    impressions: yesterdayData.reduce((s, r) => s + r.impressions, 0),
    revenue: yesterdayData.reduce((s, r) => s + r.revenue, 0),
  }), [yesterdayData]);

  const todayRPM = todayTotals.revenue / (todayTotals.impressions / 1000) || 0;
  const yestRPM = yestTotals.revenue / (yestTotals.impressions / 1000) || 0;
  const activePubs = useMemo(() => new Set(todayData.map(r => r.publisher)).size, [todayData]);

  const rangeTotals = useMemo(() => {
    const impressions = lastRange.reduce((s, r) => s + r.impressions, 0);
    const revenue = lastRange.reduce((s, r) => s + r.revenue, 0);
    return { impressions, revenue, rpm: revenue / (impressions / 1000) || 0 };
  }, [lastRange]);

  const dailyChart = useMemo(() => aggregateByDate(lastRange), [lastRange]);
  const publisherStats = useMemo(() => aggregateByPublisher(last7), [last7]);
  const filteredPubs = useMemo(
    () => publisherStats.filter(p => p.publisher.toLowerCase().includes(pubSearch.trim().toLowerCase())),
    [publisherStats, pubSearch]
  );
  const alerts = useMemo(() => getAlerts(sourceData), [sourceData]);

  // ── Command palette (Ctrl+K) — pretraga publishera sa trenutnim RPM ──
  const rpmByPublisher = useMemo(() => {
    const m: Record<string, number> = {};
    publisherStats.forEach(p => { m[p.publisher] = p.rpm; });
    return m;
  }, [publisherStats]);
  const cmdResults = useMemo(() => {
    const q = cmdQuery.trim().toLowerCase();
    return sourcePublishers
      .filter(p => p.toLowerCase().includes(q))
      .map(p => ({ publisher: p, rpm: rpmByPublisher[p] ?? 0, country: getCountry(p) }));
  }, [cmdQuery, sourcePublishers, rpmByPublisher]);

  // ── Top 3 mrežna insighta (za PDF report) ──
  const networkInsights = useMemo(() => {
    if (!publisherStats.length) return [] as { title: string; detail: string; color: string }[];
    const ins: { title: string; detail: string; color: string }[] = [];
    const top = publisherStats[0];
    ins.push({ title: `Najveci prihod: ${top.publisher}`, detail: `${fmtEur(top.revenue)} u poslednjih 7 dana (RPM ${fmtRpm(top.rpm)}).`, color: "#4ade80" });
    const worst = [...publisherStats].sort((a, b) => a.rpm - b.rpm)[0];
    ins.push({ title: `Najslabiji RPM: ${worst.publisher}`, detail: `RPM ${fmtRpm(worst.rpm)} vs prosek mreze ${fmtRpm(NETWORK_AVG_RPM)} — prostor za optimizaciju floor price-a.`, color: "#f87171" });
    const crit = alerts.find(a => a.type === "critical");
    if (crit) ins.push({ title: `Pad detektovan: ${crit.publisher}`, detail: `${crit.message} (${crit.value}).`, color: "#fbbf24" });
    else ins.push({ title: `Mrezni RPM ${fmtRpm(todayRPM)}`, detail: `Prosek mreze je ${fmtRpm(NETWORK_AVG_RPM)} — ${todayRPM >= NETWORK_AVG_RPM ? "mreza je iznad proseka" : "ima prostora za rast"}.`, color: "#7dd3fc" });
    return ins.slice(0, 3);
  }, [publisherStats, alerts, todayRPM]);

  // Publisher detail data — prati izabrani period (pubRange)
  const pubPeriodRows = useMemo(() => {
    if (!selectedPub) return [];
    const dates = sortedDates.slice(-pubRange);
    return sourceData.filter(r => r.publisher === selectedPub && dates.includes(r.date));
  }, [selectedPub, sourceData, sortedDates, pubRange]);
  const pubDayCount = useMemo(() => new Set(pubPeriodRows.map(r => r.date)).size || pubRange, [pubPeriodRows, pubRange]);
  const pubPeriod = useMemo(() => {
    if (!selectedPub) return null;
    const imp = pubPeriodRows.reduce((s, r) => s + r.impressions, 0);
    const rev = pubPeriodRows.reduce((s, r) => s + r.revenue, 0);
    return { impressions: imp, revenue: rev, rpm: rev / (imp / 1000) || 0 };
  }, [selectedPub, pubPeriodRows]);
  const pubDetail = useMemo(
    () => selectedPub && pubPeriod ? publisherDeepData(selectedPub, { rpm: pubPeriod.rpm, imp: pubPeriod.impressions / pubDayCount }) : null,
    [selectedPub, pubPeriod, pubDayCount]
  );
  const pubHistory = useMemo(() => aggregateByDate(pubPeriodRows), [pubPeriodRows]);
  const pubBaseRpm = selectedPub ? (BASE_RPM[selectedPub] ?? pubPeriod?.rpm ?? NETWORK_AVG_RPM) : NETWORK_AVG_RPM;

  // Health Score 0–100 po publisheru — fill (30%) + viewability (35%) + RPM vs mreža (35%)
  const pubHealth = useMemo(() => {
    if (!pubDetail || !pubPeriod) return null;
    const fill = pubDetail.fillRate;
    const view = pubDetail.viewability;
    const rpmRatio = pubPeriod.rpm / NETWORK_AVG_RPM;
    const rpmScore = Math.max(0, Math.min(100, Math.round(rpmRatio * 65)));
    const score = Math.round(fill * 0.3 + view * 0.35 + rpmScore * 0.35);
    const grade = score >= 80 ? { label: "Odlično", color: "#4ade80" }
      : score >= 60 ? { label: "Dobro", color: "#7dd3fc" }
      : score >= 40 ? { label: "Prosečno", color: "#fbbf24" }
      : { label: "Slabo", color: "#f87171" };
    return { score, fill, view, rpmScore, rpmRatio, grade };
  }, [pubDetail, pubPeriod]);

  const simStats = useMemo(() => {
    const pubData = last30.filter(r => r.publisher === simPublisher);
    const avgDailyImp = pubData.reduce((s, r) => s + r.impressions, 0) / (pubData.length || 1);
    const curRPM = pubData.reduce((s, r) => s + r.rpm, 0) / (pubData.length || 1);
    const newRPM = curRPM + simRpmBoost;
    const newDailyImp = avgDailyImp * (1 + simImpBoost / 100);
    const curMonthly = (avgDailyImp / 1000) * curRPM * 30;
    const newMonthly = (newDailyImp / 1000) * newRPM * 30;
    const rpmGain = (newDailyImp / 1000) * simRpmBoost * 30;
    return { curRPM, newRPM, avgDailyImp, newDailyImp, curMonthly, newMonthly, diff: newMonthly - curMonthly, rpmGain, impGain: newMonthly - curMonthly - rpmGain };
  }, [simPublisher, simRpmBoost, simImpBoost, last30]);

  // ── Comparison — multi-select sajtova + period ──
  const cmpDates = useMemo(() => sortedDates.slice(-cmpRange), [sortedDates, cmpRange]);
  const validCmpPubs = useMemo(() => cmpPubs.filter(p => sourcePublishers.includes(p)), [cmpPubs, sourcePublishers]);

  const toggleCmp = (pub: string) =>
    setCmpPubs(prev => prev.includes(pub) ? prev.filter(p => p !== pub) : prev.length >= 4 ? prev : [...prev, pub]);

  const cmpStats = useMemo(() => validCmpPubs.map(pub => {
    const rows = sourceData.filter(r => r.publisher === pub && cmpDates.includes(r.date));
    const imp = rows.reduce((s, r) => s + r.impressions, 0);
    const rev = rows.reduce((s, r) => s + r.revenue, 0);
    const days = new Set(rows.map(r => r.date)).size || cmpRange;
    return { publisher: pub, impressions: imp, revenue: rev, rpm: rev / (imp / 1000) || 0, avgDailyRev: rev / days, country: getCountry(pub) };
  }), [validCmpPubs, sourceData, cmpDates, cmpRange]);

  const cmpChart = useMemo(() => cmpDates.map(d => {
    const row: Record<string, string | number> = { dateLabel: d.slice(5).replace("-", "/") };
    validCmpPubs.forEach(pub => {
      const r = sourceData.find(x => x.date === d && x.publisher === pub);
      row[pub] = r ? r.revenue : 0;
    });
    return row;
  }), [cmpDates, validCmpPubs, sourceData]);

  // ── Heatmap — grid publisheri × poslednjih 7 dana, ćelija obojena po RPM ──
  const heatmapDays = useMemo(() => sortedDates.slice(-7), [sortedDates]);
  const heatmapRows = useMemo(() => sourcePublishers.map(pub => {
    const cells = heatmapDays.map(d => {
      const r = sourceData.find(x => x.publisher === pub && x.date === d);
      return { date: d, rpm: r?.rpm ?? null, impressions: r?.impressions ?? null, revenue: r?.revenue ?? null };
    });
    const valid = cells.filter(c => c.rpm != null) as { rpm: number }[];
    const avgRpm = valid.length ? valid.reduce((s, c) => s + c.rpm, 0) / valid.length : 0;
    return { publisher: pub, country: getCountry(pub), cells, avgRpm };
  }), [sourcePublishers, heatmapDays, sourceData]);

  const navItems = [
    { id: "overview", label: "Overview", icon: "◈" },
    { id: "publishers", label: "Publishers", icon: "◉" },
    { id: "heatmap", label: "Heatmap", icon: "▦" },
    { id: "comparison", label: "Comparison", icon: "⇄" },
    { id: "alerts", label: "Alerts", icon: "◎" },
    { id: "simulator", label: "Simulator", icon: "⟁" },
    { id: "import", label: "Import Data", icon: "⇪" },
    { id: "admin", label: "Admin Panel", icon: "⚙" },
  ];

  const allAdminPubs = useMemo(() => {
    const set = new Set<string>([...sourcePublishers, ...Object.keys(pubMeta)]);
    return [...set];
  }, [sourcePublishers, pubMeta]);

  const todayStr = lastDate ?? new Date().toISOString().slice(0, 10);
  const emptyDraft = (): DailyEntry => ({ date: todayStr, impressions: 0, revenue: 0, rpm: 0 });

  const openAddPubMeta = () => setEditingModal({
    key: null, tab: 1,
    meta: { name: "", country: "HR", status: "Aktivan", note: "" },
    daily: [], dailyDraft: emptyDraft(), adUnits: [], message: "",
  });
  const openEditPubMeta = (pub: string) => setEditingModal({
    key: pub, tab: 1,
    meta: pubMeta[pub] ?? { name: pub, country: getCountry(pub), status: "Aktivan", note: "" },
    daily: [...(storeData[pub] ?? [])].sort((a, b) => a.date.localeCompare(b.date)),
    dailyDraft: emptyDraft(),
    adUnits: storeAdUnits[pub] ?? [],
    message: storeMessages[pub] ?? "",
  });

  // TAB 2 — dodaj/azuriraj dnevni unos (po datumu)
  const addDailyEntry = () => {
    setEditingModal(m => {
      if (!m) return m;
      const d = m.dailyDraft;
      if (!d.date || d.impressions <= 0) return m;
      const rest = m.daily.filter(x => x.date !== d.date);
      const daily = [...rest, { ...d }].sort((a, b) => a.date.localeCompare(b.date));
      return { ...m, daily, dailyDraft: emptyDraft() };
    });
  };
  const removeDailyEntry = (date: string) =>
    setEditingModal(m => m && { ...m, daily: m.daily.filter(x => x.date !== date) });

  // TAB 3 — ad units CRUD
  const addAdUnit = () =>
    setEditingModal(m => m && { ...m, adUnits: [...m.adUnits, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: "Novi ad unit", impressions: 0, revenue: 0, rpm: 0, fillRate: 0, viewability: 0 }] });
  const updateAdUnit = (id: string, patch: Partial<AdUnitEntry>) =>
    setEditingModal(m => m && { ...m, adUnits: m.adUnits.map(u => u.id === id ? { ...u, ...patch } : u) });
  const removeAdUnit = (id: string) =>
    setEditingModal(m => m && { ...m, adUnits: m.adUnits.filter(u => u.id !== id) });

  const saveEditingModal = () => {
    if (!editingModal) return;
    const finalKey = (editingModal.key ?? editingModal.meta.name).trim();
    if (!finalKey) return;
    const nextMeta = { ...pubMeta, [finalKey]: { ...editingModal.meta, name: finalKey } };
    const nextData = { ...storeData, [finalKey]: editingModal.daily };
    const nextAd = { ...storeAdUnits, [finalKey]: editingModal.adUnits };
    const nextMsg = { ...storeMessages };
    if (editingModal.message.trim()) nextMsg[finalKey] = editingModal.message;
    else delete nextMsg[finalKey];
    setPubMeta(nextMeta); setPublishers(nextMeta);
    setStoreData(nextData); setAllData(nextData);
    setStoreAdUnits(nextAd); setAllAdUnits(nextAd);
    setStoreMessages(nextMsg); setMessages(nextMsg);
    setEditingModal(null);
  };

  const changePage = (id: string, pub: string | null = null) => {
    if (id === page && pub === selectedPub) return;
    setNavLoading(true);
    setSelectedPub(pub);
    setPage(id);
  };

  useEffect(() => {
    if (!navLoading) return;
    const t = setTimeout(() => setNavLoading(false), 400);
    return () => clearTimeout(t);
  }, [navLoading]);

  // Globalni shortcut: Ctrl/Cmd+K otvara/zatvara paletu, ESC zatvara
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdQuery("");
        setCmdIndex(0);
        setCmdOpen(o => !o);
      } else if (e.key === "Escape") {
        setCmdOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openPublisher = (pub: string) => changePage("publisherDetail", pub);

  const handleCsvFile = (file: File) => {
    file.text().then(text => {
      const { rows, errors } = parseLtbaCsv(text);
      setImportPreview({ rows, errors, fileName: file.name });
    });
  };

  const confirmImport = () => {
    if (!importPreview?.rows.length) return;
    const pubs = [...new Set(importPreview.rows.map(r => r.publisher))];
    setImportedData(importPreview.rows);
    setSimPublisher(pubs[0]);
    setCmpPubs(pubs.slice(0, 2));
    setImportPreview(null);
    setPubSearch("");
    changePage("overview");
  };

  const downloadReport = () => {
    if (!selectedPub || !pubDetail || !pubPeriod) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const L: string[] = [];
    L.push(`RevRadar Report,${esc(selectedPub)}`);
    L.push(`Generisano,${lastDate}`);
    L.push(`Period,${pubRange} dana`);
    if (pubHealth) L.push(`Health Score,${pubHealth.score}/100 (${pubHealth.grade.label})`);
    L.push("");
    L.push(`SUMARNO (${pubRange} dana)`);
    L.push("Impresije,Prihod (EUR),RPM (EUR)");
    L.push(`${pubPeriod.impressions},${pubPeriod.revenue.toFixed(2)},${pubPeriod.rpm.toFixed(3)}`);
    L.push("");
    L.push(`DNEVNI PODACI (${pubRange} dana)`);
    L.push("Datum,Impresije,Prihod (EUR),RPM (EUR)");
    pubHistory.forEach(d => L.push(`${d.date},${d.impressions},${d.revenue.toFixed(2)},${d.rpm}`));
    L.push("");
    L.push("AD UNITS");
    L.push("Ad Unit,Impresije,Prihod (EUR),RPM (EUR),Fill Rate %,Viewability %");
    pubDetail.adUnits.forEach(u => L.push([esc(u.name), u.impressions, u.revenue.toFixed(2), u.rpm, u.fillRate, u.viewability].join(",")));
    L.push("");
    L.push("GEOGRAFIJA");
    L.push("Zemlja,Share %,RPM (EUR)");
    pubDetail.geo.forEach(g => L.push(`${esc(g.country)},${g.share},${g.rpm}`));
    L.push("");
    L.push("UREDJAJI");
    L.push("Uredjaj,Share %,RPM (EUR)");
    pubDetail.devices.forEach(d => L.push(`${esc(d.device)},${d.share},${d.rpm}`));
    L.push("");
    L.push("SSP BIDDERS");
    L.push("Bidder,Win Rate %,Avg CPM (EUR),Timeout %");
    pubDetail.bidders.forEach(b => L.push(`${esc(b.bidder)},${b.winRate},${b.avgCpm},${b.timeout}`));
    const blob = new Blob(["\uFEFF" + L.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revradar-${selectedPub.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase()}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── PDF Network Report (jsPDF + html2canvas) ──
  const generatePDF = async () => {
    if (pdfBusy) return;
    const node = pdfRef.current;
    if (!node) return;
    setPdfBusy(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
      ]);
      const canvas = await html2canvas(node, { backgroundColor: "#0b0e16", scale: 2, useCORS: true });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const imgH = (canvas.height * pw) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      // tamna pozadina + slika, sa preljvanjem na više stranica ako je visoka
      pdf.setFillColor(11, 14, 22);
      pdf.rect(0, 0, pw, ph, "F");
      pdf.addImage(img, "PNG", 0, position, pw, imgH);
      heightLeft -= ph;
      while (heightLeft > 0) {
        position -= ph;
        pdf.addPage();
        pdf.setFillColor(11, 14, 22);
        pdf.rect(0, 0, pw, ph, "F");
        pdf.addImage(img, "PNG", 0, position, pw, imgH);
        heightLeft -= ph;
      }
      pdf.save(`revradar-network-report-${lastDate}.pdf`);
    } catch (e) {
      console.error("PDF generisanje nije uspelo:", e);
    } finally {
      setPdfBusy(false);
    }
  };

  // ── Auth gate — bez logina ne renderuj dashboard ──
  if (authLoading || !user) {
    return <div style={{ minHeight: "100vh", background: AURORA_BG }} />;
  }

  // ── Publisher nalog → potpuno odvojen, jednostavan dashboard ──
  if (user.role === "publisher" && user.publisher) {
    return <PublisherDashboard publisherName={user.publisher} onLogout={() => { logout(); router.replace("/login"); }} />;
  }

  // ── Loading / error ekrani dok se podaci učitavaju sa /api/data ──
  if (dataLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: AURORA_BG, fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 48, height: 48, margin: "0 auto 18px", borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#818cf8", animation: "spin 0.8s linear infinite", boxShadow: "0 0 22px rgba(129,140,248,0.5)" }} />
          <div style={{ color: "#94a3b8", fontSize: 14, fontWeight: 500 }}>Učitavanje podataka…</div>
        </div>
      </div>
    );
  }
  if (dataError) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: AURORA_BG, fontFamily: "'Inter',system-ui,sans-serif", padding: 24 }}>
        <div style={{ textAlign: "center", maxWidth: 380 }}>
          <div style={{ fontSize: 34, marginBottom: 12 }}>⚠</div>
          <div style={{ color: "#f1f5f9", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Greška pri učitavanju podataka</div>
          <div style={{ color: "#94a3b8", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>{dataError}</div>
          <button onClick={retryLoad} style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 10, padding: "10px 22px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(99,102,241,0.4)" }}>
            Pokušaj ponovo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", display: "flex", fontFamily: "'Inter',system-ui,sans-serif", color: "#e2e8f0", minHeight: "100vh", background: AURORA_BG }}>
      {/* ── SIDEBAR ── */}
      <div style={{ width: 220, minHeight: "100vh", background: "linear-gradient(180deg, rgba(13,16,26,0.72), rgba(8,11,18,0.78))", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderRight: "1px solid rgba(255,255,255,0.07)", boxShadow: "1px 0 0 rgba(99,102,241,0.08), 24px 0 48px -24px rgba(99,102,241,0.15)", display: "flex", flexDirection: "column", padding: "0 0 24px 0", flexShrink: 0, position: "relative", zIndex: 1 }}>
        <div style={{ padding: "28px 24px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#fff", boxShadow: "0 4px 18px rgba(99,102,241,0.55)" }}>R</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", letterSpacing: -0.3 }}>RevRadar</div>
              <div style={{ fontSize: 10, color: "#4b5563", letterSpacing: 0.5 }}>AD OPS ANALYTICS</div>
            </div>
          </div>
          <span style={{ display: "inline-block", marginTop: 10, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: "#c4b5fd", background: "rgba(139,92,246,0.16)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 99, padding: "3px 10px" }}>ADMIN</span>
        </div>
        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {navItems.map(item => {
            const active = page === item.id || (item.id === "publishers" && page === "publisherDetail");
            return (
              <motion.button
                key={item.id}
                onClick={() => changePage(item.id)}
                whileHover={active ? undefined : { x: 3, backgroundColor: "rgba(99,102,241,0.08)", color: "#a5b4fc" }}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.15 }}
                style={{ position: "relative", width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px 10px 16px", borderRadius: 10, border: active ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent", cursor: "pointer", background: active ? "linear-gradient(90deg, rgba(99,102,241,0.22), rgba(99,102,241,0.06))" : "transparent", color: active ? "#a5b4fc" : "#6b7280", fontSize: 13, fontWeight: active ? 600 : 400, marginBottom: 3, textAlign: "left", boxShadow: active ? "inset 0 0 18px rgba(99,102,241,0.12)" : "none" }}>
                {active && (
                  <motion.span layoutId="navIndicator" transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    style={{ position: "absolute", left: 0, top: 7, bottom: 7, width: 3, borderRadius: 99, background: "linear-gradient(180deg,#6366f1,#8b5cf6)", boxShadow: "0 0 12px rgba(129,140,248,0.9)" }} />
                )}
                <span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}
              </motion.button>
            );
          })}
        </nav>
        <div style={{ padding: "0 16px" }}>
          <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "#6366f1", fontWeight: 700, letterSpacing: 0.8, marginBottom: 4 }}>{importedData ? "IMPORT DATA" : "LIVE DATA"}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>{lastDateLabel}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "#4ade80" }}>{activePubs} publishera aktivno</span>
            </div>
          </div>
          <button onClick={() => { logout(); router.replace("/login"); }} style={{ width: "100%", marginTop: 10, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 14px", color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ⏻ Logout
          </button>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, minHeight: "100vh", padding: "32px 36px", overflowY: "auto", position: "relative", zIndex: 1 }}>
        {navLoading ? <PageSkeleton /> : (
        <motion.div key={page + (selectedPub ?? "")} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>

        {/* ════════ OVERVIEW ════════ */}
        {page === "overview" && (
          <>
            {/* Gradient hero header sa mrežnim statsima */}
            <motion.div
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ position: "relative", overflow: "hidden", background: "linear-gradient(135deg, rgba(99,102,241,0.32) 0%, rgba(139,92,246,0.16) 45%, rgba(56,189,248,0.12) 100%)", border: "1px solid rgba(129,140,248,0.35)", borderRadius: 22, padding: "30px 34px", marginBottom: 28, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", boxShadow: "0 20px 60px rgba(0,0,0,0.45), 0 0 60px rgba(99,102,241,0.18), inset 0 1px 0 rgba(255,255,255,0.1)" }}>
              <div style={{ position: "absolute", top: -90, right: -50, width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle, rgba(139,92,246,0.35) 0%, transparent 70%)", pointerEvents: "none", animation: "auroraDrift 14s ease-in-out infinite" }} />
              <div style={{ position: "absolute", bottom: -100, left: 120, width: 280, height: 280, borderRadius: "50%", background: "radial-gradient(circle, rgba(56,189,248,0.22) 0%, transparent 70%)", pointerEvents: "none", animation: "auroraDrift 18s ease-in-out infinite reverse" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
                <div>
                  <h1 style={{ fontSize: 24, fontWeight: 800, color: "#f1f5f9", margin: 0, letterSpacing: -0.5 }}>Network Overview</h1>
                  <p style={{ color: "#94a3b8", fontSize: 13, margin: "4px 0 0" }}>{lastDateLabel} · {activePubs} publishera aktivno{importedData ? " · importovani podaci" : ""}</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <motion.button
                    onClick={generatePDF}
                    disabled={pdfBusy}
                    whileHover={pdfBusy ? undefined : { scale: 1.03 }}
                    whileTap={pdfBusy ? undefined : { scale: 0.97 }}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 10, padding: "8px 16px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: pdfBusy ? "wait" : "pointer", opacity: pdfBusy ? 0.7 : 1, boxShadow: "0 4px 16px rgba(99,102,241,0.4)" }}>
                    {pdfBusy ? "Generiše…" : "⬇ Generiši PDF"}
                  </motion.button>
                  <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 4 }}>
                    {([7, 30, 90] as const).map(r => (
                      <button key={r} onClick={() => setDateRange(r)} style={{ border: "none", cursor: "pointer", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, background: dateRange === r ? "rgba(99,102,241,0.5)" : "transparent", color: dateRange === r ? "#e0e7ff" : "#6b7280", transition: "background 0.15s, color 0.15s" }}>
                        {r}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 36, flexWrap: "wrap", position: "relative" }}>
                {[
                  { label: `Prihod ${dateRange}d`, value: fmtEur(rangeTotals.revenue), tip: METRIC_TIPS.revenue, c: "#c7d2fe" },
                  { label: `Impresije ${dateRange}d`, value: fmt(rangeTotals.impressions), tip: METRIC_TIPS.impressions, c: "#f5f3ff" },
                  { label: "Prosečan RPM", value: fmtRpm(rangeTotals.rpm), tip: METRIC_TIPS.rpm, c: "#7dd3fc" },
                  { label: "Publisheri", value: String(sourcePublishers.length), c: "#f5f3ff" },
                ].map(s => (
                  <div key={s.label}>
                    <div style={{ fontSize: 10, color: "#a5b4fc", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontWeight: 700 }}>{s.label}{s.tip && <InfoTip text={s.tip} />}</div>
                    <div style={{ fontSize: 26, fontWeight: 800, color: s.c, letterSpacing: -0.5, textShadow: glow(s.c, 0.4) }}>{s.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 32 }}>
              <KPICard index={0} label="Ukupan Prihod" value={fmtEur(todayTotals.revenue)} numericValue={todayTotals.revenue} format={fmtEur} sub="danas" trend={((todayTotals.revenue - yestTotals.revenue) / yestTotals.revenue) * 100} color="#a5b4fc" tip={METRIC_TIPS.revenue} />
              <KPICard index={1} label="Impresije" value={fmt(todayTotals.impressions)} numericValue={todayTotals.impressions} format={fmt} sub="danas" trend={((todayTotals.impressions - yestTotals.impressions) / yestTotals.impressions) * 100} tip={METRIC_TIPS.impressions} />
              <KPICard index={2} label="Mrežni RPM" value={fmtRpm(todayRPM)} numericValue={todayRPM} format={fmtRpm} sub="prosek" trend={((todayRPM - yestRPM) / yestRPM) * 100} color="#7dd3fc" tip={METRIC_TIPS.rpm} />
              <KPICard index={3} label="Aktivni Publisheri" value={String(activePubs)} numericValue={activePubs} format={(n) => String(Math.round(n))} sub="danas aktivni" color="#86efac" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20, marginBottom: 20 }}>
              <div style={card}>
                <div style={sectionTitle}>Prihod — poslednjih {dateRange} dana</div>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={dailyChart}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="dateLabel" tick={{ fill: "#4b5563", fontSize: 10 }} interval={6} />
                    <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} tickFormatter={(v: number) => "€" + v.toFixed(0)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" stroke="#818cf8" strokeWidth={2} fill="url(#revGrad)" name="Prihod €" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div style={card}>
                <div style={sectionTitle}>RPM trend — {dateRange}d<InfoTip text={METRIC_TIPS.rpm} /></div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dailyChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="dateLabel" tick={{ fill: "#4b5563", fontSize: 10 }} interval={6} />
                    <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} tickFormatter={(v: number) => "€" + v.toFixed(2)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="rpm" stroke="#7dd3fc" strokeWidth={2} dot={false} name="RPM €" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div style={card}>
              <div style={sectionTitle}>Top publisheri — poslednjih 7 dana · klikni za detalje</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Publisher", "Impresije", "Prihod", "RPM"].map(h => (
                      <th key={h} style={{ textAlign: h === "Publisher" ? "left" : "right", padding: "0 12px 10px", fontSize: 11, color: "#4b5563", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {publisherStats.slice(0, 5).map(p => (
                    <tr key={p.publisher} onClick={() => openPublisher(p.publisher)} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}>
                      <td style={{ padding: "10px 12px", fontSize: 13 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 6, height: 6, borderRadius: "50%", background: COUNTRY_COLOR[p.country], display: "inline-block" }} />
                          <span style={{ color: "#a5b4fc", textDecoration: "underline", textUnderlineOffset: 3 }}>{p.publisher}</span>
                        </span>
                      </td>
                      <td style={{ textAlign: "right", padding: "10px 12px", fontSize: 13, color: "#94a3b8" }}>{fmt(p.impressions)}</td>
                      <td style={{ textAlign: "right", padding: "10px 12px", fontSize: 13, fontWeight: 600, color: "#a5b4fc" }}>{fmtEur(p.revenue)}</td>
                      <td style={{ textAlign: "right", padding: "10px 12px", fontSize: 13, color: p.rpm > 0.5 ? "#4ade80" : p.rpm > 0.3 ? "#fbbf24" : "#f87171" }}>{fmtRpm(p.rpm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ════════ PUBLISHERS LIST ════════ */}
        {page === "publishers" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 28, gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Publishers</h1>
                <p style={{ color: "#4b5563", fontSize: 13, margin: "4px 0 0" }}>Poslednjih 7 dana · klikni na publishera za punu analitiku</p>
              </div>
              <input
                value={pubSearch}
                onChange={e => setPubSearch(e.target.value)}
                placeholder="🔍  Pretraži publishere…"
                style={{ width: 260, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, outline: "none" }}
              />
            </div>
            <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 24 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["#", "Publisher", "Zemlja", "Impresije", "Prihod", "RPM", "Status"].map(h => (
                      <th key={h} style={{ textAlign: h === "Publisher" || h === "#" || h === "Zemlja" ? "left" : "right", padding: "14px 16px", fontSize: 11, color: "#4b5563", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}{TIP_FOR_HEADER[h] && <InfoTip text={TIP_FOR_HEADER[h]} />}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredPubs.length === 0 && (
                    <tr><td colSpan={7} style={{ padding: "32px 16px", textAlign: "center", fontSize: 13, color: "#4b5563" }}>Nema publishera za „{pubSearch}&rdquo;</td></tr>
                  )}
                  {filteredPubs.map((p, i) => {
                    const status = p.rpm > 0.5 ? "Odlično" : p.rpm > 0.3 ? "Stabilno" : p.rpm > 0.2 ? "Prati" : "Kritično";
                    const sc = ({ "Odlično": "#4ade80", "Stabilno": "#7dd3fc", "Prati": "#fbbf24", "Kritično": "#f87171" } as Record<string, string>)[status];
                    return (
                      <tr key={p.publisher} onClick={() => openPublisher(p.publisher)} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", cursor: "pointer" }}>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#374151" }}>{String(i + 1).padStart(2, "0")}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 500, color: "#a5b4fc" }}>{p.publisher} →</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: `${COUNTRY_COLOR[p.country]}22`, color: COUNTRY_COLOR[p.country], fontWeight: 700 }}>{p.country}</span>
                        </td>
                        <td style={{ textAlign: "right", padding: "12px 16px", fontSize: 13, color: "#94a3b8" }}>{fmt(p.impressions)}</td>
                        <td style={{ textAlign: "right", padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#a5b4fc" }}>{fmtEur(p.revenue)}</td>
                        <td style={{ textAlign: "right", padding: "12px 16px", fontSize: 13, fontWeight: 600, color: sc }}>{fmtRpm(p.rpm)}</td>
                        <td style={{ textAlign: "right", padding: "12px 16px" }}>
                          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: `${sc}18`, color: sc, fontWeight: 600, border: `1px solid ${sc}40` }}>{status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={card}>
              <div style={sectionTitle}>Prihod po publisheru — poslednjih 7 dana</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={filteredPubs} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                  <XAxis type="number" tick={{ fill: "#4b5563", fontSize: 10 }} tickFormatter={(v: number) => "€" + v.toFixed(0)} />
                  <YAxis type="category" dataKey="publisher" tick={{ fill: "#94a3b8", fontSize: 11 }} width={170} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" fill="#818cf8" radius={[0, 4, 4, 0]} name="Prihod €" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* ════════ HEATMAP ════════ */}
        {page === "heatmap" && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Network Heatmap</h1>
              <p style={{ color: "#4b5563", fontSize: 13, margin: "4px 0 0" }}>RPM po publisheru × poslednjih 7 dana · hover za detalje · klik na ime → detalji</p>
            </div>
            <div style={card}>
              {/* header sa datumima */}
              <div style={{ display: "grid", gridTemplateColumns: "190px repeat(7, 1fr)", gap: 8, marginBottom: 10 }}>
                <div />
                {heatmapDays.map(d => (
                  <div key={d} style={{ textAlign: "center", fontSize: 10, color: "#6b7280", fontWeight: 600, letterSpacing: 0.5 }}>
                    {d.slice(5).replace("-", "/")}
                  </div>
                ))}
              </div>
              {/* redovi */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {heatmapRows.map(row => (
                  <div key={row.publisher} style={{ display: "grid", gridTemplateColumns: "190px repeat(7, 1fr)", gap: 8, alignItems: "center" }}>
                    <button onClick={() => openPublisher(row.publisher)} style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", overflow: "hidden" }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: COUNTRY_COLOR[row.country], flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 500, color: "#a5b4fc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{row.publisher}</span>
                    </button>
                    {row.cells.map(c => (
                      <HeatCell key={c.date} rpm={c.rpm} revenue={c.revenue} impressions={c.impressions} date={c.date} publisher={row.publisher} />
                    ))}
                  </div>
                ))}
              </div>
              {/* legenda */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 11, color: "#6b7280" }}>Nizak RPM</span>
                <div style={{ flex: 1, maxWidth: 280, height: 8, borderRadius: 99, background: "linear-gradient(90deg, hsl(0,72%,46%), hsl(65,72%,46%), hsl(130,72%,46%))" }} />
                <span style={{ fontSize: 11, color: "#6b7280" }}>Visok RPM</span>
                <span style={{ fontSize: 11, color: "#4b5563", marginLeft: "auto" }}>broj u ćeliji = RPM (€)</span>
              </div>
            </div>
          </>
        )}

        {/* ════════ COMPARISON ════════ */}
        {page === "comparison" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Comparison</h1>
                <p style={{ color: "#4b5563", fontSize: 13, margin: "4px 0 0" }}>Izaberi 2–4 sajta i period · razlike u odnosu na prvi izabrani</p>
              </div>
              <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 4 }}>
                {([7, 30, 90] as const).map(r => (
                  <button key={r} onClick={() => setCmpRange(r)} style={{ border: "none", cursor: "pointer", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, background: cmpRange === r ? "rgba(99,102,241,0.5)" : "transparent", color: cmpRange === r ? "#e0e7ff" : "#6b7280" }}>
                    {r}d
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-select čipovi */}
            <div style={{ ...card, marginBottom: 20 }}>
              <div style={{ ...sectionTitle, marginBottom: 12 }}>Sajtovi <span style={{ color: "#4b5563", fontWeight: 400 }}>· {validCmpPubs.length}/4 izabrano</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {sourcePublishers.map(pub => {
                  const on = validCmpPubs.includes(pub);
                  const ci = validCmpPubs.indexOf(pub);
                  const full = !on && validCmpPubs.length >= 4;
                  return (
                    <button key={pub} onClick={() => toggleCmp(pub)} disabled={full}
                      style={{ display: "flex", alignItems: "center", gap: 7, borderRadius: 99, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: full ? "not-allowed" : "pointer",
                        background: on ? `${CMP_COLORS[ci]}22` : "rgba(255,255,255,0.04)",
                        border: `1px solid ${on ? CMP_COLORS[ci] : "rgba(255,255,255,0.1)"}`,
                        color: on ? CMP_COLORS[ci] : full ? "#374151" : "#94a3b8", opacity: full ? 0.5 : 1 }}>
                      {on && <span style={{ width: 8, height: 8, borderRadius: "50%", background: CMP_COLORS[ci] }} />}
                      {pub}
                    </button>
                  );
                })}
              </div>
            </div>

            {validCmpPubs.length < 2 ? (
              <div style={{ ...card, textAlign: "center", padding: "60px 0", color: "#4b5563" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⇄</div>
                <div>Izaberi bar 2 sajta da vidiš poređenje</div>
              </div>
            ) : (
              <>
                {/* KPI mini kartice po sajtu */}
                <div style={{ display: "grid", gridTemplateColumns: `repeat(${cmpStats.length},1fr)`, gap: 16, marginBottom: 20 }}>
                  {cmpStats.map((s, i) => {
                    const base = cmpStats[0];
                    const revDiff = i === 0 ? 0 : ((s.revenue - base.revenue) / (base.revenue || 1)) * 100;
                    return (
                      <motion.div key={s.publisher} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: i * 0.07 }}
                        style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${CMP_COLORS[i]}40`, borderRadius: 16, padding: "18px 20px", borderTop: `3px solid ${CMP_COLORS[i]}` }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: CMP_COLORS[i], marginBottom: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.publisher}{i === 0 && <span style={{ color: "#4b5563", fontWeight: 400 }}> · baseline</span>}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: "#f1f5f9", letterSpacing: -0.5 }}>{fmtEur(s.revenue)}</div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 10 }}>prihod / {cmpRange}d</div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8" }}><span>Impresije</span><span>{fmt(s.impressions)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8", marginTop: 4 }}><span>RPM</span><span style={{ color: "#7dd3fc" }}>{fmtRpm(s.rpm)}</span></div>
                        {i > 0 && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 12, fontWeight: 600, color: revDiff >= 0 ? "#4ade80" : "#f87171" }}>
                            {revDiff >= 0 ? "▲" : "▼"} {Math.abs(revDiff).toFixed(0)}% prihoda vs baseline
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                {/* Tabela razlika */}
                <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 20 }}>
                  <div style={{ ...sectionTitle, padding: "20px 24px 0" }}>Razlike vs baseline ({cmpStats[0].publisher})</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                        {["Sajt", "Impresije", "Prihod", "RPM", "Ø Dnevni Prihod", "Δ Prihod", "Δ RPM"].map(h => (
                          <th key={h} style={{ textAlign: h === "Sajt" ? "left" : "right", padding: "12px 20px", fontSize: 11, color: "#4b5563", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}{TIP_FOR_HEADER[h] && <InfoTip text={TIP_FOR_HEADER[h]} />}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {cmpStats.map((s, i) => {
                        const base = cmpStats[0];
                        const revDiff = i === 0 ? 0 : ((s.revenue - base.revenue) / (base.revenue || 1)) * 100;
                        const rpmDiff = i === 0 ? 0 : ((s.rpm - base.rpm) / (base.rpm || 1)) * 100;
                        return (
                          <tr key={s.publisher} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "12px 20px", fontSize: 13, fontWeight: 600 }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                <span style={{ width: 8, height: 8, borderRadius: "50%", background: CMP_COLORS[i] }} />{s.publisher}
                              </span>
                            </td>
                            <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: "#94a3b8" }}>{fmt(s.impressions)}</td>
                            <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, fontWeight: 600, color: "#a5b4fc" }}>{fmtEur(s.revenue)}</td>
                            <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: "#7dd3fc" }}>{fmtRpm(s.rpm)}</td>
                            <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: "#94a3b8" }}>{fmtEur(s.avgDailyRev)}</td>
                            <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, fontWeight: 600, color: i === 0 ? "#4b5563" : revDiff >= 0 ? "#4ade80" : "#f87171" }}>{i === 0 ? "—" : `${revDiff >= 0 ? "+" : ""}${revDiff.toFixed(0)}%`}</td>
                            <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, fontWeight: 600, color: i === 0 ? "#4b5563" : rpmDiff >= 0 ? "#4ade80" : "#f87171" }}>{i === 0 ? "—" : `${rpmDiff >= 0 ? "+" : ""}${rpmDiff.toFixed(0)}%`}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Grafikoni */}
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
                  <div style={card}>
                    <div style={sectionTitle}>Dnevni prihod — {cmpRange} dana</div>
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={cmpChart}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="dateLabel" tick={{ fill: "#4b5563", fontSize: 10 }} interval={cmpRange === 7 ? 0 : cmpRange === 30 ? 6 : 13} />
                        <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} tickFormatter={(v: number) => "€" + v.toFixed(0)} />
                        <Tooltip content={<CustomTooltip />} />
                        {validCmpPubs.map((pub, i) => (
                          <Line key={pub} type="monotone" dataKey={pub} stroke={CMP_COLORS[i]} strokeWidth={2} dot={false} name={pub} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={card}>
                    <div style={sectionTitle}>RPM poređenje<InfoTip text={METRIC_TIPS.rpm} /></div>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={cmpStats} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#4b5563", fontSize: 10 }} tickFormatter={(v: number) => "€" + v.toFixed(2)} />
                        <YAxis type="category" dataKey="publisher" tick={{ fill: "#94a3b8", fontSize: 10 }} width={110} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="rpm" radius={[0, 4, 4, 0]} name="RPM €">
                          {cmpStats.map((_, i) => <Cell key={i} fill={CMP_COLORS[i]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {/* ════════ PUBLISHER DETAIL — puna analitika ════════ */}
        {page === "publisherDetail" && selectedPub && pubDetail && pubPeriod && pubHealth && (
          <>
            {/* Header sa back dugmetom */}
            <div style={{ marginBottom: 24 }}>
              <button onClick={() => changePage("publishers")} style={{ background: "none", border: "none", color: "#6b7280", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}>
                ← Nazad na Publishers
              </button>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: `${COUNTRY_COLOR[getCountry(selectedPub)]}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: COUNTRY_COLOR[getCountry(selectedPub)] }}>
                    {selectedPub.replace(/^\[..\]\s*/, "").charAt(0)}
                  </div>
                  <div>
                    <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>{selectedPub}</h1>
                    <p style={{ color: "#4b5563", fontSize: 13, margin: "2px 0 0" }}>Puna analitika · poslednjih {pubRange} dana</p>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", gap: 4, background: "rgba(0,0,0,0.25)", borderRadius: 10, padding: 4 }}>
                    {([7, 30, 90] as const).map(r => (
                      <button key={r} onClick={() => setPubRange(r)} style={{ border: "none", cursor: "pointer", borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, background: pubRange === r ? "rgba(99,102,241,0.5)" : "transparent", color: pubRange === r ? "#e0e7ff" : "#6b7280" }}>
                        {r}d
                      </button>
                    ))}
                  </div>
                  <motion.button
                    onClick={downloadReport}
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 10, padding: "10px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}>
                    ⬇ Download Report (CSV)
                  </motion.button>
                </div>
              </div>
            </div>

            {/* KPI red */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 24 }}>
              <KPICard index={0} label={`Prihod ${pubRange}d`} value={fmtEur(pubPeriod.revenue)} numericValue={pubPeriod.revenue} format={fmtEur} color="#a5b4fc" tip={METRIC_TIPS.revenue} />
              <KPICard index={1} label={`Impresije ${pubRange}d`} value={fmt(pubPeriod.impressions)} numericValue={pubPeriod.impressions} format={fmt} tip={METRIC_TIPS.impressions} />
              <KPICard index={2} label="RPM" value={fmtRpm(pubPeriod.rpm)} numericValue={pubPeriod.rpm} format={fmtRpm} sub={`mreža: ${fmtRpm(NETWORK_AVG_RPM)}`} color={pubPeriod.rpm >= NETWORK_AVG_RPM ? "#4ade80" : "#f87171"} tip={METRIC_TIPS.rpm} />
              <KPICard index={3} label="vs Mreža" value={`${pubPeriod.rpm >= NETWORK_AVG_RPM ? "+" : ""}${(((pubPeriod.rpm - NETWORK_AVG_RPM) / NETWORK_AVG_RPM) * 100).toFixed(0)}%`} color={pubPeriod.rpm >= NETWORK_AVG_RPM ? "#4ade80" : "#f87171"} />
            </div>

            {/* Health Score 0–100 + komponente */}
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr 2fr", gap: 20, marginBottom: 24 }}>
              <div style={{ ...card, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minWidth: 200 }}>
                <div style={{ ...sectionTitle, alignSelf: "stretch" }}>Health Score<InfoTip text="Ukupna ocena publishera 0–100: fill rate (30%) + viewability (35%) + RPM vs prosek mreže (35%)." /></div>
                <div style={{ position: "relative", width: 150, height: 150 }}>
                  <svg width="150" height="150" viewBox="0 0 150 150">
                    <circle cx="75" cy="75" r="64" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" />
                    <motion.circle cx="75" cy="75" r="64" fill="none" stroke={pubHealth.grade.color} strokeWidth="12"
                      strokeLinecap="round" transform="rotate(-90 75 75)"
                      style={{ filter: `drop-shadow(0 0 8px ${pubHealth.grade.color})` }}
                      initial={{ strokeDasharray: "0 402" }}
                      animate={{ strokeDasharray: `${(pubHealth.score / 100) * 402} 402` }}
                      transition={{ duration: 0.8, ease: "easeOut" }} />
                  </svg>
                  <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ fontSize: 40, fontWeight: 900, color: pubHealth.grade.color, lineHeight: 1, textShadow: glow(pubHealth.grade.color, 0.5) }}>{pubHealth.score}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>/ 100</div>
                  </div>
                </div>
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: pubHealth.grade.color, padding: "4px 14px", borderRadius: 99, border: `1px solid ${pubHealth.grade.color}50`, background: `${pubHealth.grade.color}14` }}>{pubHealth.grade.label}</div>
              </div>
              <div style={card}>
                <div style={sectionTitle}>Komponente skora</div>
                <div style={{ display: "flex", gap: 12, paddingTop: 8 }}>
                  <GaugeRing value={pubDetail.fillRate} label="Fill Rate" tip={METRIC_TIPS.fillRate} color={pubDetail.fillRate > 75 ? "#4ade80" : pubDetail.fillRate > 60 ? "#fbbf24" : "#f87171"} />
                  <GaugeRing value={pubDetail.viewability} label="Viewability" tip={METRIC_TIPS.viewability} color={pubDetail.viewability > 70 ? "#4ade80" : pubDetail.viewability > 55 ? "#fbbf24" : "#f87171"} />
                  <GaugeRing value={pubHealth.rpmScore} label="RPM Index" tip="RPM publishera u odnosu na prosek mreže, normalizovan na 0–100 (100 ≈ 1.5× prosek)." color={pubHealth.rpmScore > 75 ? "#4ade80" : pubHealth.rpmScore > 50 ? "#fbbf24" : "#f87171"} />
                </div>
              </div>
              <div style={card}>
                <div style={sectionTitle}>Prihod i RPM — {pubRange} dana</div>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={pubHistory}>
                    <defs>
                      <linearGradient id="pubGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#818cf8" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#818cf8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="dateLabel" tick={{ fill: "#4b5563", fontSize: 10 }} interval={pubRange === 7 ? 0 : pubRange === 30 ? 6 : 13} />
                    <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} tickFormatter={(v: number) => "€" + v.toFixed(0)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="revenue" stroke="#818cf8" strokeWidth={2} fill="url(#pubGrad)" name="Prihod €" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Insights — automatske preporuke */}
            <div style={{ ...card, marginBottom: 24 }}>
              <div style={sectionTitle}>⚡ Automatski Insights & Preporuke</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {pubDetail.insights.map((ins, i) => {
                  const cfg = SEVERITY_CFG[ins.severity];
                  return (
                    <div key={i} style={{ background: cfg.bg, border: `1px solid ${cfg.color}30`, borderRadius: 12, padding: "16px 20px", borderLeft: `3px solid ${cfg.color}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: 0.8, padding: "2px 8px", borderRadius: 99, border: `1px solid ${cfg.color}50` }}>{cfg.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "#f1f5f9" }}>{ins.title}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 8, lineHeight: 1.5 }}>{ins.detail}</div>
                      <div style={{ fontSize: 13, color: cfg.color, fontWeight: 500 }}>→ {ins.action}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Ad Units tabela */}
            <div style={{ ...card, marginBottom: 24, padding: 0, overflow: "hidden" }}>
              <div style={{ ...sectionTitle, padding: "20px 24px 0" }}>Ad Units Performance</div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Ad Unit", "Impresije", "Prihod", "RPM", "Fill Rate", "Viewability"].map(h => (
                      <th key={h} style={{ textAlign: h === "Ad Unit" ? "left" : "right", padding: "10px 20px", fontSize: 11, color: "#4b5563", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}{TIP_FOR_HEADER[h] && <InfoTip text={TIP_FOR_HEADER[h]} />}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pubDetail.adUnits.map(u => (
                    <tr key={u.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "12px 20px", fontSize: 13, fontWeight: 500 }}>{u.name}</td>
                      <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: "#94a3b8" }}>{fmt(u.impressions)}</td>
                      <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, fontWeight: 600, color: "#a5b4fc" }}>{fmtEur(u.revenue)}</td>
                      <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: u.rpm > pubBaseRpm ? "#4ade80" : "#fbbf24" }}>{fmtRpm(u.rpm)}</td>
                      <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: u.fillRate > 75 ? "#4ade80" : u.fillRate > 60 ? "#fbbf24" : "#f87171" }}>{u.fillRate}%</td>
                      <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: u.viewability > 70 ? "#4ade80" : u.viewability > 55 ? "#fbbf24" : "#f87171" }}>{u.viewability}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Geo + Devices */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
              <div style={card}>
                <div style={sectionTitle}>Geografija — RPM po zemlji</div>
                {pubDetail.geo.map((g, i) => (
                  <div key={g.country} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                      <span style={{ color: "#e2e8f0", fontWeight: 500 }}>{g.country} <span style={{ color: "#4b5563" }}>· {g.share}% poseta</span></span>
                      <span style={{ color: g.rpm > pubBaseRpm * 1.5 ? "#4ade80" : "#94a3b8", fontWeight: 600 }}>{fmtRpm(g.rpm)}</span>
                    </div>
                    <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ width: `${g.share}%`, height: "100%", background: PIE_COLORS[i % PIE_COLORS.length], borderRadius: 99 }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={card}>
                <div style={sectionTitle}>Uređaji — share i RPM</div>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie data={pubDetail.devices} dataKey="share" nameKey="device" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3}>
                      {pubDetail.devices.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: "flex", justifyContent: "center", gap: 18, marginTop: 4 }}>
                  {pubDetail.devices.map((d, i) => (
                    <div key={d.device} style={{ fontSize: 11, color: "#94a3b8", display: "flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i], display: "inline-block" }} />
                      {d.device} {d.share}% · {fmtRpm(d.rpm)}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Hourly pattern + SSP bidders */}
            <div style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: 20 }}>
              <div style={card}>
                <div style={sectionTitle}>RPM po satima — kad inventar najviše vredi</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={pubDetail.hourly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="hour" tick={{ fill: "#4b5563", fontSize: 9 }} interval={2} />
                    <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} tickFormatter={(v: number) => "€" + v.toFixed(2)} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="rpm" fill="#7dd3fc" radius={[3, 3, 0, 0]} name="RPM €" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <div style={{ ...sectionTitle, padding: "20px 24px 0" }}>SSP Bidders</div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {["Bidder", "Win", "CPM", "T/O"].map(h => (
                        <th key={h} style={{ textAlign: h === "Bidder" ? "left" : "right", padding: "8px 16px", fontSize: 10, color: "#4b5563", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}{TIP_FOR_HEADER[h] && <InfoTip text={TIP_FOR_HEADER[h]} />}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pubDetail.bidders.map(b => (
                      <tr key={b.bidder} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "9px 16px", fontSize: 12, fontWeight: 500 }}>{b.bidder}</td>
                        <td style={{ textAlign: "right", padding: "9px 16px", fontSize: 12, color: "#a5b4fc", fontWeight: 600 }}>{b.winRate}%</td>
                        <td style={{ textAlign: "right", padding: "9px 16px", fontSize: 12, color: "#94a3b8" }}>€{b.avgCpm}</td>
                        <td style={{ textAlign: "right", padding: "9px 16px", fontSize: 12, color: b.timeout > 9 ? "#f87171" : "#4b5563" }}>{b.timeout}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ════════ ALERTS ════════ */}
        {page === "alerts" && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Alerts & Insights</h1>
              <p style={{ color: "#4b5563", fontSize: 13, margin: "4px 0 0" }}>Automatski detektovane promene · poslednji dan vs prethodni</p>
            </div>
            {alerts.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: "#4b5563" }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
                <div>Sve u redu — nema upozorenja danas</div>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {alerts.map((a, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12, padding: "16px 20px", borderLeft: `3px solid ${a.type === "critical" ? "#ef4444" : a.type === "warning" ? "#fbbf24" : "#4ade80"}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, padding: "2px 8px", borderRadius: 99, color: a.type === "critical" ? "#fca5a5" : a.type === "warning" ? "#fde68a" : "#86efac", border: `1px solid ${a.type === "critical" ? "#ef444460" : a.type === "warning" ? "#fbbf2450" : "#4ade8050"}` }}>
                          {a.type === "critical" ? "KRITIČNO" : a.type === "warning" ? "UPOZORENJE" : "RAST"}
                        </span>
                        <button onClick={() => openPublisher(a.publisher)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#a5b4fc", padding: 0, textDecoration: "underline", textUnderlineOffset: 3 }}>{a.publisher}</button>
                      </div>
                      <div style={{ fontSize: 13, color: "#6b7280" }}>{a.message}</div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: a.type === "positive" ? "#4ade80" : a.type === "critical" ? "#f87171" : "#fbbf24" }}>{a.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ════════ SIMULATOR ════════ */}
        {page === "simulator" && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Revenue Simulator</h1>
              <p style={{ color: "#4b5563", fontSize: 13, margin: "4px 0 0" }}>Prihod = (Impresije / 1000) × RPM — podesi oba parametra</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ ...card, padding: 28 }}>
                <div style={{ ...sectionTitle, marginBottom: 24 }}>Parametri</div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 8 }}>Publisher</label>
                  <select value={simPublisher} onChange={e => setSimPublisher(e.target.value)} style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#e2e8f0", fontSize: 13, outline: "none" }}>
                    {sourcePublishers.map(p => <option key={p} value={p} style={{ background: "#1e2330" }}>{p}</option>)}
                  </select>
                </div>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 8 }}>
                    RPM poboljšanje: <span style={{ color: "#818cf8", fontWeight: 700 }}>+€{simRpmBoost.toFixed(3)}</span>
                  </label>
                  <input type="range" min={0} max={0.3} step={0.01} value={simRpmBoost} onChange={e => setSimRpmBoost(parseFloat(e.target.value))} style={{ width: "100%", accentColor: "#818cf8" }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 8 }}>
                    Rast impresija: <span style={{ color: "#7dd3fc", fontWeight: 700 }}>+{simImpBoost}%</span>
                  </label>
                  <input type="range" min={0} max={100} step={5} value={simImpBoost} onChange={e => setSimImpBoost(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#7dd3fc" }} />
                </div>
                <div style={{ marginTop: 20, padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: 10, fontSize: 12, color: "#6b7280" }}>
                  <div style={{ marginBottom: 4 }}>Prosečne dnevne impresije:</div>
                  <div style={{ color: "#94a3b8", fontWeight: 600 }}>{fmt(Math.round(simStats.avgDailyImp))} → {fmt(Math.round(simStats.newDailyImp))}</div>
                </div>
              </div>
              <div style={{ ...card, padding: 28 }}>
                <div style={{ ...sectionTitle, marginBottom: 24 }}>Projekcija</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                  <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16 }}>
                    <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 6 }}>TRENUTNI RPM</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#94a3b8" }}>{fmtRpm(simStats.curRPM)}</div>
                  </div>
                  <div style={{ background: "rgba(99,102,241,0.08)", borderRadius: 12, padding: 16, border: "1px solid rgba(99,102,241,0.2)" }}>
                    <div style={{ fontSize: 11, color: "#6366f1", marginBottom: 6 }}>NOVI RPM</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#818cf8" }}>{fmtRpm(simStats.newRPM)}</div>
                  </div>
                </div>
                <div style={{ marginBottom: 16, padding: "12px 16px", background: "rgba(255,255,255,0.02)", borderRadius: 10 }}>
                  <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.8 }}>Breakdown gaina</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: "#6b7280" }}>Od RPM poboljšanja:</span>
                    <span style={{ color: "#818cf8", fontWeight: 600 }}>+{fmtEur(simStats.rpmGain)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "#6b7280" }}>Od rasta impresija:</span>
                    <span style={{ color: "#7dd3fc", fontWeight: 600 }}>+{fmtEur(Math.max(0, simStats.impGain))}</span>
                  </div>
                </div>
                <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 12, padding: 20 }}>
                  <div style={{ fontSize: 11, color: "#4ade80", marginBottom: 6, fontWeight: 700 }}>UKUPNI MESEČNI GAIN</div>
                  <div style={{ fontSize: 32, fontWeight: 800, color: "#4ade80", letterSpacing: -1 }}>+{fmtEur(simStats.diff)}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{fmtEur(simStats.curMonthly)} → {fmtEur(simStats.newMonthly)}/mesec</div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ════════ IMPORT DATA ════════ */}
        {page === "import" && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Import Data</h1>
              <p style={{ color: "#4b5563", fontSize: 13, margin: "4px 0 0" }}>Učitaj LTBA CSV izveštaj — kolone: datum, publisher, impressions, revenue, RPM</p>
            </div>

            {importedData && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.25)", borderRadius: 12, padding: "14px 20px", marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: "#86efac" }}>
                  ✓ Importovani podaci su aktivni — {importedData.length} redova, {new Set(importedData.map(r => r.publisher)).size} publishera
                </div>
                <button onClick={() => { setImportedData(null); setSimPublisher("Wireless Media Group"); setCmpPubs(PUBLISHERS.slice(0, 2)); }} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "7px 14px", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>
                  Vrati demo podatke
                </button>
              </div>
            )}

            {!importPreview && (
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleCsvFile(file);
                }}
                style={{ border: `2px dashed ${dragOver ? "#818cf8" : "rgba(255,255,255,0.15)"}`, background: dragOver ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.02)", borderRadius: 20, padding: "64px 32px", textAlign: "center", cursor: "pointer", transition: "border-color 0.2s, background 0.2s" }}>
                <input
                  ref={fileInputRef} type="file" accept=".csv,text/csv" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ""; }}
                />
                <div style={{ fontSize: 40, marginBottom: 16 }}>⇪</div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0", marginBottom: 6 }}>
                  {dragOver ? "Pusti fajl ovde" : "Prevuci CSV fajl ovde"}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>ili klikni da izabereš fajl · LTBA format · UTF-8</div>
              </motion.div>
            )}

            {importPreview && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <div style={{ ...card, marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: "#f1f5f9" }}>📄 {importPreview.fileName}</div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
                        {importPreview.rows.length} validnih redova · {new Set(importPreview.rows.map(r => r.publisher)).size} publishera · {[...new Set(importPreview.rows.map(r => r.date))].sort()[0] ?? "—"} → {[...new Set(importPreview.rows.map(r => r.date))].sort().slice(-1)[0] ?? "—"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setImportPreview(null)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "9px 16px", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>
                        Otkaži
                      </button>
                      <motion.button
                        onClick={confirmImport}
                        disabled={!importPreview.rows.length}
                        whileHover={importPreview.rows.length ? { scale: 1.03 } : undefined}
                        whileTap={importPreview.rows.length ? { scale: 0.97 } : undefined}
                        style={{ background: importPreview.rows.length ? "linear-gradient(135deg,#6366f1,#8b5cf6)" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, padding: "9px 18px", color: importPreview.rows.length ? "#fff" : "#4b5563", fontSize: 13, fontWeight: 600, cursor: importPreview.rows.length ? "pointer" : "not-allowed" }}>
                        Importuj podatke
                      </motion.button>
                    </div>
                  </div>
                  {importPreview.errors.length > 0 && (
                    <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.25)", borderRadius: 10, padding: "12px 16px", marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 6 }}>⚠ {importPreview.errors.length} {importPreview.errors.length === 1 ? "problem" : "problema"} pri parsiranju</div>
                      {importPreview.errors.slice(0, 5).map((err, i) => (
                        <div key={i} style={{ fontSize: 12, color: "#94a3b8" }}>{err}</div>
                      ))}
                      {importPreview.errors.length > 5 && <div style={{ fontSize: 12, color: "#6b7280" }}>… i još {importPreview.errors.length - 5}</div>}
                    </div>
                  )}
                </div>

                {importPreview.rows.length > 0 && (
                  <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                    <div style={{ ...sectionTitle, padding: "20px 24px 0" }}>Preview — prvih 10 redova</div>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                          {["Datum", "Publisher", "Impresije", "Prihod", "RPM"].map(h => (
                            <th key={h} style={{ textAlign: h === "Datum" || h === "Publisher" ? "left" : "right", padding: "10px 20px", fontSize: 11, color: "#4b5563", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.rows.slice(0, 10).map((r, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                            <td style={{ padding: "10px 20px", fontSize: 13, color: "#94a3b8" }}>{r.date}</td>
                            <td style={{ padding: "10px 20px", fontSize: 13, fontWeight: 500 }}>{r.publisher}</td>
                            <td style={{ textAlign: "right", padding: "10px 20px", fontSize: 13, color: "#94a3b8" }}>{fmt(r.impressions)}</td>
                            <td style={{ textAlign: "right", padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#a5b4fc" }}>{fmtEur(r.revenue)}</td>
                            <td style={{ textAlign: "right", padding: "10px 20px", fontSize: 13, color: "#7dd3fc" }}>{fmtRpm(r.rpm)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.rows.length > 10 && (
                      <div style={{ padding: "12px 24px", fontSize: 12, color: "#4b5563" }}>… i još {importPreview.rows.length - 10} redova</div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </>
        )}

        {/* ════════ ADMIN PANEL ════════ */}
        {page === "admin" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24, gap: 16 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Admin Panel</h1>
                <p style={{ color: "#4b5563", fontSize: 13, margin: "4px 0 0" }}>Unesi podatke po publisheru · čuva se lokalno · publisher vidi svoje</p>
              </div>
              <motion.button
                onClick={openAddPubMeta}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 10, padding: "10px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", boxShadow: "0 4px 16px rgba(99,102,241,0.3)" }}>
                + Dodaj publishera
              </motion.button>
            </div>
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Naziv", "Zemlja", "Status", "Dana uneto", "Ad Units", "Poruka", ""].map(h => (
                      <th key={h} style={{ textAlign: h === "Naziv" ? "left" : h === "" ? "center" : "right", padding: "14px 16px", fontSize: 11, color: "#4b5563", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allAdminPubs.map(pub => {
                    const meta = pubMeta[pub];
                    const status = meta?.status ?? "Aktivan";
                    const sc = status === "Aktivan" ? "#4ade80" : status === "Suspendovan" ? "#f87171" : "#6b7280";
                    const dayCount = storeData[pub]?.length ?? 0;
                    const auCount = storeAdUnits[pub]?.length ?? 0;
                    const hasMsg = !!storeMessages[pub]?.trim();
                    const ctry = meta?.country ?? getCountry(pub);
                    return (
                      <tr key={pub} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 500, color: "#a5b4fc" }}>{pub}</td>
                        <td style={{ textAlign: "right", padding: "12px 16px" }}>
                          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: `${COUNTRY_COLOR[ctry] ?? "#6b7280"}22`, color: COUNTRY_COLOR[ctry] ?? "#6b7280", fontWeight: 700 }}>{ctry}</span>
                        </td>
                        <td style={{ textAlign: "right", padding: "12px 16px" }}>
                          <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 99, background: `${sc}18`, color: sc, fontWeight: 600, border: `1px solid ${sc}40` }}>{status}</span>
                        </td>
                        <td style={{ textAlign: "right", padding: "12px 16px", fontSize: 13, color: dayCount ? "#94a3b8" : "#374151" }}>{dayCount || "—"}</td>
                        <td style={{ textAlign: "right", padding: "12px 16px", fontSize: 13, color: auCount ? "#94a3b8" : "#374151" }}>{auCount || "—"}</td>
                        <td style={{ textAlign: "right", padding: "12px 16px", fontSize: 13, color: hasMsg ? "#fbbf24" : "#374151" }}>{hasMsg ? "✉" : "—"}</td>
                        <td style={{ textAlign: "center", padding: "12px 16px" }}>
                          <button onClick={() => openEditPubMeta(pub)} style={{ background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, padding: "5px 12px", color: "#a5b4fc", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        </motion.div>
        )}
      </div>

      {/* ════════ COMMAND PALETTE (Ctrl+K) ════════ */}
      <AnimatePresence>
        {cmdOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setCmdOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(6,9,18,0.7)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "12vh" }}>
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={e => e.stopPropagation()}
              style={{ width: 560, maxWidth: "90vw", background: "linear-gradient(160deg, rgba(30,35,48,0.98), rgba(15,18,26,0.98))", border: "1px solid rgba(129,140,248,0.3)", borderRadius: 16, boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(99,102,241,0.15)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ fontSize: 16, color: "#6b7280" }}>🔍</span>
                <input
                  autoFocus
                  value={cmdQuery}
                  onChange={e => { setCmdQuery(e.target.value); setCmdIndex(0); }}
                  onKeyDown={e => {
                    if (e.key === "ArrowDown") { e.preventDefault(); setCmdIndex(i => Math.min(i + 1, cmdResults.length - 1)); }
                    else if (e.key === "ArrowUp") { e.preventDefault(); setCmdIndex(i => Math.max(i - 1, 0)); }
                    else if (e.key === "Enter") { const r = cmdResults[cmdIndex]; if (r) { openPublisher(r.publisher); setCmdOpen(false); } }
                  }}
                  placeholder="Pretraži publishere…"
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#f1f5f9", fontSize: 15 }}
                />
                <span style={{ fontSize: 10, color: "#4b5563", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5, padding: "2px 6px" }}>ESC</span>
              </div>
              <div style={{ maxHeight: 360, overflowY: "auto", padding: 8 }}>
                {cmdResults.length === 0 && (
                  <div style={{ padding: "24px 12px", textAlign: "center", fontSize: 13, color: "#4b5563" }}>Nema rezultata za „{cmdQuery}&rdquo;</div>
                )}
                {cmdResults.map((r, i) => {
                  const active = i === cmdIndex;
                  const sc = r.rpm > 0.5 ? "#4ade80" : r.rpm > 0.3 ? "#fbbf24" : "#f87171";
                  return (
                    <button key={r.publisher}
                      onMouseEnter={() => setCmdIndex(i)}
                      onClick={() => { openPublisher(r.publisher); setCmdOpen(false); }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "11px 12px", borderRadius: 10, border: "none", cursor: "pointer", background: active ? "rgba(99,102,241,0.18)" : "transparent", textAlign: "left", marginBottom: 2 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: COUNTRY_COLOR[r.country], flexShrink: 0 }} />
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: active ? "#e0e7ff" : "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.publisher}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: sc }}>{fmtRpm(r.rpm)}</span>
                      <span style={{ fontSize: 13, color: "#4b5563" }}>↵</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ ADMIN PANEL — Edit/Add modal ════════ */}
      <AnimatePresence>
        {editingModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setEditingModal(null)}
            style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(6,9,18,0.7)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              onClick={e => e.stopPropagation()}
              style={{ width: 640, maxWidth: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column", background: "linear-gradient(160deg, rgba(30,35,48,0.98), rgba(15,18,26,0.98))", border: "1px solid rgba(129,140,248,0.3)", borderRadius: 16, boxShadow: "0 30px 80px rgba(0,0,0,0.6), 0 0 60px rgba(99,102,241,0.15)" }}>
              {/* Header + tabovi */}
              <div style={{ padding: "24px 28px 0" }}>
                <h2 style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", margin: "0 0 4px" }}>{editingModal.key ?? (editingModal.meta.name || "Novi publisher")}</h2>
                <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 16px" }}>{editingModal.key ? "Uredi podatke publishera" : "Dodaj novog publishera"}</p>
                <div style={{ display: "flex", gap: 4, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {([[1, "Osnovni"], [2, "Dnevni podaci"], [3, "Ad Units"], [4, "Poruka"]] as const).map(([t, label]) => (
                    <button key={t} onClick={() => setEditingModal(m => m && { ...m, tab: t })}
                      style={{ background: "none", border: "none", borderBottom: editingModal.tab === t ? "2px solid #818cf8" : "2px solid transparent", cursor: "pointer", padding: "10px 14px", fontSize: 13, fontWeight: 600, color: editingModal.tab === t ? "#a5b4fc" : "#6b7280", marginBottom: -1 }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Telo taba */}
              <div style={{ padding: "20px 28px", overflowY: "auto", flex: 1 }}>
                {/* TAB 1 — Osnovni podaci */}
                {editingModal.tab === 1 && (
                  <>
                    <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>Naziv publishera</label>
                    <input
                      value={editingModal.meta.name}
                      disabled={!!editingModal.key}
                      onChange={e => setEditingModal(m => m && { ...m, meta: { ...m.meta, name: e.target.value } })}
                      style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none", marginBottom: 14, boxSizing: "border-box", opacity: editingModal.key ? 0.6 : 1 }}
                    />
                    <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>Zemlja</label>
                    <select
                      value={editingModal.meta.country}
                      onChange={e => setEditingModal(m => m && { ...m, meta: { ...m.meta, country: e.target.value } })}
                      style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none", marginBottom: 14 }}>
                      {["HR", "RS", "BA", "ME", "MK"].map(c => <option key={c} value={c} style={{ background: "#1e2330" }}>{c}</option>)}
                    </select>
                    <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>Status</label>
                    <select
                      value={editingModal.meta.status}
                      onChange={e => setEditingModal(m => m && { ...m, meta: { ...m.meta, status: e.target.value as PubStatus } })}
                      style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none", marginBottom: 14 }}>
                      {(["Aktivan", "Neaktivan", "Suspendovan"] as PubStatus[]).map(s => <option key={s} value={s} style={{ background: "#1e2330" }}>{s}</option>)}
                    </select>
                    <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>Napomena (interno)</label>
                    <textarea
                      value={editingModal.meta.note}
                      onChange={e => setEditingModal(m => m && { ...m, meta: { ...m.meta, note: e.target.value } })}
                      rows={3}
                      style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical" }}
                    />
                  </>
                )}

                {/* TAB 2 — Dnevni podaci */}
                {editingModal.tab === 2 && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr auto", gap: 8, alignItems: "end", marginBottom: 16 }}>
                      {([["date", "Datum", "date"], ["impressions", "Impressions", "number"], ["revenue", "Revenue €", "number"], ["rpm", "RPM €", "number"]] as const).map(([field, label, type]) => (
                        <div key={field}>
                          <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 5 }}>{label}</label>
                          <input
                            type={type} step={field === "rpm" ? "0.001" : field === "revenue" ? "0.01" : "1"}
                            value={editingModal.dailyDraft[field]}
                            onChange={e => setEditingModal(m => {
                              if (!m) return m;
                              const raw = field === "date" ? e.target.value : (parseFloat(e.target.value) || 0);
                              const draft = { ...m.dailyDraft, [field]: raw };
                              if (field === "impressions" || field === "revenue") draft.rpm = calcRpm(draft.impressions, draft.revenue);
                              return { ...m, dailyDraft: draft };
                            })}
                            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 12, outline: "none", boxSizing: "border-box" }}
                          />
                        </div>
                      ))}
                      <button onClick={addDailyEntry} style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 8, padding: "9px 14px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ Dodaj</button>
                    </div>
                    {editingModal.daily.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 0", color: "#4b5563", fontSize: 13 }}>Još nema unetih dana</div>
                    ) : (
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                            {["Datum", "Impressions", "Revenue", "RPM", ""].map(h => (
                              <th key={h} style={{ textAlign: h === "Datum" ? "left" : h === "" ? "center" : "right", padding: "8px 10px", fontSize: 10, color: "#4b5563", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...editingModal.daily].sort((a, b) => b.date.localeCompare(a.date)).map(d => (
                            <tr key={d.date} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                              <td style={{ padding: "8px 10px", fontSize: 12, color: "#94a3b8" }}>{d.date}</td>
                              <td style={{ textAlign: "right", padding: "8px 10px", fontSize: 12, color: "#94a3b8" }}>{fmt(d.impressions)}</td>
                              <td style={{ textAlign: "right", padding: "8px 10px", fontSize: 12, color: "#a5b4fc", fontWeight: 600 }}>{fmtEur(d.revenue)}</td>
                              <td style={{ textAlign: "right", padding: "8px 10px", fontSize: 12, color: "#7dd3fc" }}>{fmtRpm(d.rpm)}</td>
                              <td style={{ textAlign: "center", padding: "8px 10px" }}>
                                <button onClick={() => removeDailyEntry(d.date)} style={{ background: "none", border: "none", color: "#f87171", fontSize: 14, cursor: "pointer" }}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                )}

                {/* TAB 3 — Ad Units */}
                {editingModal.tab === 3 && (
                  <>
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
                      <button onClick={addAdUnit} style={{ background: "rgba(99,102,241,0.14)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 8, padding: "7px 14px", color: "#a5b4fc", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Dodaj ad unit</button>
                    </div>
                    {editingModal.adUnits.length === 0 ? (
                      <div style={{ textAlign: "center", padding: "28px 0", color: "#4b5563", fontSize: 13 }}>Još nema ad units</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {editingModal.adUnits.map(u => (
                          <div key={u.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: 12 }}>
                            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                              <input value={u.name} onChange={e => updateAdUnit(u.id, { name: e.target.value })} placeholder="Naziv"
                                style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "8px 10px", color: "#e2e8f0", fontSize: 12, outline: "none" }} />
                              <button onClick={() => removeAdUnit(u.id)} style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "0 12px", color: "#f87171", fontSize: 13, cursor: "pointer" }}>✕</button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
                              {([["impressions", "Impr."], ["revenue", "Rev €"], ["rpm", "RPM €"], ["fillRate", "Fill %"], ["viewability", "View %"]] as const).map(([f, lbl]) => (
                                <div key={f}>
                                  <label style={{ fontSize: 10, color: "#6b7280", display: "block", marginBottom: 4 }}>{lbl}</label>
                                  <input type="number" step={f === "rpm" ? "0.001" : f === "revenue" ? "0.01" : "1"} value={u[f]}
                                    onChange={e => {
                                      const val = parseFloat(e.target.value) || 0;
                                      if (f === "impressions") updateAdUnit(u.id, { impressions: val, rpm: calcRpm(val, u.revenue) });
                                      else if (f === "revenue") updateAdUnit(u.id, { revenue: val, rpm: calcRpm(u.impressions, val) });
                                      else updateAdUnit(u.id, { [f]: val });
                                    }}
                                    style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, padding: "6px 8px", color: "#e2e8f0", fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* TAB 4 — Poruka publisheru */}
                {editingModal.tab === 4 && (
                  <>
                    <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>Poruka publisheru (prikazuje se kao banner na njegovom dashboardu)</label>
                    <textarea
                      value={editingModal.message}
                      onChange={e => setEditingModal(m => m && { ...m, message: e.target.value })}
                      rows={6} placeholder="npr. RPM je opao zbog sezonskog pada — radimo na optimizaciji floor price-a."
                      style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 12px", color: "#e2e8f0", fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", lineHeight: 1.5 }}
                    />
                    {editingModal.message.trim() && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>Ostavi prazno da ukloniš poruku.</div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 28px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <button onClick={() => setEditingModal(null)} style={{ background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, padding: "9px 16px", color: "#94a3b8", fontSize: 13, cursor: "pointer" }}>
                  Otkaži
                </button>
                <motion.button
                  onClick={saveEditingModal}
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 8, padding: "9px 18px", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Sačuvaj sve
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ════════ SKRIVENI PDF REPORT (html2canvas izvor) ════════ */}
      <div ref={pdfRef} aria-hidden style={{ position: "fixed", left: -10000, top: 0, width: 820, background: "#0b0e16", color: "#e2e8f0", fontFamily: "Inter, system-ui, sans-serif", padding: 44, boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "2px solid #6366f1", paddingBottom: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: "#fff" }}>R</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9" }}>RevRadar</div>
              <div style={{ fontSize: 11, color: "#818cf8", letterSpacing: 1 }}>AD OPS ANALYTICS</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#cbd5e1" }}>Network Report</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{lastDateLabel}</div>
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Network KPI — danas</div>
        <div style={{ display: "flex", gap: 14, marginBottom: 28 }}>
          {[{ l: "Ukupan Prihod", v: fmtEur(todayTotals.revenue) }, { l: "Impresije", v: fmt(todayTotals.impressions) }, { l: "Mrezni RPM", v: fmtRpm(todayRPM) }, { l: "Aktivni Publisheri", v: String(activePubs) }].map(k => (
            <div key={k.l} style={{ flex: 1, background: "#141828", border: "1px solid #232838", borderRadius: 12, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{k.l}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#a5b4fc" }}>{k.v}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Svi publisheri — poslednjih 7 dana</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 28 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #2a3042" }}>
              {["#", "Publisher", "Zemlja", "Impresije", "Prihod", "RPM"].map(h => (
                <th key={h} style={{ textAlign: h === "Publisher" || h === "#" || h === "Zemlja" ? "left" : "right", padding: "8px 10px", fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {publisherStats.map((p, i) => (
              <tr key={p.publisher} style={{ borderBottom: "1px solid #1a1f2e" }}>
                <td style={{ padding: "8px 10px", fontSize: 11, color: "#4b5563" }}>{String(i + 1).padStart(2, "0")}</td>
                <td style={{ padding: "8px 10px", fontSize: 12, color: "#e2e8f0", fontWeight: 500 }}>{p.publisher}</td>
                <td style={{ padding: "8px 10px", fontSize: 11, color: "#94a3b8" }}>{p.country}</td>
                <td style={{ textAlign: "right", padding: "8px 10px", fontSize: 12, color: "#94a3b8" }}>{fmt(p.impressions)}</td>
                <td style={{ textAlign: "right", padding: "8px 10px", fontSize: 12, color: "#a5b4fc", fontWeight: 600 }}>{fmtEur(p.revenue)}</td>
                <td style={{ textAlign: "right", padding: "8px 10px", fontSize: 12, color: p.rpm > 0.5 ? "#4ade80" : p.rpm > 0.3 ? "#fbbf24" : "#f87171", fontWeight: 600 }}>{fmtRpm(p.rpm)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#818cf8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Top 3 insighta za mrezu</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {networkInsights.map((ins, i) => (
            <div key={i} style={{ background: "#141828", borderLeft: `3px solid ${ins.color}`, borderRadius: 8, padding: "12px 16px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f1f5f9", marginBottom: 4 }}>{ins.title}</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>{ins.detail}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid #232838", fontSize: 10, color: "#4b5563", textAlign: "center" }}>
          Generisano {lastDateLabel} · RevRadar Ad Ops Analytics
        </div>
      </div>
    </div>
  );
}
