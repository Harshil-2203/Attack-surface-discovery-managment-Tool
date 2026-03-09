// src/Sidebar.jsx
import React from "react";

const ITEMS = [
  { key: "dashboard", label: "Dashboard",   icon: "⊞",  group: "OVERVIEW",  requiresScan: false },
  { key: "list",      label: "List View",   icon: "≡",  group: "RECON",     requiresScan: true },
  { key: "graph",     label: "Graph Map",   icon: "◈",  group: "RECON",     requiresScan: true,  requiresMapping: true },
  { key: "meta",      label: "Meta Info",   icon: "◎",  group: "RECON",     requiresScan: true },
  { key: "tech",      label: "Tech Detect", icon: "⚙",  group: "RECON",     requiresScan: true },
  { key: "ports",     label: "Port Scan",   icon: "⬡",  group: "RECON",     requiresScan: true },
  { key: "dns",       label: "DNS / WHOIS", icon: "⊛",  group: "RECON",     requiresScan: true },
  { key: "idor",      label: "IDOR Params", icon: "\?", group: "WORKFLOW",  requiresScan: false, requiresCrawl: true },
  { key: "crawl",     label: "Crawl URLs",  icon: "⌖",  group: "CRAWL",     requiresScan: false, isCrawl: true },
  { key: "js",        label: "JS Analyzer", icon: "{}",  group: "CRAWL",    requiresScan: false, requiresCrawl: true },
  { key: "wayback",   label: "Timeline",    icon: "◷",  group: "INTEL",     requiresScan: false },
  { key: "notes",     label: "Notes",       icon: "✎",  group: "WORKFLOW",  requiresScan: false },
];

const GROUP_ACCENT = {
  OVERVIEW: "#4ade80",
  RECON:    "#4ade80",
  CRAWL:    "#a78bfa",
  INTEL:    "#fb923c",
  WORKFLOW: "#60a5fa",
};

