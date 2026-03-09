// src/IDORView.jsx
import { useState } from "react";
import axios from "axios";
import API from "./Config";

const HIGH_RISK_KEYWORDS = ["id", "uid", "user_id", "account", "order", "invoice",
  "file", "doc", "record", "profile", "ticket", "ref", "token", "key", "pid",
  "cid", "bid", "rid", "num", "no", "number", "idx"];

const RISK_COLORS = {
  critical: { color: "#ef4444", bg: "#1c0505", border: "#7f1d1d", label: "CRITICAL" },
  high:     { color: "#f97316", bg: "#1c0a00", border: "#7c2d12", label: "HIGH"     },
  medium:   { color: "#fbbf24", bg: "#1a1500", border: "#713f12", label: "MEDIUM"   },
  low:      { color: "#4ade80", bg: "#052e16", border: "#166534", label: "LOW"      },
};

function RiskBadge({ risk }) {
  const r = RISK_COLORS[risk] || RISK_COLORS.low;
  return (
    <span style={{
      fontFamily: "monospace", fontSize: 9, padding: "2px 8px", borderRadius: 4,
      color: r.color, background: r.bg, border: `1px solid ${r.border}`,
      letterSpacing: "0.08em", flexShrink: 0,
    }}>{r.label}</span>
  );
}

function getRisk(param, count, exampleValues) {
  const p = param.toLowerCase();
  const isHighKeyword = HIGH_RISK_KEYWORDS.some(k => p === k || p.endsWith(`_${k}`) || p.startsWith(`${k}_`));
  const hasNumericValue = exampleValues.some(v => /^\d+$/.test(v));
  const hasUUID = exampleValues.some(v => /^[0-9a-f-]{32,36}$/i.test(v));
  if (isHighKeyword && (hasNumericValue || hasUUID)) return "critical";
  if (isHighKeyword) return "high";
  if (hasNumericValue && count >= 3) return "medium";
  return "low";
}

