// src/TechDetectView.jsx
import { useState, useMemo, useEffect } from "react";
import axios from "axios";

import API from "./Config";

const CAT_META = {
  "CMS":               { color: "#60a5fa", bg: "#0a1020", border: "#1e3a5f" },
  "Frontend Framework":{ color: "#4ade80", bg: "#001008", border: "#1e3a2f" },
  "Backend Framework": { color: "#34d399", bg: "#001410", border: "#065f46" },
  "JavaScript Library":{ color: "#6ee7b7", bg: "#001210", border: "#064e3b" },
  "CSS Framework":     { color: "#a7f3d0", bg: "#001210", border: "#065f46" },
  "Build Tool":        { color: "#5eead4", bg: "#001214", border: "#134e4a" },
  "Web Server":        { color: "#f87171", bg: "#100505", border: "#3b1f1f" },
  "CDN/Security":      { color: "#fde047", bg: "#100e00", border: "#2d2a1f" },
  "CDN":               { color: "#fde047", bg: "#100e00", border: "#2d2a1f" },
  "WAF":               { color: "#fb923c", bg: "#100800", border: "#431407" },
  "Hosting":           { color: "#d8b4fe", bg: "#0e0818", border: "#2d1f3b" },
  "Storage":           { color: "#c4b5fd", bg: "#0e0818", border: "#2d1f3b" },
  "Language":          { color: "#67e8f9", bg: "#00101a", border: "#1f2d3b" },
  "Analytics":         { color: "#fcd34d", bg: "#100c00", border: "#2d2a1f" },
  "Marketing":         { color: "#f9a8d4", bg: "#180510", border: "#2d1f2d" },
  "Support":           { color: "#f9a8d4", bg: "#180510", border: "#2d1f2d" },
  "Payment":           { color: "#86efac", bg: "#001508", border: "#166534" },
  "Security":          { color: "#fca5a5", bg: "#100505", border: "#3b1f1f" },
  "API":               { color: "#93c5fd", bg: "#0a1020", border: "#1e3a5f" },
  "Search":            { color: "#6ee7b7", bg: "#001210", border: "#064e3b" },
  "Cache":             { color: "#a5b4fc", bg: "#0c0a20", border: "#2e1065" },
  "Other":             { color: "#6b7280", bg: "#0a0c10", border: "#1f2937" },
};

const CVSS_STYLE = (score) => {
  const n = parseFloat(score);
  if (n >= 9.0) return { color: "#ef4444", label: "CRITICAL" };
  if (n >= 7.0) return { color: "#f97316", label: "HIGH" };
  if (n >= 4.0) return { color: "#eab308", label: "MEDIUM" };
  return { color: "#22c55e", label: "LOW" };
};

function CatBadge({ category }) {
  const m = CAT_META[category] || CAT_META["Other"];
  return (
    <span style={{ background: m.bg, border: `1px solid ${m.border}`, color: m.color, padding: "1px 7px", borderRadius: 4, fontFamily: "monospace", fontSize: 10, fontWeight: 700 }}>
      {category}
    </span>
  );
}

function VersionBadge({ version }) {
  if (!version) return null;
  return (
    <span style={{ background: "#0a1020", border: "1px solid #1e3a5f", color: "#93c5fd", padding: "1px 7px", borderRadius: 4, fontFamily: "monospace", fontSize: 10 }}>
      v{version}
    </span>
  );
}

function ExploitBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{ background: "#100505", border: "1px solid #7f1d1d", color: "#ef4444", padding: "1px 7px", borderRadius: 4, fontFamily: "monospace", fontSize: 10, fontWeight: 700 }}>
      {count} exploit{count > 1 ? "s" : ""}
    </span>
  );
}

function CveBadge({ count }) {
  if (!count) return null;
  return (
    <span style={{ background: "#0f0600", border: "1px solid #7c2d12", color: "#f97316", padding: "1px 7px", borderRadius: 4, fontFamily: "monospace", fontSize: 10, fontWeight: 700 }}>
      {count} CVE{count > 1 ? "s" : ""}
    </span>
  );
}

