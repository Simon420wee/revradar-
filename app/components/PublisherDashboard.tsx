"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

type Row = { date: string; publisher: string; impressions: number; revenue: number; rpm: number };

const AURORA_BG = "radial-gradient(900px circle at 8% -5%, rgba(99,102,241,0.18), transparent 42%), radial-gradient(1000px circle at 100% 0%, rgba(236,72,153,0.12), transparent 45%), radial-gradient(900px circle at 88% 100%, rgba(56,189,248,0.12), transparent 45%), radial-gradient(700px circle at 18% 95%, rgba(139,92,246,0.14), transparent 45%), #060912";
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

const fmt = (n: number) => n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(0) + "K" : String(Math.round(n));
const fmtEur = (n: number) => "€" + n.toFixed(2);
const fmtRpm = (n: number) => "€" + n.toFixed(3);

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

// Deterministicki generisani ad units — ista raspodela kao u admin dashboardu (publisherDeepData).
const AD_UNIT_TEMPLATES = [
  { name: "Billboard 970×250", rpmMult: 1.6, share: 0.18 },
  { name: "Leaderboard 728×90", rpmMult: 0.8, share: 0.22 },
  { name: "In-Article 300×250", rpmMult: 1.2, share: 0.28 },
  { name: "Sticky Sidebar 300×600", rpmMult: 1.4, share: 0.15 },
  { name: "Anchor Mobile 320×100", rpmMult: 0.9, share: 0.17 },
];

