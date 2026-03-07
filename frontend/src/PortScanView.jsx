// src/PortScanView.jsx
import { useState, useMemo, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";

const PORT_RISK = {
  21: "high", 22: "low", 23: "critical", 25: "medium", 53: "low",
  80: "low", 110: "low", 135: "high", 139: "high", 143: "low",
  443: "low", 445: "critical", 587: "low", 993: "low", 995: "low",
  1433: "critical", 1521: "critical", 2375: "critical", 2376: "high",
  3000: "medium", 3306: "high", 3389: "critical", 4443: "low",
  5000: "medium", 5432: "high", 5900: "high", 6379: "critical",
  7000: "medium", 8000: "low", 8080: "low", 8443: "low",
  8888: "medium", 9200: "critical", 9300: "high", 27017: "critical",
};

const RISK = {
  critical: { color: "#ef4444", dim: "#7f1d1d", bg: "#0f0303", bar: "#ef4444", glow: "#ef444433", label: "CRITICAL" },
  high:     { color: "#f97316", dim: "#7c2d12", bg: "#0f0600", bar: "#f97316", glow: "#f9731633", label: "HIGH" },
  medium:   { color: "#eab308", dim: "#713f12", bg: "#0f0a00", bar: "#eab308", glow: "#eab30833", label: "MEDIUM" },
  low:      { color: "#22c55e", dim: "#14532d", bg: "#00100a", bar: "#22c55e", glow: "#22c55e33", label: "LOW" },
};

const SERVICE_DESC = {
  FTP: "File Transfer", SSH: "Secure Shell", Telnet: "Remote Terminal",
  SMTP: "Mail Transfer", DNS: "Name Service", HTTP: "Web Server",
  POP3: "Mail Retrieval", SMB: "File Sharing", IMAP: "Mail Access",
  HTTPS: "Secure Web", "SMTP/TLS": "Secure Mail", IMAPS: "Secure IMAP",
  POP3S: "Secure POP3", MSSQL: "SQL Server", Oracle: "Oracle DB",
  Docker: "Container API", "Docker TLS": "Container TLS",
  "Dev Server": "Dev Server", MySQL: "MySQL DB", RDP: "Remote Desktop",
  "Alt HTTPS": "Alt HTTPS", "Flask/Dev": "Dev App", PostgreSQL: "Postgres DB",
  VNC: "Virtual Desktop", Redis: "Redis Cache", Cassandra: "Cassandra DB",
  "Alt HTTP": "Alt HTTP", Jupyter: "Jupyter NB", Elasticsearch: "Search DB",
  MongoDB: "MongoDB", unknown: "Unknown",
};

function RiskBadge({ risk }) {
  const r = RISK[risk] || RISK.low;
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 9, fontWeight: 700,
      color: r.color, background: r.bg,
      border: `1px solid ${r.dim}`,
      padding: "1px 6px", borderRadius: 4,
      letterSpacing: "0.08em",
    }}>{r.label}</span>
  );
}

function PortRow({ p, index }) {
  const risk = PORT_RISK[p.port] || "low";
  const r = RISK[risk];
  const desc = SERVICE_DESC[p.service] || "";

  return (
    <div
      style={{
        display: "grid", gridTemplateColumns: "52px 1fr auto",
        alignItems: "center", gap: 0,
        background: index % 2 === 0 ? "#08080a" : "#050507",
        borderLeft: `3px solid ${r.color}`,
        borderBottom: "1px solid #0f1117",
        padding: "9px 16px 9px 14px",
        transition: "background 0.15s",
        cursor: "default",
      }}
      onMouseEnter={e => e.currentTarget.style.background = r.bg}
      onMouseLeave={e => e.currentTarget.style.background = index % 2 === 0 ? "#08080a" : "#050507"}
    >
      {/* Port number */}
      <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: r.color, lineHeight: 1 }}>
        {p.port}
      </div>

      {/* Service info */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>
            {p.service}
          </span>
          <RiskBadge risk={risk} />
        </div>
        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>{desc}</span>
      </div>

      {/* Status */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: "#22c55e",
          boxShadow: "0 0 6px #22c55e",
        }} />
        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#22c55e", letterSpacing: "0.1em" }}>OPEN</span>
      </div>
    </div>
  );
}

