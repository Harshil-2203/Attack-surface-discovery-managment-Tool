// src/JSAnalyzerView.jsx
import { useState, useMemo, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";

const SECRET_RISK = {
  "AWS Access Key": "critical", "AWS Secret": "critical", "Private Key": "critical",
  "GitHub PAT": "critical", "GitHub Token": "critical", "MongoDB URI": "critical",
  "PostgreSQL URI": "critical", "Redis URI": "critical",
  "API Key": "high", "Secret Key": "high", "Password": "high",
  "Stripe Key": "high", "Firebase Key": "high",
  "Token": "medium", "Bearer Token": "medium", "Google API Key": "medium",
};
const RISK_STYLE = {
  critical: { color: "#ef4444", bg: "#0f0303", border: "#7f1d1d", label: "CRITICAL" },
  high:     { color: "#f97316", bg: "#0f0600", border: "#7c2d12", label: "HIGH" },
  medium:   { color: "#eab308", bg: "#0f0a00", border: "#713f12", label: "MEDIUM" },
};

export default function JSAnalyzerView({ crawlData, savedResults, onResultsChange }) {
  const [results, setResults]   = useState(savedResults || null);
  // Sync when savedResults arrives async
  useEffect(() => { if (savedResults) setResults(savedResults); }, [savedResults]);
  const [loading, setLoading]   = useState(false);
  const [tab, setTab]           = useState("secrets");
  const [epFilter, setEpFilter] = useState("");
  const [secFilter, setSecFilter] = useState("All");

  const jsUrls = crawlData?.categories?.js_files || [];

  const run = async () => {
    if (!jsUrls.length) return;
    setLoading(true);
    try {
      const r = await axios.post(`${API}/recon/jsanalyze`, { js_urls: jsUrls });
      setResults(r.data); onResultsChange?.(r.data);
    } catch { setResults({ error: "Analysis failed" }); }
    finally { setLoading(false); }
  };

  const filteredEps = useMemo(() =>
    (results?.all_endpoints || []).filter(ep => !epFilter || ep.toLowerCase().includes(epFilter.toLowerCase())),
    [results, epFilter]);

  const filteredSecrets = useMemo(() => {
    const secs = results?.all_secrets || [];
    if (secFilter === "All") return secs;
    return secs.filter(s => (SECRET_RISK[s.type] || "medium") === secFilter.toLowerCase());
  }, [results, secFilter]);

  const riskCounts = useMemo(() => {
    const c = { critical: 0, high: 0, medium: 0 };
    (results?.all_secrets || []).forEach(s => { const r = SECRET_RISK[s.type] || "medium"; c[r]++; });
    return c;
  }, [results]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: results && !results.error ? "#22c55e" : "#1f2937", boxShadow: results && !results.error ? "0 0 8px #22c55e" : "none" }} />
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#a78bfa", letterSpacing: "0.15em" }}>JS FILE ANALYZER</span>
          </div>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>
            {jsUrls.length > 0 ? `${jsUrls.length} JS files from crawl · endpoints + secret detection` : "Run a crawl first to collect JS files"}
          </span>
        </div>
        <button onClick={run} disabled={loading || !jsUrls.length} style={{
          padding: "10px 24px", borderRadius: 8, cursor: (loading || !jsUrls.length) ? "not-allowed" : "pointer",
          fontFamily: "monospace", fontSize: 12, fontWeight: 700,
          background: loading ? "#0d1117" : "linear-gradient(135deg, #4c1d95, #6d28d9)",
          border: `1px solid ${loading ? "#1f2937" : "#7c3aed55"}`,
          color: loading ? "#374151" : "#fff", boxShadow: loading ? "none" : "0 0 20px #7c3aed22", transition: "all 0.2s",
        }}>{loading ? "ANALYZING…" : results ? "↺  RE-ANALYZE" : "▶  ANALYZE JS FILES"}</button>
      </div>

      {results?.error && <div style={{ background: "#100505", border: "1px solid #3b1f1f", borderRadius: 8, padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "#f87171" }}>{results.error}</div>}

      {results && !results.error && (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
            {[
              { label: "FILES ANALYZED",  value: results.files_analyzed,   color: "#6b7280" },
              { label: "ENDPOINTS",       value: results.total_endpoints,   color: "#60a5fa" },
              { label: "CRITICAL",        value: riskCounts.critical,       color: "#ef4444" },
              { label: "HIGH",            value: riskCounts.high,           color: "#f97316" },
              { label: "TOTAL SECRETS",   value: results.total_secrets,     color: results.total_secrets > 0 ? "#ef4444" : "#22c55e" },
            ].map(s => (
              <div key={s.label} style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 10, padding: "10px 14px", borderTop: `2px solid ${s.color}` }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { key: "secrets",   label: `⚠  SECRETS (${results.total_secrets})`,      activeColor: "#ef4444", activeBg: "#0f0303", activeBorder: "#7f1d1d" },
              { key: "endpoints", label: `🔗  ENDPOINTS (${results.total_endpoints})`,  activeColor: "#60a5fa", activeBg: "#00080f", activeBorder: "#1e3a5f" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: "8px 16px", borderRadius: 7, cursor: "pointer", fontFamily: "monospace", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                background: tab === t.key ? t.activeBg : "transparent",
                border: `1px solid ${tab === t.key ? t.activeBorder : "#0f1923"}`,
                color: tab === t.key ? t.activeColor : "#374151", transition: "all 0.15s",
              }}>{t.label}</button>
            ))}
          </div>

          {/* Secrets */}
          {tab === "secrets" && (
            <>
              <div style={{ display: "flex", gap: 6 }}>
                {["All", "Critical", "High", "Medium"].map(r => {
                  const count = r === "All" ? results.total_secrets : riskCounts[r.toLowerCase()] || 0;
                  const rs = r !== "All" ? RISK_STYLE[r.toLowerCase()] : null;
                  return (
                    <button key={r} onClick={() => setSecFilter(r)} style={{
                      padding: "4px 12px", borderRadius: 5, cursor: "pointer", fontFamily: "monospace", fontSize: 9, fontWeight: 700,
                      background: secFilter === r ? (rs ? rs.bg : "#0d1117") : "transparent",
                      border: `1px solid ${secFilter === r ? (rs ? rs.border : "#374151") : "#0f1923"}`,
                      color: secFilter === r ? (rs ? rs.color : "#9ca3af") : "#374151",
                    }}>{r} ({count})</button>
                  );
                })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 440, overflowY: "auto" }}>
                {filteredSecrets.length === 0 && (
                  <div style={{ padding: 40, textAlign: "center", fontFamily: "monospace", fontSize: 12, color: "#166534" }}>✓ No secrets detected in this filter</div>
                )}
                {filteredSecrets.map((s, i) => {
                  const rs = RISK_STYLE[SECRET_RISK[s.type] || "medium"];
                  return (
                    <div key={i} style={{ background: rs.bg, border: `1px solid ${rs.border}`, borderLeft: `3px solid ${rs.color}`, borderRadius: 8, padding: "10px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 700, color: rs.color, background: rs.bg, border: `1px solid ${rs.border}`, padding: "1px 6px", borderRadius: 3 }}>{rs.label}</span>
                        <span style={{ fontFamily: "monospace", fontSize: 11, color: "#9ca3af" }}>{s.type}</span>
                      </div>
                      <p style={{ fontFamily: "monospace", fontSize: 12, color: rs.color, wordBreak: "break-all", margin: "0 0 4px" }}>{s.value}</p>
                      {s.context && <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", wordBreak: "break-all", margin: 0 }}>{s.context}</p>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Endpoints */}
          {tab === "endpoints" && (
            <>
              <input value={epFilter} onChange={e => setEpFilter(e.target.value)} placeholder="Filter endpoints…"
                style={{ background: "#050507", border: "1px solid #0f1923", borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "#67e8f9", outline: "none", width: "100%", boxSizing: "border-box" }}
                onFocus={e => e.target.style.borderColor = "#164e63"} onBlur={e => e.target.style.borderColor = "#0f1923"} />
              <div style={{ display: "flex", flexDirection: "column", gap: 1, maxHeight: 480, overflowY: "auto" }}>
                {filteredEps.map((ep, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    background: i % 2 === 0 ? "#08080a" : "#050507",
                    borderLeft: "3px solid #164e63", borderBottom: "1px solid #0f1117",
                    padding: "7px 14px 7px 12px",
                  }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "#67e8f9" }}>{ep}</span>
                    <button onClick={() => navigator.clipboard.writeText(ep)}
                      style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }}>
                      copy
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!results && !loading && (
        <div style={{ padding: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "monospace", fontSize: 48, color: "#0f1923" }}>{"{}"}</div>
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>
            {jsUrls.length > 0 ? `${jsUrls.length} JS files ready — click ANALYZE to extract endpoints & secrets` : "No JS files found. Run a crawl first."}
          </p>
        </div>
      )}
    </div>
  );
}