export default function IDORView({ crawlData, savedResults, onResultsChange }) {
  const [results, setResults]       = useState(savedResults || null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState("");
  const [search, setSearch]         = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [sortBy, setSortBy]         = useState("risk");
  const [expanded, setExpanded]     = useState({});
  const [copied, setCopied]         = useState("");
  const [tab, setTab]               = useState("params");

  const allUrls = crawlData ? Object.values(crawlData.categories || {}).flat() : [];
  const urlsWithParams = allUrls.filter(u => u.includes("?"));

  const runAnalysis = async () => {
    if (!allUrls.length) { setError("No crawl data. Run a crawl first."); return; }
    setLoading(true); setError("");
    try {
      const resp = await axios.post(`${API}/recon/idor`, { urls: allUrls });
      setResults(resp.data);
      onResultsChange?.(resp.data);
    } catch (e) {
      setError("Analysis failed — " + (e.response?.data?.detail || e.message));
    } finally { setLoading(false); }
  };

  const copy = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1500);
  };

  const params = results?.params || {};
  const paramEntries = Object.entries(params).map(([param, info]) => ({
    param, ...info,
    risk: getRisk(param, info.count || 0, info.example_values || []),
  }));

  const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...paramEntries].sort((a, b) => {
    if (sortBy === "risk")  return (riskOrder[a.risk] ?? 4) - (riskOrder[b.risk] ?? 4);
    if (sortBy === "count") return (b.count || 0) - (a.count || 0);
    return a.param.localeCompare(b.param);
  });

  const filtered = sorted.filter(e =>
    (!search || e.param.toLowerCase().includes(search.toLowerCase())) &&
    (!riskFilter || e.risk === riskFilter)
  );

  const riskCounts = paramEntries.reduce((acc, e) => {
    acc[e.risk] = (acc[e.risk] || 0) + 1; return acc;
  }, {});

  const buildReport = () => [
    "IDOR PARAMETER ANALYSIS REPORT",
    "================================",
    `Total URLs         : ${allUrls.length}`,
    `URLs with params   : ${urlsWithParams.length}`,
    `Unique parameters  : ${paramEntries.length}`,
    "",
    "RISK SUMMARY:",
    `  Critical : ${riskCounts.critical || 0}`,
    `  High     : ${riskCounts.high || 0}`,
    `  Medium   : ${riskCounts.medium || 0}`,
    `  Low      : ${riskCounts.low || 0}`,
    "",
    "TOP IDOR CANDIDATES:",
    "--------------------",
    ...sorted.filter(e => ["critical","high"].includes(e.risk)).flatMap(e => [
      `[${e.risk.toUpperCase()}] ?${e.param}`,
      `  Occurrences    : ${e.count}`,
      `  Example values : ${(e.example_values||[]).slice(0,3).join(", ")}`,
      `  Example URLs:`,
      ...(e.example_urls||[]).slice(0,2).map(u => `    ${u}`),
      "",
    ]),
  ].join("\n");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* ── HEADER ── */}
      <div style={{
        background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12,
        padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15 }}>⚡</span>
            <h2 style={{ fontFamily: "monospace", fontSize: 12, color: "#f97316", letterSpacing: "0.1em", margin: 0 }}>IDOR ANALYZER</h2>
          </div>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", marginTop: 3 }}>
            Insecure Direct Object Reference · parameter-level attack surface
            {results && ` · ${paramEntries.length} params · ${urlsWithParams.length} URLs with params`}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {allUrls.length > 0 && !results && (
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>
              {allUrls.length.toLocaleString()} URLs ready
            </span>
          )}
          {!allUrls.length && (
            <span style={{ fontFamily: "monospace", fontSize: 10, color: "#7c2d12", background: "#1c0a00", border: "1px solid #7c2d12", padding: "3px 8px", borderRadius: 5 }}>
              ⚠ No crawl data
            </span>
          )}
          <button onClick={runAnalysis} disabled={loading || !allUrls.length} style={{
            padding: "8px 20px", borderRadius: 8, fontFamily: "monospace", fontSize: 12, fontWeight: 700,
            cursor: loading || !allUrls.length ? "not-allowed" : "pointer",
            background: loading || !allUrls.length ? "#0d1117" : "linear-gradient(135deg, #7c2d12, #c2410c)",
            border: `1px solid ${loading || !allUrls.length ? "#1f2937" : "#ea580c"}`,
            color: loading || !allUrls.length ? "#374151" : "#fff",
            transition: "all 0.2s",
          }}>
            {loading ? "⏳ Analyzing…" : results ? "↺ Re-Analyze" : "▶ Run Analysis"}
          </button>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: "#1c0505", border: "1px solid #7f1d1d", borderRadius: 8, padding: "10px 14px", fontFamily: "monospace", fontSize: 11, color: "#f87171" }}>
          {error}
        </div>
      )}

      {/* ── No crawl warning ── */}
      {!allUrls.length && (
        <div style={{ background: "#1c0a00", border: "1px solid #7c2d12", borderRadius: 10, padding: "14px 18px", fontFamily: "monospace", fontSize: 12, color: "#fb923c" }}>
          ⚠ Go to <strong style={{ color: "#fdba74" }}>Crawl URLs</strong> and run a crawl first, then come back here.
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 10, padding: "18px" }}>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#374151", marginBottom: 10 }}>
            Parsing {allUrls.length.toLocaleString()} URLs for parameter patterns…
          </p>
          <div style={{ height: 2, background: "#1f2937", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "100%", background: "linear-gradient(90deg, #f97316, #ef4444)", borderRadius: 2 }} />
          </div>
        </div>
      )}

      {/* ── RESULTS ── */}
      {results && !loading && (
        <>
          {/* Risk summary cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {["critical","high","medium","low"].map(risk => {
              const r = RISK_COLORS[risk];
              const count = riskCounts[risk] || 0;
              const active = riskFilter === risk;
              return (
                <div key={risk} onClick={() => count > 0 && setRiskFilter(active ? "" : risk)} style={{
                  background: active ? r.bg : "#0a0a0a",
                  border: `1px solid ${active ? r.color : count > 0 ? r.border : "#111827"}`,
                  borderRadius: 10, padding: "12px 14px",
                  cursor: count > 0 ? "pointer" : "default",
                  opacity: count === 0 ? 0.35 : 1,
                  transition: "all 0.15s",
                }}>
                  <p style={{ fontFamily: "monospace", fontSize: 9, color: r.color, letterSpacing: "0.1em", marginBottom: 4 }}>{r.label}</p>
                  <p style={{ fontFamily: "monospace", fontSize: 26, color: count > 0 ? r.color : "#374151", fontWeight: 700, margin: 0 }}>{count}</p>
                  <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", marginTop: 2 }}>
                    {active ? "click to clear" : "parameters"}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 2, background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 10, padding: 4 }}>
            {[
              { key: "params", label: "Parameters",       count: paramEntries.length },
              { key: "urls",   label: "URLs with Params", count: urlsWithParams.length },
              { key: "report", label: "Report" },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: "8px 10px", borderRadius: 7, cursor: "pointer",
                fontFamily: "monospace", fontSize: 11,
                background: tab === t.key ? "#1f2937" : "transparent",
                border: `1px solid ${tab === t.key ? "#374151" : "transparent"}`,
                color: tab === t.key ? "#e5e7eb" : "#4b5563",
                transition: "all 0.15s",
              }}>
                {t.label}{t.count != null ? ` (${t.count.toLocaleString()})` : ""}
              </button>
            ))}
          </div>

          {/* ── Parameters tab ── */}
          {tab === "params" && (
            <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: 14 }}>
              {/* Filter bar */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search parameter name..."
                  style={{
                    flex: 1, background: "#000", border: "1px solid #1f2937", borderRadius: 6,
                    padding: "7px 12px", color: "#e5e7eb", fontFamily: "monospace", fontSize: 12, outline: "none",
                  }}
                  onFocus={e => e.target.style.borderColor = "#f9731666"}
                  onBlur={e => e.target.style.borderColor = "#1f2937"}
                />
                <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{
                  background: "#000", border: "1px solid #1f2937", borderRadius: 6,
                  padding: "7px 10px", color: "#9ca3af", fontFamily: "monospace", fontSize: 11, outline: "none",
                }}>
                  <option value="risk">Sort: Risk</option>
                  <option value="count">Sort: Frequency</option>
                  <option value="alpha">Sort: A–Z</option>
                </select>
                {(search || riskFilter) && (
                  <button onClick={() => { setSearch(""); setRiskFilter(""); }} style={{
                    padding: "7px 12px", background: "#111827", border: "1px solid #374151",
                    borderRadius: 6, color: "#6b7280", fontFamily: "monospace", fontSize: 11, cursor: "pointer",
                  }}>✕ Clear</button>
                )}
              </div>

              {/* Param rows — COLLAPSED BY DEFAULT */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {filtered.length === 0 && (
                  <p style={{ fontFamily: "monospace", fontSize: 12, color: "#1f2937", textAlign: "center", padding: 24 }}>
                    No parameters match the filter
                  </p>
                )}
                {filtered.map(({ param, risk, count, example_values = [], example_urls = [] }) => {
                  const r = RISK_COLORS[risk];
                  const isOpen = !!expanded[param];
                  return (
                    <div key={param} style={{
                      background: "#000",
                      border: `1px solid ${isOpen ? r.border : "#111827"}`,
                      borderRadius: 8, overflow: "hidden", transition: "border-color 0.15s",
                    }}>
                      {/* Collapsed row — click to expand */}
                      <div
                        onClick={() => setExpanded(p => ({ ...p, [param]: !isOpen }))}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", userSelect: "none" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#0d1117"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                        <span style={{ fontFamily: "monospace", fontSize: 12, flex: 1, minWidth: 0 }}>
                          <span style={{ color: "#374151" }}>?</span>
                          <span style={{ color: r.color }}>{param}</span>
                        </span>
                        <RiskBadge risk={risk} />
                        <span style={{
                          fontFamily: "monospace", fontSize: 10, color: "#6b7280",
                          background: "#0d1117", border: "1px solid #1f2937",
                          padding: "2px 8px", borderRadius: 10, flexShrink: 0,
                        }}>{count}×</span>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          {example_values.slice(0, 2).map((v, i) => (
                            <span key={i} style={{
                              fontFamily: "monospace", fontSize: 9, color: "#60a5fa",
                              background: "#0c1a2e", border: "1px solid #1e3a5f",
                              padding: "2px 6px", borderRadius: 4,
                              maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            }}>{v}</span>
                          ))}
                        </div>
                        <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", flexShrink: 0, marginLeft: 2 }}>
                          {isOpen ? "▲" : "▼"}
                        </span>
                      </div>

                      {/* Expanded detail */}
                      {isOpen && (
                        <div style={{ borderTop: `1px solid ${r.border}44`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                          {/* Why risky */}
                          <div style={{ background: r.bg, border: `1px solid ${r.border}`, borderRadius: 6, padding: "10px 12px" }}>
                            <p style={{ fontFamily: "monospace", fontSize: 9, color: r.color, letterSpacing: "0.1em", marginBottom: 6 }}>WHY THIS IS RISKY</p>
                            <p style={{ fontFamily: "monospace", fontSize: 11, color: "#9ca3af", lineHeight: 1.7, margin: 0 }}>
                              {risk === "critical" && `Parameter "${param}" directly references an object ID. Try incrementing/decrementing the value to access other users' data.`}
                              {risk === "high"     && `Parameter "${param}" is a common identifier pattern. Test with different IDs to check for missing authorization.`}
                              {risk === "medium"   && `Parameter "${param}" appears in ${count} URLs with numeric values — potential object reference. Verify access controls.`}
                              {risk === "low"      && `Parameter "${param}" has low IDOR risk but worth reviewing in context.`}
                            </p>
                          </div>
                          {/* Payloads */}
                          <div>
                            <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 6 }}>TESTING PAYLOADS (click to copy)</p>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {["1","2","0","-1","999999","00000000-0000-0000-0000-000000000001","null","undefined","admin"].map(v => (
                                <span key={v} onClick={() => copy(`${param}=${v}`, `p-${param}-${v}`)} title="Click to copy" style={{
                                  fontFamily: "monospace", fontSize: 10, color: "#fbbf24",
                                  background: "#1a1500", border: "1px solid #713f12",
                                  padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                                }}>
                                  {copied === `p-${param}-${v}` ? "✓ copied" : `${param}=${v}`}
                                </span>
                              ))}
                            </div>
                          </div>
                          {/* Observed values */}
                          {example_values.length > 0 && (
                            <div>
                              <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 6 }}>OBSERVED VALUES ({example_values.length})</p>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {example_values.map((v, i) => (
                                  <span key={i} style={{
                                    fontFamily: "monospace", fontSize: 10, color: "#60a5fa",
                                    background: "#0c1a2e", border: "1px solid #1e3a5f",
                                    padding: "2px 6px", borderRadius: 4,
                                  }}>{v}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* Example URLs */}
                          {example_urls.length > 0 && (
                            <div>
                              <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 6 }}>EXAMPLE URLS</p>
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                {example_urls.slice(0, 5).map((url, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{
                                      fontFamily: "monospace", fontSize: 10, color: "#4b5563",
                                      background: "#0d1117", border: "1px solid #1f2937",
                                      padding: "4px 8px", borderRadius: 4, flex: 1,
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>{url}</span>
                                    <button onClick={() => copy(url, `ul-${param}-${i}`)} style={{
                                      flexShrink: 0, background: "none", border: "none", fontFamily: "monospace",
                                      fontSize: 10, cursor: "pointer", color: copied === `ul-${param}-${i}` ? "#4ade80" : "#374151",
                                    }}>{copied === `ul-${param}-${i}` ? "✓" : "copy"}</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontFamily: "monospace", fontSize: 9, color: "#1f2937", textAlign: "right", marginTop: 8 }}>
                {filtered.length} of {paramEntries.length} parameters shown
              </p>
            </div>
          )}

          {/* ── URLs tab ── */}
          {tab === "urls" && (
            <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ fontFamily: "monospace", fontSize: 11, color: "#374151" }}>
                  {urlsWithParams.length.toLocaleString()} URLs with query parameters (showing first 500)
                </p>
                <button onClick={() => copy(urlsWithParams.join("\n"), "all-urls")} style={{
                  padding: "5px 12px", background: "#111827", border: "1px solid #374151",
                  borderRadius: 6, color: copied === "all-urls" ? "#4ade80" : "#6b7280",
                  fontFamily: "monospace", fontSize: 10, cursor: "pointer",
                }}>
                  {copied === "all-urls" ? "✓ Copied" : `Copy all (${urlsWithParams.length})`}
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 520, overflowY: "auto" }}>
                {urlsWithParams.slice(0, 500).map((url, i) => {
                  const [base, qs] = url.split("?");
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{
                        fontFamily: "monospace", fontSize: 10, flex: 1,
                        background: "#000", border: "1px solid #111827",
                        padding: "5px 10px", borderRadius: 4,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        <span style={{ color: "#4b5563" }}>{base}</span>
                        {qs && <><span style={{ color: "#374151" }}>?</span><span style={{ color: "#fbbf24" }}>{qs}</span></>}
                      </span>
                      <button onClick={() => copy(url, `u${i}`)} style={{
                        flexShrink: 0, background: "none", border: "none",
                        color: copied === `u${i}` ? "#4ade80" : "#374151",
                        cursor: "pointer", fontFamily: "monospace", fontSize: 10,
                      }}>{copied === `u${i}` ? "✓" : "copy"}</button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Report tab ── */}
          {tab === "report" && (
            <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <p style={{ fontFamily: "monospace", fontSize: 11, color: "#374151" }}>Copy into your engagement notes</p>
                <button onClick={() => copy(buildReport(), "report")} style={{
                  padding: "5px 14px", background: "#166534", border: "1px solid #166534",
                  borderRadius: 6, color: copied === "report" ? "#4ade80" : "#fff",
                  fontFamily: "monospace", fontSize: 10, cursor: "pointer",
                }}>
                  {copied === "report" ? "✓ Copied" : "Copy Report"}
                </button>
              </div>
              <pre style={{
                fontFamily: "monospace", fontSize: 11, color: "#4b5563",
                background: "#000", border: "1px solid #111827",
                padding: "14px 16px", borderRadius: 8,
                overflowY: "auto", maxHeight: 500, lineHeight: 1.7,
                whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
              }}>{buildReport()}</pre>
            </div>
          )}
        </>
      )}

      {/* ── Empty state ── */}
      {!results && !loading && allUrls.length > 0 && (
        <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: 56, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
          <p style={{ fontFamily: "monospace", fontSize: 13, color: "#374151", marginBottom: 6 }}>
            {allUrls.length.toLocaleString()} URLs ready to analyze
          </p>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937", marginBottom: 24 }}>
            {urlsWithParams.length.toLocaleString()} URLs contain query parameters
          </p>
          <button onClick={runAnalysis} style={{
            padding: "11px 32px", borderRadius: 8, cursor: "pointer",
            fontFamily: "monospace", fontSize: 13, fontWeight: 700,
            background: "linear-gradient(135deg, #7c2d12, #c2410c)",
            border: "1px solid #ea580c44", color: "#fff",
          }}>▶ Run IDOR Analysis</button>
        </div>
      )}
    </div>
  );
}