export default function PortScanView({ subdomains, savedResults, onResultsChange }) {
  const [results, setResults]   = useState(savedResults || null);
  // Sync when savedResults arrives async
  useEffect(() => {
    if (savedResults) {
      setResults(savedResults);
      const first = Object.entries(savedResults).find(([,r]) => r?.open_ports?.length > 0);
      if (first) setSelected(first[0]);
    }
  }, [savedResults]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(savedResults ? Object.keys(savedResults).find(k => savedResults[k]?.open_ports?.length > 0) || null : null);
  const [progress, setProgress] = useState(0);
  const [filter, setFilter]     = useState("");
  const [riskFilter, setRiskFilter] = useState("ALL");

  const run = async () => {
    if (!subdomains.length) return;
    setLoading(true);
    setResults(null);
    setProgress(0);
    setSelected(null);

    const batch = 5;
    const all = {};
    for (let i = 0; i < subdomains.length; i += batch) {
      const chunk = subdomains.slice(i, i + batch);
      try {
        const res = await axios.post(`${API}/recon/portscan`, { subdomains: chunk });
        Object.assign(all, res.data);
      } catch {}
      setProgress(Math.round(Math.min(((i + batch) / subdomains.length) * 100, 100)));
    }
    setResults(all);
    onResultsChange?.(all);
    setLoading(false);
    const first = Object.entries(all).find(([, r]) => r.open_ports?.length > 0);
    if (first) setSelected(first[0]);
  };

  const hostsWithPorts = useMemo(() => {
    if (!results) return [];
    return Object.entries(results)
      .filter(([, r]) => r.open_ports?.length > 0)
      .filter(([sub]) => !filter || sub.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => b[1].open_ports.length - a[1].open_ports.length);
  }, [results, filter]);

  const selectedResult = selected && results?.[selected];

  const filteredPorts = useMemo(() => {
    if (!selectedResult) return [];
    if (riskFilter === "ALL") return selectedResult.open_ports;
    return selectedResult.open_ports.filter(p => (PORT_RISK[p.port] || "low") === riskFilter.toLowerCase());
  }, [selectedResult, riskFilter]);

  // Global stats
  const stats = useMemo(() => {
    if (!results) return {};
    const allPorts = Object.values(results).flatMap(r => r.open_ports || []);
    const byRisk = { critical: 0, high: 0, medium: 0, low: 0 };
    allPorts.forEach(p => { const r = PORT_RISK[p.port] || "low"; byRisk[r]++; });
    return { total: allPorts.length, byRisk, hosts: hostsWithPorts.length };
  }, [results, hostsWithPorts]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>

      {/* ── Top bar ── */}
      <div style={{
        background: "#080c10", border: "1px solid #0f1923",
        borderRadius: 12, padding: "16px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: loading ? "#f97316" : results ? "#22c55e" : "#374151", boxShadow: loading ? "0 0 8px #f97316" : results ? "0 0 8px #22c55e" : "none" }} />
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#4ade80", letterSpacing: "0.15em" }}>
              PORT SCANNER
            </span>
          </div>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>
            {subdomains.length} hosts · {Object.keys(PORT_RISK).length} ports · TCP connect scan
          </span>
        </div>

        <button
          onClick={run}
          disabled={loading || !subdomains.length}
          style={{
            padding: "10px 24px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
            fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: "0.08em",
            background: loading ? "#0d1117" : "linear-gradient(135deg, #166534, #15803d)",
            border: `1px solid ${loading ? "#1f2937" : "#22c55e55"}`,
            color: loading ? "#374151" : "#fff",
            boxShadow: loading ? "none" : "0 0 20px #22c55e22",
            transition: "all 0.2s",
          }}
        >
          {loading ? `SCANNING ${progress}%` : results ? "↺  RE-SCAN" : "▶  START SCAN"}
        </button>
      </div>

      {/* ── Progress bar ── */}
      {loading && (
        <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 8, padding: "10px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>TCP connect scan in progress…</span>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#f97316" }}>{progress}%</span>
          </div>
          <div style={{ height: 3, background: "#0f1923", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #166534, #22c55e)", borderRadius: 99, transition: "width 0.3s" }} />
          </div>
        </div>
      )}

      {/* ── Stats row (post-scan) ── */}
      {results && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
          {[
            { label: "HOSTS SCANNED",   value: subdomains.length,    color: "#6b7280" },
            { label: "WITH OPEN PORTS", value: stats.hosts,          color: "#4ade80" },
            { label: "CRITICAL",        value: stats.byRisk?.critical || 0, color: RISK.critical.color },
            { label: "HIGH",            value: stats.byRisk?.high    || 0, color: RISK.high.color },
            { label: "TOTAL OPEN",      value: stats.total || 0,     color: "#60a5fa" },
          ].map(s => (
            <div key={s.label} style={{
              background: "#080c10", border: "1px solid #0f1923",
              borderRadius: 10, padding: "10px 14px",
              borderTop: `2px solid ${s.color}`,
            }}>
              <div style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Main panel ── */}
      {results && (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, flex: 1, minHeight: 0 }}>

          {/* Left — host list */}
          <div style={{
            background: "#080c10", border: "1px solid #0f1923",
            borderRadius: 12, display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #0f1923" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", letterSpacing: "0.1em" }}>HOSTS</span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#22c55e" }}>{hostsWithPorts.length} open</span>
              </div>
              <input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filter hosts..."
                style={{
                  width: "100%", background: "#050507", border: "1px solid #0f1923",
                  borderRadius: 6, padding: "6px 10px", boxSizing: "border-box",
                  fontFamily: "monospace", fontSize: 11, color: "#86efac",
                  outline: "none",
                }}
                onFocus={e => e.target.style.borderColor = "#166534"}
                onBlur={e => e.target.style.borderColor = "#0f1923"}
              />
            </div>

            {/* List */}
            <div style={{ flex: 1, overflowY: "auto" }}>
              {hostsWithPorts.map(([sub, r]) => {
                const isActive = selected === sub;
                const maxRisk = r.open_ports.reduce((acc, p) => {
                  const order = { critical: 4, high: 3, medium: 2, low: 1 };
                  const pRisk = PORT_RISK[p.port] || "low";
                  return order[pRisk] > order[acc] ? pRisk : acc;
                }, "low");
                const rc = RISK[maxRisk];

                return (
                  <button
                    key={sub}
                    onClick={() => setSelected(sub)}
                    style={{
                      width: "100%", textAlign: "left",
                      padding: "10px 14px",
                      background: isActive ? "#0d1117" : "transparent",
                      borderTop: "none", borderRight: "none",
                      borderBottom: "1px solid #0a0c0f",
                      borderLeft: `3px solid ${isActive ? rc.color : "transparent"}`,
                      cursor: "pointer", transition: "all 0.12s",
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#0a0d10"; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <span style={{ fontFamily: "monospace", fontSize: 11, color: isActive ? "#67e8f9" : "#4b5563", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                        {sub}
                      </span>
                      <span style={{ fontFamily: "monospace", fontSize: 10, color: rc.color, flexShrink: 0, marginLeft: 4 }}>
                        {r.open_ports.length}
                      </span>
                    </div>
                    {/* Mini port risk strip */}
                    <div style={{ display: "flex", gap: 2, marginTop: 5 }}>
                      {r.open_ports.slice(0, 8).map(p => {
                        const pr = PORT_RISK[p.port] || "low";
                        return <div key={p.port} style={{ width: 4, height: 4, borderRadius: 1, background: RISK[pr].color, opacity: 0.7 }} />;
                      })}
                      {r.open_ports.length > 8 && <span style={{ fontSize: 8, color: "#374151", fontFamily: "monospace" }}>+{r.open_ports.length - 8}</span>}
                    </div>
                  </button>
                );
              })}

              {hostsWithPorts.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>
                  No hosts with open ports
                </div>
              )}
            </div>
          </div>

          {/* Right — port detail */}
          <div style={{
            background: "#080c10", border: "1px solid #0f1923",
            borderRadius: 12, display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}>
            {selectedResult ? (
              <>
                {/* Detail header */}
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #0f1923", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <a
                      href={`https://${selected}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: "monospace", fontSize: 13, color: "#67e8f9", textDecoration: "none", fontWeight: 600 }}
                    >
                      {selected}
                    </a>
                    <div style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", marginTop: 2 }}>
                      {selectedResult.open_ports.length} open ports detected
                    </div>
                  </div>

                  {/* Risk filter tabs */}
                  <div style={{ display: "flex", gap: 4 }}>
                    {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map(r => {
                      const rk = r.toLowerCase();
                      const count = r === "ALL" ? selectedResult.open_ports.length
                        : selectedResult.open_ports.filter(p => (PORT_RISK[p.port] || "low") === rk).length;
                      if (r !== "ALL" && count === 0) return null;
                      const rc = r !== "ALL" ? RISK[rk] : null;
                      return (
                        <button
                          key={r}
                          onClick={() => setRiskFilter(r)}
                          style={{
                            padding: "4px 10px", borderRadius: 5, cursor: "pointer",
                            fontFamily: "monospace", fontSize: 9, fontWeight: 700,
                            letterSpacing: "0.06em",
                            background: riskFilter === r ? (rc ? rc.bg : "#0d1117") : "transparent",
                            border: `1px solid ${riskFilter === r ? (rc ? rc.color : "#374151") : "#1f2937"}`,
                            color: riskFilter === r ? (rc ? rc.color : "#9ca3af") : "#374151",
                            transition: "all 0.15s",
                          }}
                        >
                          {r} {count > 0 && <span style={{ opacity: 0.7 }}>({count})</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Port table header */}
                <div style={{
                  display: "grid", gridTemplateColumns: "52px 1fr auto",
                  padding: "6px 16px 6px 17px",
                  borderBottom: "1px solid #0f1923",
                  background: "#050507",
                }}>
                  {["PORT", "SERVICE / DESCRIPTION", "STATUS"].map(h => (
                    <span key={h} style={{ fontFamily: "monospace", fontSize: 9, color: "#1f2937", letterSpacing: "0.12em" }}>{h}</span>
                  ))}
                </div>

                {/* Port rows */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {filteredPorts.map((p, i) => <PortRow key={p.port} p={p} index={i} />)}
                  {filteredPorts.length === 0 && (
                    <div style={{ padding: 30, textAlign: "center", fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>
                      No ports matching filter
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                <div style={{ fontFamily: "monospace", fontSize: 32, color: "#0f1923" }}>⬡</div>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>Select a host to inspect open ports</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!results && !loading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ fontFamily: "monospace", fontSize: 48, color: "#0f1923" }}>⬡</div>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: "monospace", fontSize: 13, color: "#1f2937", marginBottom: 4 }}>No scan results yet</p>
            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#111827" }}>Click START SCAN to probe {subdomains.length} hosts</p>
          </div>
        </div>
      )}
    </div>
  );
}