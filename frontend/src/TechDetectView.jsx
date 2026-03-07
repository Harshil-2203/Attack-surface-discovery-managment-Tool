// src/TechDetectView.jsx
import { useState, useMemo, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";

const CAT_META = {
  "CMS":                { color: "#60a5fa", bg: "#0a1020", border: "#1e3a5f", icon: "◈" },
  "Frontend Framework": { color: "#4ade80", bg: "#00100a", border: "#1e3a2f", icon: "⬡" },
  "JavaScript Library": { color: "#4ade80", bg: "#00100a", border: "#1e3a2f", icon: "⬡" },
  "CSS Framework":      { color: "#4ade80", bg: "#00100a", border: "#1e3a2f", icon: "⬡" },
  "Web Server":         { color: "#f87171", bg: "#100505", border: "#3b1f1f", icon: "⊞" },
  "CDN/Security":       { color: "#fde047", bg: "#100e00", border: "#2d2a1f", icon: "◎" },
  "CDN":                { color: "#fde047", bg: "#100e00", border: "#2d2a1f", icon: "◎" },
  "Hosting":            { color: "#d8b4fe", bg: "#0e0818", border: "#2d1f3b", icon: "⬢" },
  "Language":           { color: "#67e8f9", bg: "#00101a", border: "#1f2d3b", icon: "{}" },
  "Analytics":          { color: "#fcd34d", bg: "#100c00", border: "#2d2a1f", icon: "◷" },
  "Marketing":          { color: "#f9a8d4", bg: "#180510", border: "#2d1f2d", icon: "✦" },
  "Support":            { color: "#f9a8d4", bg: "#180510", border: "#2d1f2d", icon: "✦" },
  "Security":           { color: "#fca5a5", bg: "#100505", border: "#3b1f1f", icon: "⊛" },
  "Other":              { color: "#6b7280", bg: "#0a0c10", border: "#1f2937", icon: "·" },
};

function TechChip({ name, category }) {
  const m = CAT_META[category] || CAT_META["Other"];
  return (
    <span style={{
      background: m.bg, border: `1px solid ${m.border}`, color: m.color,
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: "monospace",
      display: "inline-flex", alignItems: "center", gap: 4,
    }}>
      <span style={{ fontSize: 8, opacity: 0.7 }}>{m.icon}</span>{name}
    </span>
  );
}

export default function TechDetectView({ subdomains, targetFolder, savedResults, onResultsChange }) {
  const [results, setResults]     = useState(savedResults || null);
  // Sync when savedResults arrives async (restored from disk after mount)
  useEffect(() => { if (savedResults) setResults(savedResults); }, [savedResults]);
  const [loading, setLoading]     = useState(false);
  const [filter, setFilter]       = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [progress, setProgress]   = useState(0);

  const run = async () => {
    if (!subdomains.length) return;
    setLoading(true); setResults(null); setProgress(0);
    const batch = 10; const all = {};
    for (let i = 0; i < subdomains.length; i += batch) {
      try {
        const res = await axios.post(`${API}/recon/techdetect`, { subdomains: subdomains.slice(i, i + batch) });
        Object.assign(all, res.data);
      } catch {}
      setProgress(Math.round(Math.min(((i + batch) / subdomains.length) * 100, 100)));
    }
    setResults(all); onResultsChange?.(all); setLoading(false);
  };

  const allCats = useMemo(() => {
    if (!results) return ["All"];
    return ["All", ...new Set(Object.values(results).flatMap(r => r.technologies?.map(t => t.category) || []))];
  }, [results]);

  const filtered = useMemo(() => {
    if (!results) return [];
    return Object.entries(results).filter(([sub, r]) => {
      if (!r.technologies?.length) return false;
      if (filter && !sub.toLowerCase().includes(filter.toLowerCase())) return false;
      if (catFilter !== "All" && !r.technologies.some(t => t.category === catFilter)) return false;
      return true;
    });
  }, [results, filter, catFilter]);

  // Tech frequency map
  const techFreq = useMemo(() => {
    if (!results) return {};
    const freq = {};
    Object.values(results).forEach(r => r.technologies?.forEach(t => { freq[t.name] = (freq[t.name] || 0) + 1; }));
    return freq;
  }, [results]);
  const topTechs = Object.entries(techFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);

  // Category breakdown
  const catBreak = useMemo(() => {
    if (!results) return {};
    const c = {};
    Object.values(results).forEach(r => r.technologies?.forEach(t => { c[t.category] = (c[t.category] || 0) + 1; }));
    return c;
  }, [results]);

  const totalWithTech = filtered.length;
  const totalTechs = Object.values(techFreq).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Header bar ── */}
      <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: results ? "#22c55e" : "#1f2937", boxShadow: results ? "0 0 8px #22c55e" : "none" }} />
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#4ade80", letterSpacing: "0.15em" }}>TECHNOLOGY DETECTOR</span>
          </div>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>
            {subdomains.length} subdomains · {Object.keys(CAT_META).length - 1} technology categories
          </span>
        </div>
        <button onClick={run} disabled={loading || !subdomains.length} style={{
          padding: "10px 24px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "monospace", fontSize: 12, fontWeight: 700,
          background: loading ? "#0d1117" : "linear-gradient(135deg, #166534, #15803d)",
          border: `1px solid ${loading ? "#1f2937" : "#22c55e55"}`,
          color: loading ? "#374151" : "#fff",
          boxShadow: loading ? "none" : "0 0 20px #22c55e22", transition: "all 0.2s",
        }}>
          {loading ? `SCANNING ${progress}%` : results ? "↺  RE-DETECT" : "▶  RUN DETECTION"}
        </button>
      </div>

      {/* Progress */}
      {loading && (
        <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 8, padding: "10px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>Fingerprinting technologies…</span>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4ade80" }}>{progress}%</span>
          </div>
          <div style={{ height: 3, background: "#0f1923", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #166534, #22c55e)", transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {results && (
        <>
          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {[
              { label: "SUBDOMAINS SCANNED", value: subdomains.length,   color: "#6b7280" },
              { label: "WITH TECHNOLOGY",    value: totalWithTech,        color: "#4ade80" },
              { label: "UNIQUE TECHS",       value: totalTechs,           color: "#60a5fa" },
              { label: "CATEGORIES",         value: Object.keys(catBreak).length, color: "#d8b4fe" },
            ].map(s => (
              <div key={s.label} style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 10, padding: "10px 14px", borderTop: `2px solid ${s.color}` }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Top techs */}
          {topTechs.length > 0 && (
            <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, padding: "14px 18px" }}>
              <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.12em", marginBottom: 10 }}>MOST COMMON TECHNOLOGIES</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {topTechs.map(([name, count]) => {
                  const cat = Object.values(results).find(r => r.technologies?.some(t => t.name === name))?.technologies?.find(t => t.name === name)?.category || "Other";
                  const m = CAT_META[cat] || CAT_META["Other"];
                  return (
                    <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <TechChip name={name} category={cat} />
                      <span style={{ fontFamily: "monospace", fontSize: 9, color: "#1f2937" }}>×{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filters + results */}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter subdomains…"
              style={{ flex: 1, background: "#050507", border: "1px solid #0f1923", borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "#86efac", outline: "none" }}
              onFocus={e => e.target.style.borderColor = "#166534"} onBlur={e => e.target.style.borderColor = "#0f1923"} />
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              style={{ background: "#050507", border: "1px solid #0f1923", borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "#9ca3af", outline: "none" }}>
              {allCats.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Results list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 480, overflowY: "auto" }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 30, fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>No results matching filter</div>
            )}
            {filtered.map(([sub, r], idx) => {
              const techs = catFilter === "All" ? r.technologies : r.technologies.filter(t => t.category === catFilter);
              return (
                <div key={sub} style={{
                  display: "grid", gridTemplateColumns: "1fr auto",
                  alignItems: "center",
                  background: idx % 2 === 0 ? "#08080a" : "#050507",
                  borderLeft: "3px solid #166534",
                  borderBottom: "1px solid #0f1117",
                  padding: "10px 16px 10px 14px",
                  transition: "background 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "#00100a"}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#08080a" : "#050507"}>
                  <div>
                    <a href={`https://${sub}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: "monospace", fontSize: 12, color: "#67e8f9", textDecoration: "none", display: "block", marginBottom: 6 }}
                      onMouseEnter={e => e.target.style.textDecoration = "underline"} onMouseLeave={e => e.target.style.textDecoration = "none"}>
                      {sub}
                    </a>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {techs.map(t => <TechChip key={t.name} name={t.name} category={t.category} />)}
                    </div>
                  </div>
                  {r.status && <span style={{ fontFamily: "monospace", fontSize: 11, color: "#374151", marginLeft: 12 }}>{r.status}</span>}
                </div>
              );
            })}
          </div>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#1f2937", textAlign: "center" }}>{filtered.length} subdomains · {totalTechs} unique technologies detected</p>
        </>
      )}

      {!results && !loading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 60 }}>
          <div style={{ fontFamily: "monospace", fontSize: 48, color: "#0f1923" }}>⚙</div>
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>Click RUN DETECTION to fingerprint {subdomains.length} subdomains</p>
        </div>
      )}
    </div>
  );
}