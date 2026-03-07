// src/DNSView.jsx
import { useState, useMemo, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";

const REC = {
  A:     { color: "#4ade80", bg: "#00100a", border: "#166534" },
  AAAA:  { color: "#60a5fa", bg: "#00080f", border: "#1e3a5f" },
  CNAME: { color: "#d8b4fe", bg: "#0e0010", border: "#4c1d95" },
  MX:    { color: "#fcd34d", bg: "#0f0b00", border: "#854d0e" },
  TXT:   { color: "#67e8f9", bg: "#00100f", border: "#164e63" },
  NS:    { color: "#fb923c", bg: "#0f0800", border: "#7c2d12" },
};

function RecTag({ type }) {
  const c = REC[type] || { color: "#6b7280", bg: "#0a0c10", border: "#1f2937" };
  return <span style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color, padding: "1px 7px", borderRadius: 4, fontFamily: "monospace", fontSize: 10, fontWeight: 700 }}>{type}</span>;
}

export default function DNSView({ subdomains, primaryDomain, savedDns, savedWhois, onDnsChange, onWhoisChange }) {
  const [dnsResults, setDnsResults]       = useState(savedDns || null);
  const [whoisData, setWhoisData]         = useState(savedWhois || null);
  // Sync when saved data arrives async
  useEffect(() => {
    if (savedDns) { setDnsResults(savedDns); if (!selected) setSelected(Object.keys(savedDns)[0] || null); }
  }, [savedDns]);
  useEffect(() => { if (savedWhois) setWhoisData(savedWhois); }, [savedWhois]);
  const [loading, setLoading]             = useState(false);
  const [whoisLoading, setWhoisLoading]   = useState(false);
  const [selected, setSelected]           = useState(savedDns ? Object.keys(savedDns)[0] || null : null);
  const [filter, setFilter]               = useState("");
  const [progress, setProgress]           = useState(0);
  const [tab, setTab]                     = useState("dns");

  const runDNS = async () => {
    if (!subdomains.length) return;
    setLoading(true); setDnsResults(null); setProgress(0);
    const batch = 20; const all = {};
    for (let i = 0; i < subdomains.length; i += batch) {
      try {
        const res = await axios.post(`${API}/recon/dns/bulk`, { subdomains: subdomains.slice(i, i + batch) });
        Object.assign(all, res.data);
      } catch {}
      setProgress(Math.round(Math.min(((i + batch) / subdomains.length) * 100, 100)));
    }
    setDnsResults(all); onDnsChange?.(all); setLoading(false);
    if (!selected && Object.keys(all).length > 0) setSelected(Object.keys(all)[0]);
  };

  const runWhois = async () => {
    setWhoisLoading(true);
    try {
      const r = await axios.get(`${API}/recon/whois/${primaryDomain}`);
      setWhoisData(r.data); onWhoisChange?.(r.data);
    } catch { setWhoisData({ error: "WHOIS lookup failed" }); }
    finally { setWhoisLoading(false); }
  };

  const filtered = useMemo(() => {
    if (!dnsResults) return [];
    return Object.entries(dnsResults).filter(([sub]) => !filter || sub.toLowerCase().includes(filter.toLowerCase()));
  }, [dnsResults, filter]);

  const sel = selected && dnsResults?.[selected];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6 }}>
        {[{ key: "dns", label: "DNS RECORDS", icon: "📡" }, { key: "whois", label: "WHOIS LOOKUP", icon: "📋" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontFamily: "monospace", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em",
            background: tab === t.key ? "#080c10" : "transparent",
            border: `1px solid ${tab === t.key ? "#166534" : "#0f1923"}`,
            color: tab === t.key ? "#4ade80" : "#374151", transition: "all 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* DNS tab */}
      {tab === "dns" && (
        <>
          <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: dnsResults ? "#22c55e" : "#1f2937", boxShadow: dnsResults ? "0 0 8px #22c55e" : "none" }} />
                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#4ade80", letterSpacing: "0.15em" }}>DNS RECORDS</span>
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>A · AAAA · CNAME · MX · TXT · NS · {subdomains.length} subdomains</span>
            </div>
            <button onClick={runDNS} disabled={loading} style={{
              padding: "10px 24px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
              fontFamily: "monospace", fontSize: 12, fontWeight: 700,
              background: loading ? "#0d1117" : "linear-gradient(135deg, #166534, #15803d)",
              border: `1px solid ${loading ? "#1f2937" : "#22c55e55"}`,
              color: loading ? "#374151" : "#fff", boxShadow: loading ? "none" : "0 0 20px #22c55e22", transition: "all 0.2s",
            }}>{loading ? `RESOLVING ${progress}%` : dnsResults ? "↺  RE-FETCH DNS" : "▶  FETCH DNS"}</button>
          </div>

          {loading && (
            <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 8, padding: "10px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>Resolving DNS records…</span>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#4ade80" }}>{progress}%</span>
              </div>
              <div style={{ height: 3, background: "#0f1923", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, #166534, #22c55e)", transition: "width 0.3s" }} />
              </div>
            </div>
          )}

          {dnsResults && (
            <>
              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6 }}>
                {Object.entries(REC).map(([type, c]) => {
                  const count = Object.values(dnsResults).filter(r => r[type]?.length > 0).length;
                  return (
                    <div key={type} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: "8px 12px", borderTop: `2px solid ${c.color}` }}>
                      <div style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", marginBottom: 3 }}>{type} RECORDS</div>
                      <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 800, color: c.color, lineHeight: 1 }}>{count}</div>
                    </div>
                  );
                })}
              </div>

              {/* Split panel */}
              <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 10, height: 480 }}>
                {/* Left list */}
                <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ padding: "10px 12px", borderBottom: "1px solid #0f1923" }}>
                    <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter…"
                      style={{ width: "100%", boxSizing: "border-box", background: "#050507", border: "1px solid #0f1923", borderRadius: 6, padding: "6px 10px", fontFamily: "monospace", fontSize: 11, color: "#86efac", outline: "none" }}
                      onFocus={e => e.target.style.borderColor = "#166534"} onBlur={e => e.target.style.borderColor = "#0f1923"} />
                  </div>
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {filtered.map(([sub, r]) => {
                      const types = Object.keys(REC).filter(t => r[t]?.length > 0);
                      return (
                        <button key={sub} onClick={() => setSelected(sub)} style={{
                          width: "100%", textAlign: "left", padding: "9px 12px",
                          background: selected === sub ? "#050e05" : "transparent",
                          borderTop: "none", borderRight: "none",
                          borderBottom: "1px solid #0a0c0f",
                          borderLeft: `3px solid ${selected === sub ? "#4ade80" : "transparent"}`,
                          cursor: "pointer",
                        }}
                          onMouseEnter={e => { if (selected !== sub) e.currentTarget.style.background = "#0a0d10"; }}
                          onMouseLeave={e => { if (selected !== sub) e.currentTarget.style.background = "transparent"; }}>
                          <p style={{ fontFamily: "monospace", fontSize: 11, color: selected === sub ? "#67e8f9" : "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{sub}</p>
                          <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                            {types.map(t => <RecTag key={t} type={t} />)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right detail */}
                <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {sel ? (
                    <>
                      <div style={{ padding: "12px 18px", borderBottom: "1px solid #0f1923" }}>
                        <a href={`https://${selected}`} target="_blank" rel="noopener noreferrer"
                          style={{ fontFamily: "monospace", fontSize: 13, color: "#67e8f9", textDecoration: "none" }}
                          onMouseEnter={e => e.target.style.textDecoration = "underline"} onMouseLeave={e => e.target.style.textDecoration = "none"}>
                          {selected}
                        </a>
                        {sel.error && <p style={{ fontFamily: "monospace", fontSize: 10, color: "#f87171", marginTop: 4 }}>{sel.error}</p>}
                      </div>
                      <div style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                        {Object.entries(REC).map(([type, c]) => {
                          const records = sel[type];
                          if (!records?.length) return null;
                          return (
                            <div key={type} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 8, padding: "10px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                                <RecTag type={type} />
                                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>{records.length} record{records.length > 1 ? "s" : ""}</span>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                {type === "MX"
                                  ? records.map((r, i) => (
                                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                                        <span style={{ fontFamily: "monospace", fontSize: 10, color: c.color, background: "#0f0b00", padding: "1px 6px", borderRadius: 3 }}>{r.priority}</span>
                                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#e2e8f0" }}>{r.host}</span>
                                      </div>
                                    ))
                                  : records.map((r, i) => (
                                      <p key={i} style={{ fontFamily: "monospace", fontSize: 12, color: "#e2e8f0", wordBreak: "break-all", margin: 0 }}>{r}</p>
                                    ))
                                }
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>
                      Select a subdomain to view DNS records
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {!dnsResults && !loading && (
            <div style={{ padding: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ fontFamily: "monospace", fontSize: 48, color: "#0f1923" }}>📡</div>
              <p style={{ fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>Click FETCH DNS to resolve records for {subdomains.length} subdomains</p>
            </div>
          )}
        </>
      )}

      {/* WHOIS tab */}
      {tab === "whois" && (
        <>
          <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: whoisData && !whoisData.error ? "#22c55e" : "#1f2937", boxShadow: whoisData && !whoisData.error ? "0 0 8px #22c55e" : "none" }} />
                <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#4ade80", letterSpacing: "0.15em" }}>WHOIS LOOKUP</span>
              </div>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>{primaryDomain} · registrar, dates, nameservers</span>
            </div>
            <button onClick={runWhois} disabled={whoisLoading} style={{
              padding: "10px 24px", borderRadius: 8, cursor: whoisLoading ? "not-allowed" : "pointer",
              fontFamily: "monospace", fontSize: 12, fontWeight: 700,
              background: whoisLoading ? "#0d1117" : "linear-gradient(135deg, #166534, #15803d)",
              border: `1px solid ${whoisLoading ? "#1f2937" : "#22c55e55"}`,
              color: whoisLoading ? "#374151" : "#fff", boxShadow: whoisLoading ? "none" : "0 0 20px #22c55e22", transition: "all 0.2s",
            }}>{whoisLoading ? "LOOKING UP…" : whoisData ? "↺  RE-LOOKUP" : "▶  WHOIS LOOKUP"}</button>
          </div>

          {whoisData && (
            whoisData.error
              ? <div style={{ background: "#100505", border: "1px solid #3b1f1f", borderRadius: 10, padding: "14px 18px", fontFamily: "monospace", fontSize: 12, color: "#f87171" }}>{whoisData.error}</div>
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                    {[["REGISTRAR", whoisData.registrar], ["ORGANIZATION", whoisData.org], ["COUNTRY", whoisData.country], ["CREATED", whoisData.created], ["EXPIRES", whoisData.expires], ["UPDATED", whoisData.updated]].map(([k, v]) => (
                      <div key={k} style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 8, padding: "10px 14px" }}>
                        <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 4 }}>{k}</p>
                        <p style={{ fontFamily: "monospace", fontSize: 13, color: "#86efac", margin: 0 }}>{v || "—"}</p>
                      </div>
                    ))}
                  </div>
                  {whoisData.nameservers?.length > 0 && (
                    <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 10, padding: "12px 16px" }}>
                      <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 8 }}>NAMESERVERS</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {whoisData.nameservers.map(ns => (
                          <span key={ns} style={{ fontFamily: "monospace", fontSize: 11, color: "#67e8f9", background: "#00100f", border: "1px solid #164e63", padding: "2px 9px", borderRadius: 4 }}>{ns}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {whoisData.status?.length > 0 && (
                    <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 10, padding: "12px 16px" }}>
                      <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 8 }}>STATUS</p>
                      {whoisData.status.slice(0, 6).map((s, i) => (
                        <p key={i} style={{ fontFamily: "monospace", fontSize: 11, color: "#4b5563", margin: "2px 0" }}>{s}</p>
                      ))}
                    </div>
                  )}
                </div>
              )
          )}
          {!whoisData && !whoisLoading && (
            <div style={{ padding: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ fontFamily: "monospace", fontSize: 48, color: "#0f1923" }}>📋</div>
              <p style={{ fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>Click WHOIS LOOKUP to query registration data for {primaryDomain}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}