// src/WaybackView.jsx
import { useState, useMemo, useEffect } from "react";
import axios from "axios";

import API from "./Config";

export default function WaybackView({ primaryDomain, subdomains, savedData, onDataChange }) {
  const [timeline, setTimeline]             = useState(savedData || null);
  // Sync when savedData arrives async
  useEffect(() => { if (savedData) setTimeline(savedData); }, [savedData]);
  const [loading, setLoading]               = useState(false);
  const [selected, setSelected]             = useState(null);
  const [snapshots, setSnapshots]           = useState(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [filter, setFilter]                 = useState("");
  const [sortBy, setSortBy]                 = useState("first_seen");

  const run = async () => {
    setLoading(true); setTimeline(null);
    try {
      const r = await axios.get(`${API}/recon/timeline/${primaryDomain}`);
      setTimeline(r.data); onDataChange?.(r.data);
    } catch { setTimeline({ error: "Failed to fetch Wayback data" }); }
    finally { setLoading(false); }
  };

  const loadSnaps = async (sub) => {
    setSelected(sub); setSnapshots(null); setSnapshotLoading(true);
    try {
      const r = await axios.get(`${API}/recon/snapshots/${sub}`);
      setSnapshots(r.data.snapshots || []);
    } catch { setSnapshots([]); }
    finally { setSnapshotLoading(false); }
  };

  const entries = useMemo(() => {
    if (!timeline?.subdomains) return [];
    return Object.entries(timeline.subdomains)
      .filter(([sub]) => !filter || sub.toLowerCase().includes(filter.toLowerCase()))
      .sort((a, b) => sortBy === "first_seen" ? a[1].first_seen - b[1].first_seen : b[1].snapshot_count - a[1].snapshot_count);
  }, [timeline, filter, sortBy]);

  const minYear = entries.length ? Math.min(...entries.map(([, v]) => v.first_seen)) : 2000;
  const maxYear = entries.length ? Math.max(...entries.map(([, v]) => v.last_seen)) : new Date().getFullYear();
  const yearRange = Math.max(maxYear - minYear, 1);

  const yearLabels = useMemo(() => {
    const count = Math.min(yearRange + 1, 8);
    return Array.from({ length: count }, (_, i) => Math.round(minYear + (i * yearRange) / Math.max(count - 1, 1)));
  }, [minYear, maxYear, yearRange]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Header */}
      <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: timeline && !timeline.error ? "#22c55e" : "#1f2937", boxShadow: timeline && !timeline.error ? "0 0 8px #22c55e" : "none" }} />
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 700, color: "#fb923c", letterSpacing: "0.15em" }}>WAYBACK TIMELINE</span>
          </div>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>
            {primaryDomain} · first seen, last seen, snapshot history
          </span>
        </div>
        <button onClick={run} disabled={loading} style={{
          padding: "10px 24px", borderRadius: 8, cursor: loading ? "not-allowed" : "pointer",
          fontFamily: "monospace", fontSize: 12, fontWeight: 700,
          background: loading ? "#0d1117" : "linear-gradient(135deg, #7c2d12, #c2410c)",
          border: `1px solid ${loading ? "#1f2937" : "#fb923c55"}`,
          color: loading ? "#374151" : "#fff", boxShadow: loading ? "none" : "0 0 20px #fb923c22", transition: "all 0.2s",
        }}>{loading ? "FETCHING…" : timeline ? "↺  RE-LOAD" : "▶  LOAD TIMELINE"}</button>
      </div>

      {timeline?.error && <div style={{ background: "#100505", border: "1px solid #3b1f1f", borderRadius: 8, padding: "12px 16px", fontFamily: "monospace", fontSize: 12, color: "#f87171" }}>{timeline.error}</div>}

      {timeline && !timeline.error && (
        <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {[
              { label: "SUBDOMAINS IN ARCHIVE", value: Object.keys(timeline.subdomains).length, color: "#fb923c" },
              { label: "TOTAL SNAPSHOTS",       value: timeline.total_snapshots?.toLocaleString(), color: "#fcd34d" },
              { label: "YEAR RANGE",             value: `${minYear} — ${maxYear}`, color: "#67e8f9" },
            ].map(s => (
              <div key={s.label} style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 10, padding: "10px 14px", borderTop: `2px solid ${s.color}` }}>
                <div style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Main panel */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 10, height: 520 }}>
            {/* Timeline chart */}
            <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid #0f1923", display: "flex", gap: 8, alignItems: "center" }}>
                <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter subdomains…"
                  style={{ flex: 1, background: "#050507", border: "1px solid #0f1923", borderRadius: 6, padding: "6px 10px", fontFamily: "monospace", fontSize: 11, color: "#fb923c", outline: "none" }}
                  onFocus={e => e.target.style.borderColor = "#7c2d12"} onBlur={e => e.target.style.borderColor = "#0f1923"} />
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  style={{ background: "#050507", border: "1px solid #0f1923", borderRadius: 6, padding: "6px 10px", fontFamily: "monospace", fontSize: 10, color: "#6b7280", outline: "none" }}>
                  <option value="first_seen">Sort: First Seen</option>
                  <option value="snapshots">Sort: Snapshots</option>
                </select>
              </div>

              {/* Year axis */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 14px 4px calc(14px + 130px)" }}>
                {yearLabels.map(y => <span key={y} style={{ fontFamily: "monospace", fontSize: 9, color: "#1f2937" }}>{y}</span>)}
              </div>

              {/* Rows */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {entries.slice(0, 150).map(([sub, v]) => {
                  const startPct = ((v.first_seen - minYear) / yearRange) * 100;
                  const widthPct = Math.max(((v.last_seen - v.first_seen) / yearRange) * 100, 1.5);
                  const isOld = v.first_seen <= 2015;
                  const isSel = selected === sub;
                  return (
                    <div key={sub}
                      onClick={() => loadSnaps(sub)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                        padding: "4px 14px", background: isSel ? "#0f0b00" : "transparent",
                        borderBottom: "1px solid #0a0c0f", transition: "background 0.12s",
                      }}
                      onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = "#0a0d10"; }}
                      onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                      {/* Label */}
                      <div style={{ width: 130, flexShrink: 0 }}>
                        <p style={{ fontFamily: "monospace", fontSize: 10, color: isSel ? "#fb923c" : "#4b5563", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: 0 }}>
                          {sub.replace(`.${primaryDomain}`, "")}
                        </p>
                      </div>
                      {/* Bar */}
                      <div style={{ flex: 1, height: 10, background: "#0f1923", borderRadius: 99, overflow: "hidden", position: "relative" }}>
                        <div style={{
                          position: "absolute", left: `${startPct}%`, width: `${widthPct}%`,
                          height: "100%", borderRadius: 99, minWidth: 4,
                          background: isSel ? "#f97316" : isOld ? "#7c3aed" : "#0891b2",
                          opacity: isSel ? 1 : 0.7,
                        }} />
                      </div>
                      {/* Count */}
                      <span style={{ fontFamily: "monospace", fontSize: 9, color: "#1f2937", width: 40, textAlign: "right", flexShrink: 0 }}>
                        {v.snapshot_count.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Legend */}
              <div style={{ padding: "8px 14px", borderTop: "1px solid #0f1923", display: "flex", gap: 16 }}>
                {[["#7c3aed", "First seen ≤ 2015"], ["#0891b2", "Recent"], ["#f97316", "Selected"]].map(([c, l]) => (
                  <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <div style={{ width: 10, height: 4, background: c, borderRadius: 2 }} />
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "#374151" }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Snapshot panel */}
            <div style={{ background: "#080c10", border: "1px solid #0f1923", borderRadius: 12, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {selected && timeline.subdomains[selected] ? (
                <>
                  <div style={{ padding: "12px 14px", borderBottom: "1px solid #0f1923" }}>
                    <p style={{ fontFamily: "monospace", fontSize: 11, color: "#fb923c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", margin: "0 0 8px" }}>{selected}</p>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {[["FIRST SEEN", timeline.subdomains[selected].first_seen, "#4ade80"],
                        ["LAST SEEN",  timeline.subdomains[selected].last_seen,  "#fb923c"],
                        ["SNAPSHOTS",  timeline.subdomains[selected].snapshot_count.toLocaleString(), "#67e8f9"],
                        ["ACTIVE YRS", timeline.subdomains[selected].years_active?.length || "—", "#d8b4fe"]
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ background: "#050507", borderRadius: 6, padding: "6px 8px" }}>
                          <p style={{ fontFamily: "monospace", fontSize: 8, color: "#374151", marginBottom: 2 }}>{l}</p>
                          <p style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: c, margin: 0 }}>{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p style={{ fontFamily: "monospace", fontSize: 9, color: "#374151", letterSpacing: "0.1em", padding: "8px 14px 4px" }}>RECENT SNAPSHOTS</p>
                  <div style={{ flex: 1, overflowY: "auto" }}>
                    {snapshotLoading && <p style={{ fontFamily: "monospace", fontSize: 11, color: "#374151", padding: "12px 14px" }}>Loading…</p>}
                    {snapshots?.map((s, i) => (
                      <a key={i} href={s.wayback_url} target="_blank" rel="noopener noreferrer"
                        style={{ display: "block", padding: "8px 14px", borderBottom: "1px solid #0a0c0f", textDecoration: "none", transition: "background 0.12s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#0f0b00"}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontFamily: "monospace", fontSize: 10, color: "#6b7280" }}>{s.timestamp}</span>
                          <span style={{ fontFamily: "monospace", fontSize: 10, color: s.status === "200" ? "#22c55e" : "#f97316" }}>{s.status}</span>
                        </div>
                      </a>
                    ))}
                    {snapshots?.length === 0 && <p style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937", padding: "12px 14px" }}>No snapshots found</p>}
                  </div>
                </>
              ) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <div style={{ fontFamily: "monospace", fontSize: 36, color: "#0f1923" }}>◷</div>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937" }}>Click a subdomain</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {!timeline && !loading && (
        <div style={{ padding: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "monospace", fontSize: 48, color: "#0f1923" }}>◷</div>
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#1f2937" }}>Load the Wayback Machine timeline for {primaryDomain}</p>
        </div>
      )}
    </div>
  );
}