import React, { useState } from "react";

const CAT = {
  parameters:      { icon: "⌘", label: "Parameters",      color: "text-yellow-300", border: "border-yellow-800", bg: "bg-yellow-900/10", badge: "bg-yellow-700" },
  api_paths:       { icon: "⌬", label: "API Paths",       color: "text-blue-300",   border: "border-blue-800",   bg: "bg-blue-900/10",   badge: "bg-blue-700"   },
  admin_paths:     { icon: "⛨", label: "Admin Paths",     color: "text-red-300",    border: "border-red-800",    bg: "bg-red-900/10",    badge: "bg-red-700"    },
  js_files:        { icon: "{}", label: "JS Files",       color: "text-purple-300", border: "border-purple-800", bg: "bg-purple-900/10", badge: "bg-purple-700" },
  sensitive_files: { icon: "✺", label: "Sensitive Files", color: "text-orange-300", border: "border-orange-800", bg: "bg-orange-900/10", badge: "bg-orange-700" },
  endpoints:       { icon: "⊚", label: "Endpoints",       color: "text-cyan-300",   border: "border-cyan-900",   bg: "bg-cyan-900/10",   badge: "bg-cyan-800"   },
  other:           { icon: "◈", label: "Other",           color: "text-gray-400",   border: "border-gray-700",   bg: "bg-gray-800/20",   badge: "bg-gray-700"   },
};
export default function CrawlViewer({ defaultDomain, subdomains = [], crawlData, crawlLoading, onCrawl }) {
  const [mode, setMode]           = useState("domain");   // "domain" | "subdomain"
  const [customDomain, setCustomDomain] = useState(defaultDomain || "");
  const [selectedSub, setSelectedSub]   = useState("");
  const [subSearch, setSubSearch]       = useState("");
  const [activeCat, setActiveCat]       = useState(null);
  const [urlFilter, setUrlFilter]       = useState("");
  const [copied, setCopied]             = useState(null);

  const target = mode === "subdomain" && selectedSub ? selectedSub : customDomain;
  const canStart = !crawlLoading && target.trim();

  const handleStart = () => {
    if (canStart) onCrawl(target.trim());
  };

  const handleCopy = (url) => {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleExport = () => {
    const all = Object.values(crawlData?.categories || {}).flat();
    const blob = new Blob([all.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${crawlData.domain}_urls.txt`;
    a.click();
  };

  const catKeys = Object.keys(crawlData?.categories || {});
  const displayCat = catKeys.includes(activeCat) ? activeCat : catKeys[0] || null;
  const visibleUrls = (crawlData?.categories?.[displayCat] || []).filter(
    u => !urlFilter || u.toLowerCase().includes(urlFilter.toLowerCase())
  );

  const filteredSubs = subdomains.filter(
    s => !subSearch || s.toLowerCase().includes(subSearch.toLowerCase())
  );

  return (
    <div className="space-y-5">

      {/* ── Input panel ────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">

        <div className="flex items-center gap-2">
          {/* <span className="text-xl">🕸</span> */}
          <h3 className="text-base font-semibold text-purple-300">URL Crawler</h3>
          {/* <span className="text-xs text-gray-600 ml-1">— GAU + Waybackurls + Katana</span> */}
        </div>

        {/* Mode tabs */}
        <div className="flex gap-2">
          <TabBtn active={mode === "domain"} onClick={() => setMode("domain")}>
            Enter Domain
          </TabBtn>
          {subdomains.length > 0 && (
            <TabBtn active={mode === "subdomain"} onClick={() => setMode("subdomain")}>
              Pick Subdomain ({subdomains.length})
            </TabBtn>
          )}
        </div>

        {/* Domain input */}
        {mode === "domain" && (
          <input
            type="text"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStart()}
            placeholder="e.g., example.com  or  api.example.com"
            className="w-full px-5 py-3 bg-gray-800 border border-gray-700 rounded-xl text-green-400 placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600 transition"
          />
        )}

        {/* Subdomain picker */}
        {mode === "subdomain" && (
          <div className="space-y-2">
            <input
              type="text"
              value={subSearch}
              onChange={(e) => setSubSearch(e.target.value)}
              placeholder="Search subdomains..."
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-green-400 placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
            />
            <div className="max-h-44 overflow-y-auto space-y-1 pr-1">
              {filteredSubs.map((sub, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedSub(sub)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-mono transition ${
                    selectedSub === sub
                      ? "bg-purple-700 text-white"
                      : "bg-gray-800 text-cyan-400 hover:bg-gray-700"
                  }`}
                >
                  {sub}
                </button>
              ))}
              {filteredSubs.length === 0 && (
                <p className="text-center text-gray-600 text-xs py-3">No matches</p>
              )}
            </div>
            {selectedSub && (
              <p className="text-xs text-purple-300">
                Target: <span className="font-mono">{selectedSub}</span>
              </p>
            )}
          </div>
        )}

        {/* Start button */}
        <button
          onClick={handleStart}
          disabled={!canStart}
          className="w-full py-3 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-800 disabled:text-gray-600 rounded-xl font-semibold text-white transition active:scale-95 text-sm"
        >
          {crawlLoading ? "Crawling... (may take 1–2 min)" : "Start Crawl"}
        </button>

        {crawlLoading && (
          <div>
            <div className="w-full h-1 bg-gray-800 rounded overflow-hidden">
              <div className="h-full bg-purple-500 animate-pulse w-full" />
            </div>
            <p className="text-xs text-gray-600 mt-1.5 text-center animate-pulse">
              Querying Wayback Machine, Common Crawl & crawling live pages…
            </p>
          </div>
        )}
      </div>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {crawlData && !crawlLoading && (
        <>
          {/* Source stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatBadge label="Total Unique"  value={crawlData.total_unique}          color="text-green-300" />
            <StatBadge label="GAU"           value={crawlData.sources?.gau ?? 0}          color="text-blue-300" />
            <StatBadge label="Waybackurls"   value={crawlData.sources?.waybackurls ?? 0}  color="text-yellow-300" />
            <StatBadge label="Katana"        value={crawlData.sources?.katana ?? 0}       color="text-purple-300" />
          </div>

          {/* Zero results state */}
          {crawlData.total_unique === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center space-y-3">
              <p className="text-4xl">😶</p>
              <p className="text-gray-300 font-medium">No URLs returned</p>
              <p className="text-sm text-gray-500">Make sure the tools are installed and in your PATH:</p>
              <div className="bg-black rounded-xl p-4 text-left text-xs font-mono text-gray-500 space-y-1">
                <p>go install github.com/lc/gau/v2/cmd/gau@latest</p>
                <p>go install github.com/tomnomnom/waybackurls@latest</p>
                <p>go install github.com/projectdiscovery/katana/cmd/katana@latest</p>
              </div>
              <p className="text-xs text-gray-600">
                Then add <span className="font-mono text-gray-500">%USERPROFILE%\go\bin</span> to your PATH and restart the backend.
              </p>
            </div>
          )}

          {/* URL browser */}
          {crawlData.total_unique > 0 && (
            <>
              {/* Filter + export row */}
              <div className="flex gap-3">
                <input
                  type="text"
                  placeholder="Filter URLs…"
                  value={urlFilter}
                  onChange={(e) => setUrlFilter(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-xl text-green-400 placeholder-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600"
                />
                <button
                  onClick={handleExport}
                  className="px-4 py-2.5 bg-green-800 hover:bg-green-700 rounded-xl text-sm font-semibold text-white transition"
                >
                  Export TXT
                </button>
              </div>

              {/* Category tabs */}
              <div className="flex flex-wrap gap-2">
                {catKeys.map(cat => {
                  const m = CAT[cat] || CAT.other;
                  return (
                    <button
                      key={cat}
                      onClick={() => { setActiveCat(cat); setUrlFilter(""); }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                        displayCat === cat
                          ? `${m.badge} text-white border-transparent`
                          : "bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700"
                      }`}
                    >
                      {m.icon} {m.label} ({crawlData.categories[cat].length})
                    </button>
                  );
                })}
              </div>

              {/* URL list */}
              {displayCat && (
                <div className={`rounded-2xl border p-4 ${CAT[displayCat]?.bg || "bg-gray-800/20"} ${CAT[displayCat]?.border || "border-gray-700"}`}>
                  <p className="text-xs text-gray-600 mb-3">
                    {Math.min(visibleUrls.length, 500)} of {crawlData.categories[displayCat]?.length} URLs
                    {urlFilter && " (filtered)"}
                  </p>
                  <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                    {visibleUrls.slice(0, 500).map((url, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-gray-900/80 px-3 py-2 rounded-lg hover:bg-gray-800 group transition"
                      >
                        <span className={`text-xs font-mono truncate flex-1 mr-2 ${CAT[displayCat]?.color || "text-cyan-300"}`}>
                          {url}
                        </span>
                        <button
                          onClick={() => handleCopy(url)}
                          className="text-xs text-gray-600 hover:text-green-400 opacity-0 group-hover:opacity-100 transition shrink-0 font-mono"
                        >
                          {copied === url ? "✓" : "copy"}
                        </button>
                      </div>
                    ))}
                    {visibleUrls.length > 500 && (
                      <p className="text-center text-gray-600 text-xs pt-3">
                        Showing first 500 — export to see all {visibleUrls.length}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
        active ? "bg-purple-700 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
      }`}
    >
      {children}
    </button>
  );
}

function StatBadge({ label, value, color }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 text-center">
      <p className="text-gray-600 text-xs mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}