function TechCard({ tech }) {
  const [expanded, setExpanded] = useState(false);
  const m = CAT_META[tech.category] || CAT_META["Other"];
  const hasFindings = tech.exploits?.length > 0 || tech.cves?.length > 0;

  return (
    <div style={{ border: `1px solid ${hasFindings ? "#3b1f1f" : m.border}`, borderLeft: `3px solid ${hasFindings ? "#ef4444" : m.color}`, borderRadius: 8, background: hasFindings ? "#0f0303" : m.bg, marginBottom: 4, overflow: "hidden" }}>
      {/* Header row */}
      <div
        onClick={() => (hasFindings || tech.version) && setExpanded(e => !e)}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", cursor: (hasFindings || tech.version) ? "pointer" : "default" }}
      >
        <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: m.color, flex: 1 }}>{tech.name}</span>
        <VersionBadge version={tech.version} />
        <CatBadge category={tech.category} />
        <ExploitBadge count={tech.exploits?.length} />
        <CveBadge count={tech.cves?.length} />
        {(hasFindings || tech.version) && (
          <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", marginLeft: 4 }}>{expanded ? "▲" : "▼"}</span>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: `1px solid ${m.border}`, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

          {/* ExploitDB entries */}
          {tech.exploits?.length > 0 && (
            <div>
              <p style={{ fontFamily: "monospace", fontSize: 9, color: "#ef4444", letterSpacing: "0.12em", marginBottom: 6 }}>EXPLOITDB</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tech.exploits.map((e, i) => (
                  <div key={i} style={{ background: "#0f0303", border: "1px solid #3b1f1f", borderRadius: 6, padding: "7px 10px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontFamily: "monospace", fontSize: 11, color: "#f87171", marginBottom: 2 }}>{e.title || "Exploit"}</p>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {e.type && <span style={{ fontFamily: "monospace", fontSize: 9, color: "#374151" }}>{e.type}</span>}
                        {e.platform && <span style={{ fontFamily: "monospace", fontSize: 9, color: "#374151" }}>· {e.platform}</span>}
                        {e.date && <span style={{ fontFamily: "monospace", fontSize: 9, color: "#374151" }}>· {e.date}</span>}
                        {e.cvss && <span style={{ fontFamily: "monospace", fontSize: 9, color: "#f97316" }}>· CVSS {e.cvss}</span>}
                      </div>
                    </div>
                    {e.url && (
                      <a href={e.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily: "monospace", fontSize: 9, color: "#f87171", textDecoration: "none", flexShrink: 0, border: "1px solid #3b1f1f", padding: "2px 7px", borderRadius: 4 }}
                        onMouseEnter={e2 => e2.target.style.borderColor = "#ef4444"}
                        onMouseLeave={e2 => e2.target.style.borderColor = "#3b1f1f"}>
                        EDB-{e.edb_id} ↗
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* NVD CVEs */}
          {tech.cves?.length > 0 && (
            <div>
              <p style={{ fontFamily: "monospace", fontSize: 9, color: "#f97316", letterSpacing: "0.12em", marginBottom: 6 }}>NVD CVEs</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {tech.cves.map((c, i) => {
                  const sev = c.cvss_score ? CVSS_STYLE(c.cvss_score) : { color: "#6b7280", label: "?" };
                  return (
                    <div key={i} style={{ background: "#0f0600", border: "1px solid #7c2d12", borderRadius: 6, padding: "7px 10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: sev.color }}>{sev.label}</span>
                          {c.cvss_score && <span style={{ fontFamily: "monospace", fontSize: 10, color: sev.color }}>CVSS {c.cvss_score}</span>}
                          <span style={{ fontFamily: "monospace", fontSize: 9, color: "#374151" }}>{c.published}</span>
                        </div>
                        <a href={c.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontFamily: "monospace", fontSize: 9, color: "#f97316", textDecoration: "none", border: "1px solid #7c2d12", padding: "2px 7px", borderRadius: 4 }}
                          onMouseEnter={e => e.target.style.borderColor = "#f97316"}
                          onMouseLeave={e => e.target.style.borderColor = "#7c2d12"}>
                          {c.cve_id} ↗
                        </a>
                      </div>
                      <p style={{ fontFamily: "monospace", fontSize: 10, color: "#9ca3af", wordBreak: "break-word", margin: 0 }}>{c.description}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SecurityHeadersPanel({ info }) {
  if (!info) return null;
  const missing = info.missing_security_headers || [];
  const present = info.security_headers || {};
  if (!missing.length && !Object.keys(present).length) return null;

  return (
    <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 10, padding: "12px 16px" }}>
      <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.12em", marginBottom: 10 }}>SECURITY HEADERS</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {Object.entries(present).map(([k, v]) => (
          <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#22c55e", background: "#001008", border: "1px solid #166534", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>✓</span>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4ade80" }}>{k}</span>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", wordBreak: "break-all" }}>{v.slice(0, 80)}{v.length > 80 ? "…" : ""}</span>
          </div>
        ))}
        {missing.map(h => (
          <div key={h} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#ef4444", background: "#100505", border: "1px solid #3b1f1f", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>✗</span>
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7280" }}>{h}</span>
            <span style={{ fontFamily: "monospace", fontSize: 9, color: "#1f2937" }}>MISSING</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TechDetectView({ subdomains, targetFolder, savedResults, onResultsChange }) {
  const [results, setResults]     = useState(savedResults || null);
  const [loading, setLoading]     = useState(false);
  const [filter, setFilter]       = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [progress, setProgress]   = useState(0);
  const [selected, setSelected]   = useState(null);
  const [lookupExploits, setLookupExploits] = useState(true);

  useEffect(() => { if (savedResults) setResults(savedResults); }, [savedResults]);

  const run = async () => {
    if (!subdomains.length) return;
    setLoading(true); setResults(null); setProgress(0); setSelected(null);
    const batch = 8; const all = {};
    for (let i = 0; i < subdomains.length; i += batch) {
      try {
        const res = await axios.post(`${API}/recon/techdetect`, {
          subdomains: subdomains.slice(i, i + batch),
          lookup_exploits: lookupExploits,
        });
        Object.assign(all, res.data);
      } catch {}
      setProgress(Math.round(Math.min(((i + batch) / subdomains.length) * 100, 100)));
    }
    setResults(all); onResultsChange?.(all); setLoading(false);
  };

  const allCats = useMemo(() => {
    if (!results) return ["All"];
    const cats = new Set(Object.values(results).flatMap(r => r.technologies?.map(t => t.category) || []));
    return ["All", ...cats];
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

  const stats = useMemo(() => {
    if (!results) return {};
    const all = Object.values(results);
    const withTech = all.filter(r => r.technologies?.length > 0);
    const techNames = new Set(withTech.flatMap(r => r.technologies.map(t => t.name)));
    const withVersion = withTech.flatMap(r => r.technologies.filter(t => t.version));
    const withExploits = withTech.flatMap(r => r.technologies.filter(t => t.exploits?.length > 0));
    const withCves = withTech.flatMap(r => r.technologies.filter(t => t.cves?.length > 0));
    return {
      total: all.length, withTech: withTech.length,
      unique: techNames.size, versioned: withVersion.length,
      exploits: withExploits.length, cves: withCves.length,
    };
  }, [results]);

  const selData = selected && results?.[selected];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, padding: "16px 20px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: results ? "#22c55e" : "#1f2937", boxShadow: results ? "0 0 8px #22c55e" : "none" }} />
              <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#4ade80", letterSpacing: "0.15em" }}>TECHNOLOGY DETECTOR</span>
            </div>
            <span style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>
              {subdomains.length} subdomains · version extraction · ExploitDB + NVD CVE lookup
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={lookupExploits} onChange={e => setLookupExploits(e.target.checked)}
                style={{ accentColor: "#22c55e" }} />
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>Exploit Lookup</span>
            </label>
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
        </div>
        {loading && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>
                {lookupExploits ? "Fingerprinting + querying ExploitDB & NVD…" : "Fingerprinting technologies…"}
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4ade80" }}>{progress}%</span>
            </div>
            <div style={{ height: 3, background: "#0f1923", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #166534, #22c55e)", transition: "width 0.3s" }} />
            </div>
          </div>
        )}
      </div>

      {results && (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
            {[
              { label: "SCANNED",    value: stats.total,     color: "#6b7280" },
              { label: "WITH TECH",  value: stats.withTech,  color: "#4ade80" },
              { label: "UNIQUE",     value: stats.unique,    color: "#60a5fa" },
              { label: "VERSIONED",  value: stats.versioned, color: "#67e8f9" },
              { label: "EXPLOITS",   value: stats.exploits,  color: "#ef4444" },
              { label: "CVEs",       value: stats.cves,      color: "#f97316" },
            ].map(s => (
              <div key={s.label} style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 10, padding: "10px 14px", borderTop: `2px solid ${s.color}` }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 8 }}>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter subdomains…"
              style={{ flex: 1, background: "#050507", border: "1px solid #0f1923", borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "#86efac", outline: "none" }}
              onFocus={e => e.target.style.borderColor = "#166534"} onBlur={e => e.target.style.borderColor = "#0f1923"} />
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
              style={{ background: "#050507", border: "1px solid #0f1923", borderRadius: 8, padding: "8px 12px", fontFamily: "monospace", fontSize: 12, color: "#9ca3af", outline: "none" }}>
              {allCats.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          {/* Split: subdomain list + detail */}
          <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 10, height: 520 }}>

            {/* Left list */}
            <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", borderBottom: "1px solid #0f1923" }}>
                <span style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em" }}>
                  {filtered.length} SUBDOMAINS
                </span>
              </div>
              <div style={{ flex: 1, overflowY: "auto" }}>
                {filtered.map(([sub, r]) => {
                  const hasExploits = r.technologies?.some(t => t.exploits?.length > 0 || t.cves?.length > 0);
                  const isSel = selected === sub;
                  return (
                    <button key={sub} onClick={() => setSelected(sub)} style={{
                      width: "100%", textAlign: "left", padding: "9px 12px",
                      background: isSel ? "#050e05" : "transparent",
                      borderTop: "none", borderRight: "none",
                      borderBottom: "1px solid #0a0c0f",
                      borderLeft: `3px solid ${isSel ? "#4ade80" : hasExploits ? "#ef4444" : "transparent"}`,
                      cursor: "pointer",
                    }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "#0a0d10"; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                      <p style={{ fontFamily: "monospace", fontSize: 11, color: isSel ? "#67e8f9" : hasExploits ? "#f87171" : "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{sub}</p>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {r.technologies?.slice(0, 4).map(t => {
                          const m = CAT_META[t.category] || CAT_META["Other"];
                          return <span key={t.name} style={{ fontFamily: "monospace", fontSize: 9, color: m.color, background: m.bg, border: `1px solid ${m.border}`, padding: "0 4px", borderRadius: 3 }}>{t.name}{t.version ? ` ${t.version}` : ""}</span>;
                        })}
                        {r.technologies?.length > 4 && <span style={{ fontFamily: "monospace", fontSize: 9, color: "#374151" }}>+{r.technologies.length - 4}</span>}
                      </div>
                    </button>
                  );
                })}
                {filtered.length === 0 && <div style={{ padding: 20, textAlign: "center", fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>No results</div>}
              </div>
            </div>

            {/* Right detail */}
            <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {selData ? (
                <>
                  <div style={{ padding: "12px 18px", borderBottom: "1px solid #0f1923" }}>
                    <a href={selData.final_url || `https://${selected}`} target="_blank" rel="noopener noreferrer"
                      style={{ fontFamily: "monospace", fontSize: 13, color: "#67e8f9", textDecoration: "none" }}
                      onMouseEnter={e => e.target.style.textDecoration = "underline"} onMouseLeave={e => e.target.style.textDecoration = "none"}>
                      {selData.final_url || selected}
                    </a>
                    <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                      {selData.status && <span style={{ fontFamily: "monospace", fontSize: 10, color: selData.status < 400 ? "#4ade80" : "#f87171" }}>HTTP {selData.status}</span>}
                      {selData.extra_info?.server && <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>· {selData.extra_info.server}</span>}
                      {selData.extra_info?.powered_by && <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>· {selData.extra_info.powered_by}</span>}
                      {selData.extra_info?.generator && <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>· {selData.extra_info.generator}</span>}
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                    {/* Tech cards */}
                    {selData.technologies?.length > 0 && (
                      <div>
                        <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.12em", marginBottom: 8 }}>DETECTED TECHNOLOGIES</p>
                        {selData.technologies.map(t => <TechCard key={t.name} tech={t} />)}
                      </div>
                    )}
                    {/* Security headers */}
                    <SecurityHeadersPanel info={selData.extra_info} />
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 48, color: "#0f1923" }}>⚙</div>
                  <p style={{ fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>Select a subdomain to inspect</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!results && !loading && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 60 }}>
          <div style={{ fontFamily: "monospace", fontSize: 48, color: "#0f1923" }}>⚙</div>
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>Click RUN DETECTION to fingerprint {subdomains.length} subdomains</p>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#111827" }}>Detects 80+ technologies · extracts versions · queries ExploitDB & NVD CVE</p>
        </div>
      )}
    </div>
  );
}