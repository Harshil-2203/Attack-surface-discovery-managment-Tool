// src/JSAnalyzerView.jsx
import { useState, useMemo, useEffect } from "react";
import axios from "axios";

import API from "./Config";

const SEV = {
  critical: { color:"#ef4444", bg:"#0f0303", border:"#7f1d1d", dim:"#3b1f1f" },
  high:     { color:"#f97316", bg:"#0f0600", border:"#7c2d12", dim:"#431407" },
  medium:   { color:"#eab308", bg:"#0f0a00", border:"#713f12", dim:"#422006" },
  low:      { color:"#22c55e", bg:"#00100a", border:"#14532d", dim:"#052e16" },
};
const SEV_ORDER = { critical:0, high:1, medium:2, low:3 };

function SevBadge({ severity, small }) {
  const s = SEV[severity] || SEV.medium;
  return (
    <span style={{ fontFamily:"monospace", fontSize: small?8:9, fontWeight:700,
      color:s.color, background:s.bg, border:`1px solid ${s.border}`,
      padding: small?"0 4px":"1px 6px", borderRadius:4, letterSpacing:"0.05em" }}>
      {severity?.toUpperCase()}
    </span>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(()=>setCopied(false), 1200); }}
      style={{ fontFamily:"monospace", fontSize:9, color: copied?"#22c55e":"#374151",
        background:"none", border:"none", cursor:"pointer", padding:"0 6px", flexShrink:0 }}>
      {copied ? "✓" : "copy"}
    </button>
  );
}

function StatBox({ label, value, color, sub }) {
  return (
    <div style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:8,
      padding:"9px 13px", borderTop:`2px solid ${color}` }}>
      <div style={{ fontFamily:"monospace", fontSize:8, color:"#374151", letterSpacing:"0.08em", marginBottom:3 }}>{label}</div>
      <div style={{ fontFamily:"monospace", fontSize:20, fontWeight:800, color, lineHeight:1 }}>{value ?? "—"}</div>
      {sub && <div style={{ fontFamily:"monospace", fontSize:8, color:"#1f2937", marginTop:2 }}>{sub}</div>}
    </div>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────
const TABS = [
  { key:"secrets",   icon:"⚠",  label:"SECRETS",    color:"#ef4444" },
  { key:"endpoints", icon:"🔗", label:"ENDPOINTS",  color:"#60a5fa" },
  { key:"ips",       icon:"🖧",  label:"IPs / HOSTS", color:"#4ade80" },
  { key:"buckets",   icon:"☁",  label:"CLOUD",      color:"#fbbf24" },
  { key:"graphql",   icon:"⬡",  label:"GRAPHQL",    color:"#a78bfa" },
  { key:"maps",      icon:"🗺",  label:"SOURCE MAPS", color:"#f97316" },
  { key:"comments",  icon:"💬", label:"COMMENTS",   color:"#67e8f9" },
];

