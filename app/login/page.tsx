"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";

const AURORA_BG = "radial-gradient(900px circle at 8% -5%, rgba(99,102,241,0.18), transparent 42%), radial-gradient(1000px circle at 100% 0%, rgba(236,72,153,0.12), transparent 45%), radial-gradient(900px circle at 88% 100%, rgba(56,189,248,0.12), transparent 45%), radial-gradient(700px circle at 18% 95%, rgba(139,92,246,0.14), transparent 45%), #060912";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, user, router]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const ok = login(email, password);
    if (!ok) {
      setError("Pogrešan email ili lozinka.");
      return;
    }
    setError("");
    router.replace("/");
  };

  if (loading || user) return null;

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: AURORA_BG, fontFamily: "'Inter',system-ui,sans-serif", padding: 24 }}>
      <motion.div
        initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: "easeOut" }}
        style={{ width: 380, background: "linear-gradient(160deg, rgba(255,255,255,0.07), rgba(255,255,255,0.02))", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 20, padding: "36px 32px", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", boxShadow: "0 20px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, fontWeight: 800, color: "#fff", boxShadow: "0 4px 18px rgba(99,102,241,0.55)" }}>R</div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#f1f5f9", letterSpacing: -0.3 }}>RevRadar</div>
            <div style={{ fontSize: 10, color: "#4b5563", letterSpacing: 0.5 }}>AD OPS ANALYTICS</div>
          </div>
        </div>

        <h1 style={{ fontSize: 19, fontWeight: 700, color: "#f1f5f9", margin: "0 0 6px" }}>Prijava</h1>
        <p style={{ fontSize: 13, color: "#6b7280", margin: "0 0 24px" }}>Uloguj se da pristupiš svom dashboard-u.</p>

        <form onSubmit={handleSubmit}>
          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>Email</label>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            placeholder="ime@revradar.com"
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, outline: "none", marginBottom: 16, boxSizing: "border-box" }}
          />
          <label style={{ fontSize: 12, color: "#6b7280", display: "block", marginBottom: 6 }}>Lozinka</label>
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px 14px", color: "#e2e8f0", fontSize: 13, outline: "none", marginBottom: 16, boxSizing: "border-box" }}
          />
          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#fca5a5", marginBottom: 16 }}>
              {error}
            </div>
          )}
          <motion.button
            type="submit"
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            style={{ width: "100%", background: "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 10, padding: "12px 0", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 18px rgba(99,102,241,0.4)" }}>
            Uloguj se
          </motion.button>
        </form>

        <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,0.06)", fontSize: 11, color: "#4b5563", lineHeight: 1.6 }}>
          Demo: admin@revradar.com / admin2026<br />
          Publisher: wireless@revradar.com / pub2026
        </div>
      </motion.div>
    </div>
  );
}