export default function Sidebar({
  viewMode, setViewMode, scanDone, mappingReady, mappingLoading,
  crawlData, crawlLoading, theme, onToggleTheme,
  techReady, portReady, dnsReady, jsReady, waybackReady, idorReady,
}) {
  const groups = [...new Set(ITEMS.map(i => i.group))];

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      padding: "12px 8px", overflowY: "auto", gap: 0,
      background: "#070b0f",
    }}>
      {/* Logo row */}
      <div style={{ padding: "4px 8px 16px 8px", borderBottom: "1px solid #0f1923", marginBottom: 8 }}>
        <span style={{ fontFamily: "monospace", fontWeight: 900, fontSize: 13, color: "#4ade80", letterSpacing: "0.15em" }}>ASDMT</span>
      </div>

      {groups.map((group, gi) => {
        const accent = GROUP_ACCENT[group] || "#4ade80";
        return (
          <div key={group} style={{ marginBottom: gi < groups.length - 1 ? 4 : 0 }}>
            {/* Section label */}
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 8px 4px 8px",
            }}>
              <div style={{ width: 14, height: 1, background: accent, opacity: 0.4 }} />
              <span style={{
                fontFamily: "monospace", fontSize: 9, fontWeight: 700,
                color: accent, opacity: 0.5, letterSpacing: "0.18em",
              }}>{group}</span>
            </div>

            {/* Items */}
            {ITEMS.filter(i => i.group === group).map(item => {
              const disabled =
                (item.requiresScan && !scanDone) ||
                (item.requiresMapping && !mappingReady && !mappingLoading) ||
                (item.requiresCrawl && !crawlData);
              const isActive = viewMode === item.key;

              let badge = null;
              if (item.key === "graph" && mappingLoading)
                badge = <span style={{ marginLeft: "auto", fontSize: 9, color: "#60a5fa", fontFamily: "monospace" }}>···</span>;
              else if (item.key === "graph" && mappingReady)
                badge = <span style={{ marginLeft: "auto", fontSize: 10, color: "#4ade80" }}>✓</span>;
              else if (item.key === "meta" && scanDone)
                badge = <span style={{ marginLeft: "auto", fontSize: 10, color: "#4ade80" }}>✓</span>;
              else if (item.key === "tech" && techReady)
                badge = <span style={{ marginLeft: "auto", fontSize: 10, color: "#4ade80" }}>✓</span>;
              else if (item.key === "ports" && portReady)
                badge = <span style={{ marginLeft: "auto", fontSize: 10, color: "#4ade80" }}>✓</span>;
              else if (item.key === "dns" && dnsReady)
                badge = <span style={{ marginLeft: "auto", fontSize: 10, color: "#4ade80" }}>✓</span>;
              else if (item.key === "wayback" && waybackReady)
                badge = <span style={{ marginLeft: "auto", fontSize: 10, color: "#4ade80" }}>✓</span>;
              else if (item.key === "crawl" && crawlLoading)
                badge = <span style={{ marginLeft: "auto", fontSize: 9, color: "#a78bfa", fontFamily: "monospace" }}>···</span>;
              else if (item.key === "crawl" && crawlData)
                badge = (
                  <span style={{
                    marginLeft: "auto", fontSize: 9, fontFamily: "monospace",
                    background: "#2e1065", color: "#c4b5fd",
                    padding: "1px 6px", borderRadius: 10, border: "1px solid #4c1d95",
                  }}>{crawlData.total_unique?.toLocaleString()}</span>
                );
              else if (item.key === "js" && jsReady)
                badge = <span style={{ marginLeft: "auto", fontSize: 10, color: "#4ade80" }}>✓</span>;
              else if (item.key === "idor" && idorReady)
                badge = <span style={{ marginLeft: "auto", fontSize: 10, color: "#4ade80" }}>✓</span>;
              else if (item.key === "js" && crawlData?.categories?.js_files?.length)
                badge = (
                  <span style={{
                    marginLeft: "auto", fontSize: 9, fontFamily: "monospace",
                    background: "#2e1065", color: "#c4b5fd",
                    padding: "1px 6px", borderRadius: 10, border: "1px solid #4c1d95",
                  }}>{crawlData.categories.js_files.length}</span>
                );

              // active accent by group
              const activeBg = {
                OVERVIEW: "#052e16", RECON: "#052e16",
                CRAWL: "#1e1b4b", INTEL: "#1c1007", WORKFLOW: "#0c1a2e",
              }[group] || "#052e16";
              const activeBorder = accent;
              const activeText = accent;

              return (
                <button
                  key={item.key}
                  onClick={() => !disabled && setViewMode(item.key)}
                  disabled={disabled}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    width: "100%", padding: "6px 8px",
                    borderRadius: 7, marginBottom: 1,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.28 : 1,
                    background: isActive ? activeBg : "transparent",
                    border: `1px solid ${isActive ? activeBorder + "60" : "transparent"}`,
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    if (!disabled && !isActive) {
                      e.currentTarget.style.background = "#0d1117";
                      e.currentTarget.style.borderColor = "#1f2937";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.borderColor = "transparent";
                    }
                  }}
                >
                  {/* Icon box */}
                  <div style={{
                    width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isActive ? activeBorder + "22" : "#0d1117",
                    border: `1px solid ${isActive ? activeBorder + "40" : "#1a2332"}`,
                    color: isActive ? activeText : "#374151",
                    fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                    transition: "all 0.15s",
                  }}>
                    {item.icon}
                  </div>

                  <span style={{
                    fontFamily: "monospace", fontSize: 11,
                    color: isActive ? activeText : "#6b7280",
                    fontWeight: isActive ? 600 : 400,
                    transition: "color 0.15s",
                  }}>
                    {item.label}
                  </span>
                  {badge}
                </button>
              );
            })}
          </div>
        );
      })}

      {/* Bottom */}
      <div style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid #0f1923" }}>
        {/* <button
          onClick={onToggleTheme}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", padding: "6px 8px", borderRadius: 7,
            background: "transparent", border: "1px solid transparent",
            cursor: "pointer", transition: "all 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#0d1117"; e.currentTarget.style.borderColor = "#1f2937"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
        >
          <div style={{ width: 22, height: 22, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", background: "#0d1117", border: "1px solid #1a2332", fontSize: 11 }}>
            {theme === "dark" ? "☀" : "☾"}
          </div>
          <span style={{ fontFamily: "monospace", fontSize: 11, color: "#374151" }}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </span>
        </button> */}

        {!scanDone && (
          <div style={{
            marginTop: 8, padding: "6px 10px", borderRadius: 7,
            background: "#0d1117", border: "1px solid #1a2332",
            fontFamily: "monospace", fontSize: 9, color: "#1f2937",
            textAlign: "center", letterSpacing: "0.1em",
          }}>
            SCAN TO UNLOCK
          </div>
        )}
      </div>
    </div>
  );
}