export default function JSAnalyzerView({ crawlData, savedResults, onResultsChange }) {
  const [results, setResults]       = useState(savedResults || null);
  const [loading, setLoading]       = useState(false);
  const [progress, setProgress]     = useState({ done:0, total:0, phase:"" });
  const [tab, setTab]               = useState("secrets");
  const [epFilter, setEpFilter]     = useState("");
  const [sevFilter, setSevFilter]   = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => { if (savedResults) setResults(savedResults); }, [savedResults]);

  const jsUrls = crawlData?.categories?.js_files || [];

  const run = async () => {
    if (!jsUrls.length) return;
    setLoading(true); setResults(null);
    setProgress({ done:0, total: jsUrls.length, phase:"Fetching JS files…" });
    try {
      const r = await axios.post(`${API}/recon/jsanalyze`, {
        js_urls: jsUrls,
        max_files: 500,
      });
      setResults(r.data);
      onResultsChange?.(r.data);
    } catch {
      setResults({ error:"Analysis failed — check backend logs" });
    }
    setLoading(false);
  };

  // ── Derived data ──────────────────────────────────────────────────────────
  const secrets = results?.all_secrets || [];
  const endpoints = results?.all_endpoints || [];
  const ips = results?.internal_ips || [];
  const hosts = results?.internal_hosts || [];
  const buckets = results?.cloud_buckets || [];
  const graphql = results?.graphql_ops || [];
  const maps = results?.source_maps || [];
  const comments = results?.interesting_comments || [];
  const domains = results?.hardcoded_domains || [];

  const sevCounts = useMemo(() => {
    const c = { critical:0, high:0, medium:0, low:0 };
    secrets.forEach(s => { if(c[s.severity]!==undefined) c[s.severity]++; });
    return c;
  }, [secrets]);

  const secretTypes = useMemo(() => {
    const t = {};
    secrets.forEach(s => { t[s.type] = (t[s.type]||0)+1; });
    return Object.entries(t).sort((a,b)=>b[1]-a[1]);
  }, [secrets]);

  const filteredSecrets = useMemo(() => {
    return secrets.filter(s => {
      if (sevFilter !== "all" && s.severity !== sevFilter) return false;
      if (typeFilter !== "all" && s.type !== typeFilter) return false;
      return true;
    });
  }, [secrets, sevFilter, typeFilter]);

  const filteredEndpoints = useMemo(() => {
    const q = epFilter.toLowerCase();
    const eps = endpoints.filter(ep => !q || ep.toLowerCase().includes(q));
    // Group by prefix
    const api = eps.filter(e => e.match(/\/api\//i));
    const auth = eps.filter(e => e.match(/\/auth\//i));
    const admin = eps.filter(e => e.match(/\/admin\//i));
    const full  = eps.filter(e => e.startsWith("http"));
    const other = eps.filter(e => !api.includes(e) && !auth.includes(e) && !admin.includes(e) && !full.includes(e));
    return { api, auth, admin, full, other, all: eps };
  }, [endpoints, epFilter]);

  // Tab badge counts
  const tabCounts = {
    secrets:   secrets.length,
    endpoints: endpoints.length,
    ips:       ips.length + hosts.length + domains.length,
    buckets:   buckets.length,
    graphql:   graphql.length,
    maps:      maps.length,
    comments:  comments.length,
  };

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Header */}
      <div style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:12, padding:"16px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{ width:7, height:7, borderRadius:"50%",
                background: loading?"#f97316":results&&!results.error?"#22c55e":"#1f2937",
                boxShadow: loading?"0 0 8px #f97316":results&&!results.error?"0 0 8px #22c55e":"none" }}/>
              <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#a78bfa", letterSpacing:"0.15em" }}>
                JS FILE ANALYZER
              </span>
              {results?.files_deduped > 0 && (
                <span style={{ fontFamily:"monospace", fontSize:9, color:"#374151",
                  background:"#0a0c10", border:"1px solid #1f2937", padding:"1px 6px", borderRadius:4 }}>
                  {results.files_deduped} duplicate files skipped
                </span>
              )}
            </div>
            <span style={{ fontFamily:"monospace", fontSize:11, color:"#1f2937" }}>
              {jsUrls.length > 0
                ? `${jsUrls.length} JS files · up to 500 analyzed · entropy-based secret detection`
                : "Run a crawl first to collect JS files"}
            </span>
          </div>
          <button onClick={run} disabled={loading || !jsUrls.length} style={{
            padding:"10px 24px", borderRadius:8, cursor:(loading||!jsUrls.length)?"not-allowed":"pointer",
            fontFamily:"monospace", fontSize:12, fontWeight:700,
            background:loading?"#0d1117":"linear-gradient(135deg,#4c1d95,#6d28d9)",
            border:`1px solid ${loading?"#1f2937":"#7c3aed55"}`,
            color:loading?"#374151":"#fff",
            boxShadow:loading?"none":"0 0 20px #7c3aed22",
          }}>{loading?"ANALYZING…":results?"↺  RE-ANALYZE":"▶  ANALYZE JS FILES"}</button>
        </div>

        {loading && (
          <div style={{ marginTop:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontFamily:"monospace", fontSize:10, color:"#374151" }}>
                {progress.phase || `Processing ${jsUrls.length} JS files (capped at 500 unique)…`}
              </span>
              <span style={{ fontFamily:"monospace", fontSize:10, color:"#a78bfa" }}>{progressPct}%</span>
            </div>
            <div style={{ height:3, background:"#0f1923", borderRadius:99, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${Math.max(5, progressPct)}%`,
                background:"linear-gradient(90deg,#4c1d95,#7c3aed)", borderRadius:99,
                animation: progressPct < 5 ? "pulse 1s infinite" : "none", transition:"width 0.4s" }}/>
            </div>
          </div>
        )}
      </div>

      {results?.error && (
        <div style={{ background:"#100505", border:"1px solid #3b1f1f", borderRadius:8, padding:"12px 16px",
          fontFamily:"monospace", fontSize:12, color:"#f87171" }}>{results.error}</div>
      )}

      {results && !results.error && (
        <>
          {/* Stats grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:6 }}>
            <StatBox label="JS FILES"       value={results.files_analyzed}  color="#6b7280" sub={`of ${results.files_total}`}/>
            <StatBox label="UNIQUE"         value={results.files_analyzed}  color="#9ca3af" sub={`${results.files_deduped} dupes`}/>
            <StatBox label="ENDPOINTS"      value={results.total_endpoints} color="#60a5fa"/>
            <StatBox label="CRITICAL"       value={sevCounts.critical}      color="#ef4444"/>
            <StatBox label="HIGH"           value={sevCounts.high}          color="#f97316"/>
            <StatBox label="TOTAL SECRETS"  value={results.total_secrets}   color={results.total_secrets>0?"#ef4444":"#22c55e"}/>
            <StatBox label="CLOUD BUCKETS"  value={buckets.length}          color="#fbbf24"/>
            <StatBox label="SOURCE MAPS"    value={maps.length}             color={maps.length>0?"#f97316":"#374151"}/>
          </div>

          {/* Tabs */}
          <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
            {TABS.map(t => {
              const count = tabCounts[t.key];
              const isActive = tab === t.key;
              return (
                <button key={t.key} onClick={()=>setTab(t.key)} style={{
                  padding:"7px 14px", borderRadius:6, cursor:"pointer",
                  fontFamily:"monospace", fontSize:10, fontWeight:700, letterSpacing:"0.08em",
                  background: isActive ? t.color+"18" : "transparent",
                  border: `1px solid ${isActive ? t.color+"66" : "#0f1923"}`,
                  color: isActive ? t.color : count>0 ? "#4b5563" : "#1f2937",
                  transition:"all 0.15s",
                }}>
                  {t.icon} {t.label} {count>0 && `(${count})`}
                </button>
              );
            })}
          </div>

          {/* ── Secrets tab ─────────────────────────────────────────────── */}
          {tab === "secrets" && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {/* Filter bar */}
              <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                {/* Severity filters */}
                <div style={{ display:"flex", gap:4 }}>
                  {["all","critical","high","medium","low"].map(sv => {
                    const count = sv==="all" ? secrets.length : sevCounts[sv]||0;
                    const s = sv!=="all" ? SEV[sv] : null;
                    return (
                      <button key={sv} onClick={()=>setSevFilter(sv)} style={{
                        padding:"3px 10px", borderRadius:4, cursor:"pointer",
                        fontFamily:"monospace", fontSize:9, fontWeight:700,
                        background: sevFilter===sv ? (s?s.bg:"#0d1117") : "transparent",
                        border:`1px solid ${sevFilter===sv?(s?s.border:"#374151"):"#0f1923"}`,
                        color: sevFilter===sv ? (s?s.color:"#9ca3af") : "#374151",
                      }}>{sv.toUpperCase()} ({count})</button>
                    );
                  })}
                </div>
                {/* Type filter */}
                {secretTypes.length > 1 && (
                  <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
                    style={{ background:"#050507", border:"1px solid #0f1923", borderRadius:6,
                      padding:"3px 8px", fontFamily:"monospace", fontSize:10, color:"#9ca3af", outline:"none" }}>
                    <option value="all">All Types</option>
                    {secretTypes.map(([t,c])=><option key={t} value={t}>{t} ({c})</option>)}
                  </select>
                )}
              </div>

              {/* Secret cards */}
              <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:480, overflowY:"auto" }}>
                {filteredSecrets.length === 0 ? (
                  <div style={{ padding:40, textAlign:"center", fontFamily:"monospace", fontSize:12, color:"#166534" }}>
                    ✓ No secrets matching this filter
                  </div>
                ) : filteredSecrets.map((s, i) => {
                  const sv = SEV[s.severity] || SEV.medium;
                  return (
                    <div key={i} style={{ background:sv.bg, border:`1px solid ${sv.border}`,
                      borderLeft:`3px solid ${sv.color}`, borderRadius:8, padding:"10px 14px" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, flexWrap:"wrap" }}>
                        <SevBadge severity={s.severity}/>
                        <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:600, color:"#c4b5fd" }}>{s.type}</span>
                        {s.url && (
                          <span style={{ fontFamily:"monospace", fontSize:9, color:"#374151",
                            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:300 }}>
                            {s.url.split("/").slice(-2).join("/")}
                          </span>
                        )}
                      </div>
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8 }}>
                        <code style={{ fontFamily:"monospace", fontSize:12, color:sv.color,
                          wordBreak:"break-all", flex:1 }}>{s.value}</code>
                        <CopyBtn text={s.value}/>
                      </div>
                      {s.context && (
                        <pre style={{ fontFamily:"monospace", fontSize:9, color:"#374151",
                          background:"#030305", border:"1px solid #0f1923", borderRadius:4,
                          padding:"4px 8px", margin:"6px 0 0 0", whiteSpace:"pre-wrap",
                          wordBreak:"break-all", maxHeight:60, overflow:"hidden" }}>{s.context}</pre>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Endpoints tab ────────────────────────────────────────────── */}
          {tab === "endpoints" && (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input value={epFilter} onChange={e=>setEpFilter(e.target.value)}
                  placeholder="Filter endpoints…"
                  style={{ flex:1, background:"#050507", border:"1px solid #0f1923", borderRadius:8,
                    padding:"8px 12px", fontFamily:"monospace", fontSize:12, color:"#67e8f9", outline:"none" }}
                  onFocus={e=>e.target.style.borderColor="#164e63"}
                  onBlur={e=>e.target.style.borderColor="#0f1923"}/>
                <span style={{ fontFamily:"monospace", fontSize:10, color:"#374151" }}>
                  {filteredEndpoints.all.length} shown
                </span>
              </div>

              {/* Grouped endpoint sections */}
              {[
                { key:"api",   label:"API ROUTES",   color:"#60a5fa", list: filteredEndpoints.api },
                { key:"auth",  label:"AUTH ROUTES",  color:"#f97316", list: filteredEndpoints.auth },
                { key:"admin", label:"ADMIN ROUTES", color:"#ef4444", list: filteredEndpoints.admin },
                { key:"full",  label:"FULL URLS",    color:"#fbbf24", list: filteredEndpoints.full },
                { key:"other", label:"OTHER PATHS",  color:"#4b5563", list: filteredEndpoints.other },
              ].filter(g => g.list.length > 0).map(g => (
                <div key={g.key}>
                  <div style={{ fontFamily:"monospace", fontSize:9, color:g.color,
                    letterSpacing:"0.1em", marginBottom:4, padding:"0 4px" }}>
                    {g.label} ({g.list.length})
                  </div>
                  <div style={{ maxHeight:200, overflowY:"auto", border:"1px solid #0f1923", borderRadius:8 }}>
                    {g.list.map((ep, i) => (
                      <div key={ep} style={{ display:"flex", alignItems:"center",
                        justifyContent:"space-between",
                        background: i%2===0?"#08080a":"#050507",
                        borderLeft:`3px solid ${g.color}44`,
                        borderBottom:"1px solid #0a0c0f",
                        padding:"6px 12px 6px 10px" }}>
                        <span style={{ fontFamily:"monospace", fontSize:11, color:g.color,
                          wordBreak:"break-all", flex:1 }}>{ep}</span>
                        <CopyBtn text={ep}/>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── IPs / Hosts tab ──────────────────────────────────────────── */}
          {tab === "ips" && (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {ips.length > 0 && (
                <div>
                  <p style={{ fontFamily:"monospace", fontSize:9, color:"#4ade80",
                    letterSpacing:"0.1em", marginBottom:6 }}>INTERNAL IPs ({ips.length})</p>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {ips.map(ip => (
                      <div key={ip} style={{ display:"flex", alignItems:"center", gap:4,
                        background:"#030d1f", border:"1px solid #1e3a5f", borderRadius:6, padding:"4px 10px" }}>
                        <span style={{ fontFamily:"monospace", fontSize:11, color:"#4ade80" }}>{ip}</span>
                        <CopyBtn text={ip}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {hosts.length > 0 && (
                <div>
                  <p style={{ fontFamily:"monospace", fontSize:9, color:"#67e8f9",
                    letterSpacing:"0.1em", marginBottom:6 }}>INTERNAL HOSTNAMES ({hosts.length})</p>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {hosts.map(h => (
                      <div key={h} style={{ display:"flex", alignItems:"center", gap:4,
                        background:"#00101a", border:"1px solid #164e63", borderRadius:6, padding:"4px 10px" }}>
                        <span style={{ fontFamily:"monospace", fontSize:11, color:"#67e8f9" }}>{h}</span>
                        <CopyBtn text={h}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {domains.length > 0 && (
                <div>
                  <p style={{ fontFamily:"monospace", fontSize:9, color:"#f97316",
                    letterSpacing:"0.1em", marginBottom:6 }}>HARDCODED DOMAINS ({domains.length})</p>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {domains.map(d => (
                      <div key={d} style={{ display:"flex", alignItems:"center", gap:4,
                        background:"#0f0600", border:"1px solid #7c2d12", borderRadius:6, padding:"4px 10px" }}>
                        <span style={{ fontFamily:"monospace", fontSize:11, color:"#f97316" }}>{d}</span>
                        <CopyBtn text={d}/>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {ips.length===0 && hosts.length===0 && domains.length===0 && (
                <div style={{ padding:40, textAlign:"center", fontFamily:"monospace", fontSize:12, color:"#166534" }}>
                  ✓ No internal IPs or hostnames found
                </div>
              )}
            </div>
          )}

          {/* ── Cloud Buckets tab ────────────────────────────────────────── */}
          {tab === "buckets" && (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {buckets.length === 0 ? (
                <div style={{ padding:40, textAlign:"center", fontFamily:"monospace", fontSize:12, color:"#166534" }}>
                  ✓ No cloud bucket URLs found
                </div>
              ) : buckets.map((b, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                  background: i%2===0?"#0f0a00":"#100b00", border:"1px solid #713f12",
                  borderLeft:"3px solid #fbbf24", borderRadius:6, padding:"8px 12px" }}>
                  <a href={b.startsWith("http")?b:undefined} target="_blank" rel="noopener noreferrer"
                    style={{ fontFamily:"monospace", fontSize:11, color:"#fbbf24", wordBreak:"break-all",
                      textDecoration:"none", flex:1 }}>{b}</a>
                  <CopyBtn text={b}/>
                </div>
              ))}
            </div>
          )}

          {/* ── GraphQL tab ─────────────────────────────────────────────── */}
          {tab === "graphql" && (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {graphql.length === 0 ? (
                <div style={{ padding:40, textAlign:"center", fontFamily:"monospace", fontSize:12, color:"#166534" }}>
                  ✓ No GraphQL operations found
                </div>
              ) : graphql.map((op, i) => (
                <div key={i} style={{ background:"#0c0318", border:"1px solid #4c1d95",
                  borderLeft:"3px solid #a78bfa", borderRadius:8, padding:"10px 14px" }}>
                  <pre style={{ fontFamily:"monospace", fontSize:10, color:"#c4b5fd",
                    margin:0, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{op}</pre>
                </div>
              ))}
            </div>
          )}

          {/* ── Source maps tab ──────────────────────────────────────────── */}
          {tab === "maps" && (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {maps.length === 0 ? (
                <div style={{ padding:40, textAlign:"center", fontFamily:"monospace", fontSize:12, color:"#166534" }}>
                  ✓ No source map references found
                </div>
              ) : (
                <>
                  <div style={{ background:"#0f0600", border:"1px solid #7c2d12", borderRadius:8, padding:"10px 14px", marginBottom:6 }}>
                    <p style={{ fontFamily:"monospace", fontSize:10, color:"#f97316", margin:"0 0 4px 0", fontWeight:700 }}>
                      ⚠ Source maps expose original unminified source code
                    </p>
                    <p style={{ fontFamily:"monospace", fontSize:10, color:"#6b7280", margin:0 }}>
                      Fetch the .map files to recover original file structure, comments, and potentially sensitive logic.
                    </p>
                  </div>
                  {maps.map((m, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                      background: i%2===0?"#0f0600":"#100700", border:"1px solid #7c2d12",
                      borderLeft:"3px solid #f97316", borderRadius:6, padding:"8px 12px" }}>
                      <span style={{ fontFamily:"monospace", fontSize:11, color:"#fb923c",
                        wordBreak:"break-all", flex:1 }}>{m}</span>
                      <CopyBtn text={m}/>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── Comments tab ─────────────────────────────────────────────── */}
          {tab === "comments" && (
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {comments.length === 0 ? (
                <div style={{ padding:40, textAlign:"center", fontFamily:"monospace", fontSize:12, color:"#166534" }}>
                  ✓ No interesting comments found
                </div>
              ) : comments.map((c, i) => (
                <div key={i} style={{ background:"#00101a", border:"1px solid #164e63",
                  borderLeft:"3px solid #67e8f9", borderRadius:6, padding:"8px 12px" }}>
                  <pre style={{ fontFamily:"monospace", fontSize:10, color:"#67e8f9",
                    margin:0, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{c}</pre>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!results && !loading && (
        <div style={{ padding:60, display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
          <div style={{ fontFamily:"monospace", fontSize:48, color:"#0f1923" }}>{"{}"}</div>
          <p style={{ fontFamily:"monospace", fontSize:13, color:"#1f2937" }}>
            {jsUrls.length > 0
              ? `${jsUrls.length} JS files ready — click ANALYZE`
              : "No JS files found. Run a crawl first."}
          </p>
          {jsUrls.length > 0 && (
            <p style={{ fontFamily:"monospace", fontSize:10, color:"#111827" }}>
              Detects secrets · endpoints · cloud buckets · GraphQL · source maps · internal IPs
            </p>
          )}
        </div>
      )}
    </div>
  );
}