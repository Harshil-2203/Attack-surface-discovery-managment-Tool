// src/TargetDashboard.jsx
import { useState, useEffect } from "react";
import axios from "axios";

import API from "./Config";

export default function TargetDashboard({ target, results, crawlData, scans, crawls, onNavigate }) {
  const [diff, setDiff]         = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const hasPrevScan = scans && scans.length > 1;
  const latestScan  = scans?.[scans.length - 1];
  const prevScan    = scans?.[scans.length - 2];

  useEffect(() => {
    if (hasPrevScan && latestScan && prevScan) {
      runDiff();
    }
  }, [scans?.length]);

  const runDiff = async () => {
    if (!latestScan || !prevScan) return;
    setDiffLoading(true);
    try {
      const res = await axios.post(`${API}/recon/diff`, {
        old_subdomains: prevScan.subdomains || [],
        new_subdomains: latestScan.subdomains || [],
      });
      setDiff(res.data);
    } catch {}
    finally { setDiffLoading(false); }
  };

  const totalUrls  = crawlData?.total_unique || crawls?.reduce((a, c) => a + (c.total_unique || 0), 0) || 0;
  const aliveCount = results?.alive_count || latestScan?.alive_count || 0;
  const totalFound = results?.total_found || latestScan?.total_found || 0;

  const STAT_CARDS = [
    { label: "Scans Run",         value: scans?.length || 0,     color: "#4ade80", icon: "🔍" },
    { label: "Subdomains Found",  value: totalFound,              color: "#67e8f9", icon: "🌐" },
    { label: "Alive",             value: aliveCount,              color: "#4ade80", icon: "✅" },
    { label: "Crawls Run",        value: crawls?.length || 0,     color: "#d8b4fe", icon: "🕷️" },
    { label: "URLs Collected",    value: totalUrls.toLocaleString(), color: "#fcd34d", icon: "🔗" },
    { label: "Target Age",        value: target?.created_at ? Math.floor((Date.now() - new Date(target.created_at)) / 86400000) + "d" : "—", color: "#fb923c", icon: "📅" },
  ];

  const QUICK_ACTIONS = [
    { label: "List View",    view: "list",   icon: "📋", color: "#166534", disabled: !results },
    { label: "Graph Map",    view: "graph",  icon: "🕸️", color: "#1e40af", disabled: !results },
    { label: "Meta Info",    view: "meta",   icon: "🌐", color: "#0891b2", disabled: !results },
    { label: "Crawl URLs",   view: "crawl",  icon: "🕷️", color: "#7e22ce", disabled: false },
    { label: "Port Scan",    view: "ports",  icon: "🔌", color: "#b45309", disabled: !results },
    { label: "Tech Detect",  view: "tech",   icon: "⚙️", color: "#1d4ed8", disabled: !results },
    { label: "DNS Records",  view: "dns",    icon: "📡", color: "#065f46", disabled: !results },
    { label: "JS Analyzer",  view: "js",     icon: "📜", color: "#6b21a8", disabled: !crawlData },
    { label: "Timeline",     view: "wayback",icon: "⏳", color: "#78350f", disabled: false },
  ];

  return (
    <div className="space-y-6">

      {/* Target info banner */}
      <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 16, padding: "20px 24px" }}>
        <div className="flex items-start justify-between">
          <div>
            <h2 style={{ fontFamily: "monospace", fontSize: 20, color: "#4ade80", fontWeight: "bold" }}>{target?.org_name}</h2>
            <p style={{ fontFamily: "monospace", fontSize: 13, color: "#16a34a", marginTop: 2 }}>{target?.primary_domain}</p>
            <div className="flex gap-4 mt-3">
              {[
                ["Analyst",    target?.analyst_name],
                ["Type",       target?.engagement_type?.replace(/_/g, " ")],
                ["Auth",       target?.auth_level?.replace(/_/g, " ")],
                ["Ref",        target?.target_ref || "—"],
              ].map(([k, v]) => v && (
                <div key={k}>
                  <span style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>{k} </span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#6b7280" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-right">
            <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>TARGET ID</p>
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "#166534" }}>{target?.target_id}</p>
            {target?.start_date && (
              <>
                <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", marginTop: 6 }}>PERIOD</p>
                <p style={{ fontFamily: "monospace", fontSize: 11, color: "#4b5563" }}>{target.start_date} → {target.end_date || "ongoing"}</p>
              </>
            )}
          </div>
        </div>
        {target?.notes && (
          <p style={{ fontFamily: "monospace", fontSize: 12, color: "#374151", marginTop: 12, borderTop: "1px solid #166534", paddingTop: 10 }}>
            {target.notes}
          </p>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3">
        {STAT_CARDS.map(s => (
          <div key={s.label} style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: "14px 18px" }}>
            <div className="flex items-center gap-2 mb-1">
              <span>{s.icon}</span>
              <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151" }}>{s.label.toUpperCase()}</p>
            </div>
            <p style={{ fontFamily: "monospace", fontSize: 26, color: s.color, fontWeight: "bold" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Diff alert */}
      {diff && (diff.added_count > 0 || diff.removed_count > 0) && (
        <div style={{ background: diff.added_count > 0 ? "#0a1c0e" : "#1c0a0a", border: `1px solid ${diff.added_count > 0 ? "#166534" : "#dc2626"}`, borderRadius: 12, padding: "14px 18px" }}>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#4b5563", marginBottom: 8 }}>DIFF — LATEST VS PREVIOUS SCAN</p>
          <div className="flex gap-6">
            <div>
              <span style={{ fontFamily: "monospace", fontSize: 22, color: "#4ade80", fontWeight: "bold" }}>+{diff.added_count}</span>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#166534", marginLeft: 6 }}>new subdomains</span>
            </div>
            <div>
              <span style={{ fontFamily: "monospace", fontSize: 22, color: "#ef4444", fontWeight: "bold" }}>-{diff.removed_count}</span>
              <span style={{ fontFamily: "monospace", fontSize: 11, color: "#7f1d1d", marginLeft: 6 }}>removed</span>
            </div>
          </div>
          {diff.added.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {diff.added.slice(0, 10).map(s => (
                <span key={s} style={{ fontFamily: "monospace", fontSize: 11, color: "#4ade80", background: "#052e16", border: "1px solid #166534", padding: "1px 8px", borderRadius: 4 }}>+{s}</span>
              ))}
              {diff.added.length > 10 && <span style={{ fontFamily: "monospace", fontSize: 11, color: "#374151" }}>+{diff.added.length - 10} more</span>}
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div>
        <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", letterSpacing: "0.1em", marginBottom: 10 }}>QUICK ACCESS</p>
        <div className="grid grid-cols-3 gap-2">
          {QUICK_ACTIONS.map(a => (
            <button
              key={a.view}
              onClick={() => !a.disabled && onNavigate(a.view)}
              disabled={a.disabled}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 16px", borderRadius: 10, cursor: a.disabled ? "not-allowed" : "pointer",
                background: a.disabled ? "#0a0a0a" : "#0f1f0f",
                border: `1px solid ${a.disabled ? "#1f2937" : a.color}33`,
                opacity: a.disabled ? 0.4 : 1, transition: "all 0.2s",
              }}
              onMouseEnter={e => { if (!a.disabled) e.currentTarget.style.borderColor = a.color; }}
              onMouseLeave={e => { if (!a.disabled) e.currentTarget.style.borderColor = `${a.color}33`; }}
            >
              <span style={{ fontSize: 16 }}>{a.icon}</span>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: a.disabled ? "#374151" : "#9ca3af" }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scan history */}
      {scans?.length > 0 && (
        <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 12, padding: "16px 18px" }}>
          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", letterSpacing: "0.1em", marginBottom: 10 }}>SCAN HISTORY</p>
          <div className="space-y-2">
            {[...scans].reverse().slice(0, 5).map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #111827" }}>
                <div>
                  <span style={{ fontFamily: "monospace", fontSize: 12, color: "#86efac" }}>{s.domain}</span>
                  <span style={{ fontFamily: "monospace", fontSize: 11, color: "#374151", marginLeft: 12 }}>{s.alive_count} alive / {s.total_found} found</span>
                </div>
                <span style={{ fontFamily: "monospace", fontSize: 10, color: "#1f2937" }}>
                  {s.saved_at ? new Date(s.saved_at).toLocaleString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}