function buildAdUnits(publisher: string, baseRpm: number, baseImp: number) {
  const pi = publisher.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 97;
  const s = (n: number) => seededRandom(pi * 1000 + n);
  return AD_UNIT_TEMPLATES.map((t, i) => {
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
}

function aggregateByDate(data: Row[]) {
  return [...data].sort((a, b) => a.date.localeCompare(b.date)).map(d => ({
    ...d,
    dateLabel: d.date.slice(5).replace("-", "/"),
  }));
}

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

function KPICard({ label, value, sub, trend, color }: { label: string; value: string; sub?: string; trend?: number; color?: string }) {
  const isUp = (trend ?? 0) > 0;
  const accent = color || "#a5b4fc";
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
      style={{ position: "relative", background: "linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 18, padding: "20px 22px", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", boxShadow: "0 12px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.07)" }}>
      <div style={{ position: "absolute", top: -1, left: 24, right: 24, height: 1, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, opacity: 0.6 }} />
      <div style={{ fontSize: 11, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 27, fontWeight: 800, color: accent, letterSpacing: -0.6, textShadow: glow(accent, 0.35), whiteSpace: "nowrap" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{sub}</div>}
      {trend !== undefined && (
        <div style={{ marginTop: 8, fontSize: 12, color: isUp ? "#4ade80" : "#f87171", fontWeight: 600 }}>
          {isUp ? "▲" : "▼"} {Math.abs(trend).toFixed(1)}% vs juče
        </div>
      )}
    </motion.div>
  );
}

export default function PublisherDashboard({ publisherName, onLogout }: { publisherName: string; onLogout: () => void }) {
  const [page, setPage] = useState<"overview" | "adunits" | "reports">("overview");
  const [data, setData] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/data?publisher=${encodeURIComponent(publisherName)}`)
      .then(res => {
        if (!res.ok) throw new Error(`Server je vratio HTTP ${res.status}`);
        return res.json();
      })
      .then((rows: Row[]) => { if (!cancelled) setData(rows); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Nepoznata greška"); });
    return () => { cancelled = true; };
  }, [publisherName]);

  const sortedDates = useMemo(() => [...new Set((data ?? []).map(r => r.date))].sort(), [data]);
  const lastDate = sortedDates[sortedDates.length - 1];
  const lastDateLabel = lastDate ? lastDate.split("-").reverse().join(".") + "." : "—";

  const last30 = useMemo(() => {
    const dates = sortedDates.slice(-30);
    return (data ?? []).filter(r => dates.includes(r.date));
  }, [data, sortedDates]);
  const last7 = useMemo(() => {
    const dates = sortedDates.slice(-7);
    return (data ?? []).filter(r => dates.includes(r.date));
  }, [data, sortedDates]);

  const today = useMemo(() => (data ?? []).find(r => r.date === lastDate) ?? null, [data, lastDate]);
  const yesterday = useMemo(() => (data ?? []).find(r => r.date === sortedDates[sortedDates.length - 2]) ?? null, [data, sortedDates]);

  const trendRevenue = today && yesterday ? ((today.revenue - yesterday.revenue) / yesterday.revenue) * 100 : undefined;
  const trendImp = today && yesterday ? ((today.impressions - yesterday.impressions) / yesterday.impressions) * 100 : undefined;
  const trendRpm = today && yesterday ? ((today.rpm - yesterday.rpm) / yesterday.rpm) * 100 : undefined;

  const revenueChart = useMemo(() => aggregateByDate(last30), [last30]);
  const last7Sorted = useMemo(() => [...last7].sort((a, b) => b.date.localeCompare(a.date)), [last7]);

  const avgRpm = useMemo(() => last30.length ? last30.reduce((s, r) => s + r.rpm, 0) / last30.length : 0, [last30]);
  const avgImp = useMemo(() => last30.length ? last30.reduce((s, r) => s + r.impressions, 0) / last30.length : 0, [last30]);
  const adUnits = useMemo(() => buildAdUnits(publisherName, avgRpm || 0.3, avgImp || 50000), [publisherName, avgRpm, avgImp]);

  // Izvestaji — grupisano po mesecu
  const months = useMemo(() => {
    const map: Record<string, Row[]> = {};
    (data ?? []).forEach(r => {
      const m = r.date.slice(0, 7);
      if (!map[m]) map[m] = [];
      map[m].push(r);
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).map(([month, rows]) => ({
      month,
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      impressions: rows.reduce((s, r) => s + r.impressions, 0),
    }));
  }, [data]);

  const downloadMonthPdf = async (month: string, rows: { revenue: number; impressions: number }) => {
    setPdfBusy(month);
    try {
      const [{ default: jsPDF }] = await Promise.all([import("jspdf")]);
      const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: "a4" });
      pdf.setFillColor(11, 14, 22);
      pdf.rect(0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), "F");
      pdf.setTextColor(241, 245, 249);
      pdf.setFontSize(18);
      pdf.text("RevRadar — Izveštaj", 40, 50);
      pdf.setFontSize(12);
      pdf.setTextColor(148, 163, 184);
      pdf.text(publisherName, 40, 75);
      pdf.text(`Mesec: ${month}`, 40, 95);
      pdf.setTextColor(165, 180, 252);
      pdf.setFontSize(14);
      pdf.text(`Prihod: ${fmtEur(rows.revenue)}`, 40, 130);
      pdf.text(`Impresije: ${fmt(rows.impressions)}`, 40, 155);
      pdf.save(`revradar-${publisherName.replace(/[^\w]+/g, "-").toLowerCase()}-${month}.pdf`);
    } catch (e) {
      console.error("PDF generisanje nije uspelo:", e);
    } finally {
      setPdfBusy(null);
    }
  };

  const navItems: { id: "overview" | "adunits" | "reports"; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "◈" },
    { id: "adunits", label: "Ad Units", icon: "▦" },
    { id: "reports", label: "Izveštaji", icon: "⬇" },
  ];

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: AURORA_BG, fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ color: "#94a3b8" }}>Greška pri učitavanju podataka: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: AURORA_BG, fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#818cf8", animation: "spin 0.8s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ position: "relative", display: "flex", fontFamily: "'Inter',system-ui,sans-serif", color: "#e2e8f0", minHeight: "100vh", background: AURORA_BG }}>
      {/* SIDEBAR */}
      <div style={{ width: 220, minHeight: "100vh", background: "linear-gradient(180deg, rgba(13,16,26,0.72), rgba(8,11,18,0.78))", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderRight: "1px solid rgba(255,255,255,0.07)", display: "flex", flexDirection: "column", padding: "0 0 24px 0", flexShrink: 0, position: "relative", zIndex: 1 }}>
        <div style={{ padding: "28px 24px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#fff" }}>R</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", letterSpacing: -0.3 }}>RevRadar</div>
              <div style={{ fontSize: 10, color: "#4b5563", letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{publisherName}</div>
            </div>
          </div>
        </div>
        <nav style={{ padding: "16px 12px", flex: 1 }}>
          {navItems.map(item => {
            const active = page === item.id;
            return (
              <button key={item.id} onClick={() => setPage(item.id)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 12px 10px 16px", borderRadius: 10, border: active ? "1px solid rgba(99,102,241,0.25)" : "1px solid transparent", cursor: "pointer", background: active ? "linear-gradient(90deg, rgba(99,102,241,0.22), rgba(99,102,241,0.06))" : "transparent", color: active ? "#a5b4fc" : "#6b7280", fontSize: 13, fontWeight: active ? 600 : 400, marginBottom: 3, textAlign: "left" }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>{item.label}
              </button>
            );
          })}
        </nav>
        <div style={{ padding: "0 16px" }}>
          <button onClick={onLogout} style={{ width: "100%", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 10, padding: "10px 14px", color: "#fca5a5", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            ⏻ Logout
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, minHeight: "100vh", padding: "32px 36px", overflowY: "auto", position: "relative", zIndex: 1 }}>
        {page === "overview" && today && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Overview</h1>
              <p style={{ color: "#4b5563", fontSize: 13, margin: "4px 0 0" }}>{lastDateLabel}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 28 }}>
              <KPICard label="Prihod (danas)" value={fmtEur(today.revenue)} trend={trendRevenue} color="#a5b4fc" />
              <KPICard label="Impresije (danas)" value={fmt(today.impressions)} trend={trendImp} />
              <KPICard label="RPM (danas)" value={fmtRpm(today.rpm)} trend={trendRpm} color="#7dd3fc" />
            </div>
            <div style={{ ...card, marginBottom: 24 }}>
              <div style={sectionTitle}>Prihod — poslednjih 30 dana</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenueChart}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="dateLabel" tick={{ fill: "#4b5563", fontSize: 10 }} interval={4} />
                  <YAxis tick={{ fill: "#4b5563", fontSize: 10 }} tickFormatter={(v: number) => "€" + v.toFixed(0)} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="revenue" stroke="#818cf8" strokeWidth={2} dot={false} name="Prihod €" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <div style={{ ...sectionTitle, padding: "20px 24px 0" }}>Poslednjih 7 dana</div>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Datum", "Impresije", "Prihod", "RPM"].map(h => (
                      <th key={h} style={{ textAlign: h === "Datum" ? "left" : "right", padding: "10px 20px", fontSize: 11, color: "#4b5563", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {last7Sorted.map(r => (
                    <tr key={r.date} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "10px 20px", fontSize: 13, color: "#94a3b8" }}>{r.date.split("-").reverse().join(".")}.</td>
                      <td style={{ textAlign: "right", padding: "10px 20px", fontSize: 13, color: "#94a3b8" }}>{fmt(r.impressions)}</td>
                      <td style={{ textAlign: "right", padding: "10px 20px", fontSize: 13, fontWeight: 600, color: "#a5b4fc" }}>{fmtEur(r.revenue)}</td>
                      <td style={{ textAlign: "right", padding: "10px 20px", fontSize: 13, color: "#7dd3fc" }}>{fmtRpm(r.rpm)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {page === "adunits" && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Ad Units</h1>
              <p style={{ color: "#4b5563", fontSize: 13, margin: "4px 0 0" }}>Performanse po formatu — poslednjih 30 dana</p>
            </div>
            <div style={{ ...card, padding: 0, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {["Naziv", "Impresije", "Prihod", "RPM", "Fill Rate", "Viewability"].map(h => (
                      <th key={h} style={{ textAlign: h === "Naziv" ? "left" : "right", padding: "12px 20px", fontSize: 11, color: "#4b5563", fontWeight: 600, letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {adUnits.map(u => (
                    <tr key={u.name} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "12px 20px", fontSize: 13, fontWeight: 500 }}>{u.name}</td>
                      <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: "#94a3b8" }}>{fmt(u.impressions)}</td>
                      <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, fontWeight: 600, color: "#a5b4fc" }}>{fmtEur(u.revenue)}</td>
                      <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: "#7dd3fc" }}>{fmtRpm(u.rpm)}</td>
                      <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: u.fillRate > 75 ? "#4ade80" : u.fillRate > 60 ? "#fbbf24" : "#f87171" }}>{u.fillRate}%</td>
                      <td style={{ textAlign: "right", padding: "12px 20px", fontSize: 13, color: u.viewability > 70 ? "#4ade80" : u.viewability > 55 ? "#fbbf24" : "#f87171" }}>{u.viewability}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {page === "reports" && (
          <>
            <div style={{ marginBottom: 28 }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Izveštaji</h1>
              <p style={{ color: "#4b5563", fontSize: 13, margin: "4px 0 0" }}>Dostupni izveštaji po mesecima</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {months.map(m => (
                <div key={m.month} style={{ ...card, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9" }}>{m.month}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{fmtEur(m.revenue)} · {fmt(m.impressions)} impresija</div>
                  </div>
                  <motion.button
                    onClick={() => downloadMonthPdf(m.month, m)}
                    disabled={pdfBusy === m.month}
                    whileHover={pdfBusy ? undefined : { scale: 1.03 }}
                    style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 10, padding: "9px 16px", color: "#fff", fontSize: 12, fontWeight: 600, cursor: pdfBusy === m.month ? "wait" : "pointer", opacity: pdfBusy === m.month ? 0.7 : 1 }}>
                    {pdfBusy === m.month ? "Generiše…" : "⬇ Preuzmi PDF"}
                  </motion.button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
