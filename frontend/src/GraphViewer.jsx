import { useEffect, useRef, useState } from "react";
import Cytoscape from "cytoscape";
import COSEBilkent from "cytoscape-cose-bilkent";

Cytoscape.use(COSEBilkent);

export default function GraphViewer({ domain, clusters, onSave, meta }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  const [selectedNode, setSelectedNode] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [expandedCluster, setExpandedCluster] = useState(null);
  const [clusterNames, setClusterNames] = useState({});
  const [copiedSub, setCopiedSub] = useState(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopySub = (sub) => {
    navigator.clipboard.writeText(sub);
    setCopiedSub(sub);
    setTimeout(() => setCopiedSub(null), 1500);
  };

  const handleCopyAll = (subs) => {
    navigator.clipboard.writeText(subs.join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  // Generate meaningful category names from subdomains
  const generateCategoryName = (subdomains) => {
    if (!subdomains || subdomains.length === 0) return "Miscellaneous";

    const keywords = {
      api: ["api", "v1", "v2", "v3", "rest", "graphql", "endpoint"],
      email: ["mail", "smtp", "pop", "imap", "email"],
      admin: ["admin", "panel", "dashboard", "management", "console", "backend"],
      development: ["dev", "development", "staging", "stage", "test", "qa", "uat", "sandbox"],
      web: ["www", "web", "site", "pages", "app", "application"],
      cdn: ["cdn", "cache", "static", "assets", "media"],
      database: ["db", "database", "sql", "mysql", "postgres", "mongodb"],
      security: ["sec", "security", "firewall", "waf", "vpn"],
      monitoring: ["monitor", "analytics", "logs", "metrics", "grafana", "prometheus"],
      messaging: ["msg", "chat", "queue", "kafka", "rabbitmq"],
    };

    const prefixCounts = {};
    const keywordMatches = { ...Object.fromEntries(Object.keys(keywords).map(k => [k, 0])) };

    // Extract prefixes and count keyword matches
    subdomains.slice(0, 20).forEach((sub) => {
      const parts = sub.split(".")[0].toLowerCase();

      // Count keyword matches
      Object.entries(keywords).forEach(([category, keys]) => {
        if (keys.some((key) => parts.includes(key))) {
          keywordMatches[category]++;
        }
      });

      // Count prefix occurrences
      prefixCounts[parts] = (prefixCounts[parts] || 0) + 1;
    });

    // Find dominant keyword
    const topKeyword = Object.entries(keywordMatches).reduce((a, b) =>
      b[1] > a[1] ? b : a
    )[0];

    // Map keywords to categories
    const categoryMap = {
      api: "API Services",
      email: "Email Services",
      admin: "Admin Panels",
      development: "Development/Staging",
      web: "Web Services",
      cdn: "CDN & Media",
      database: "Database Services",
      security: "Security & VPN",
      monitoring: "Monitoring & Logs",
      messaging: "Messaging & Queue",
    };

    if (keywordMatches[topKeyword] > 0) {
      return categoryMap[topKeyword];
    }

    // Fallback: use most common prefix
    const topPrefix = Object.entries(prefixCounts).reduce((a, b) =>
      b[1] > a[1] ? b : a
    )[0];

    return topPrefix.charAt(0).toUpperCase() + topPrefix.slice(1) + " Services";
  };

  // Generate and cache category names when clusters change
  useEffect(() => {
    if (clusters) {
      const names = {};
      Object.entries(clusters).forEach(([clusterId, subs]) => {
        names[clusterId] = generateCategoryName(subs);
      });
      setClusterNames(names);
    }
  }, [clusters]);

  // 🚀 GRAPH INITIALIZATION
  useEffect(() => {
    if (!containerRef.current || !clusters || !domain) return;

    // Destroy safely if exists
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }

    const nodes = [];
    const edges = [];

    // Root Node
    nodes.push({
      data: { id: domain, label: domain, type: "root" },
    });

    // Cluster Nodes
    Object.entries(clusters).forEach(([clusterId, subs]) => {
      const groupNode = `group_${clusterId}`;
      const categoryName = clusterNames[clusterId] || `Category ${clusterId}`;

      nodes.push({
        data: {
          id: groupNode,
          label: `${categoryName}\n(${subs.length})`,
          type: "group",
          category: clusterId,
          categoryName: categoryName,
          subdomain_count: subs.length,
        },
      });

      edges.push({
        data: { source: domain, target: groupNode },
      });
    });

    const cy = Cytoscape({
      container: containerRef.current,
      elements: [...nodes, ...edges],
    style: [
  {
    selector: "node",
    style: {
      label: "data(label)",
      "text-wrap": "wrap",
      "text-max-width": "140px",
      "text-valign": "center",
      "text-halign": "center",
      "background-color": "#8b5cf6",
      color: "#ffffff",
      "font-size": 13,
      "padding": "12px",
      "shape": "round-rectangle",
      width: "label",
      height: "label",
      "min-width": "120px",
      "min-height": "60px",
    },
  },
  {
    selector: 'node[type="root"]',
    style: {
      "background-color": "#10b981",
      "font-size": 15,
      "font-weight": "bold",
      "min-width": "160px",
      "min-height": "80px",
    },
  },
  {
    selector: 'node[type="group"]',
    style: {
      "background-color": "#3b82f6",
      "border-width": 2,
      "border-color": "#60a5fa",
      "font-size": 14,
      "padding": "16px",
      "min-width": "180px",
      "min-height": "90px",
    },
  },
  {
    selector: "node:selected",
    style: {
      "background-color": "#fbbf24",
      "border-width": 3,
      "border-color": "#f59e0b",
    },
  },
  {
    selector: "edge",
    style: {
      "line-color": "#666",
      width: 2,
      "target-arrow-color": "#666",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
    },
  },
],
      layout: {
        name: "cose-bilkent",
        animate: false,
        fit: true,
        padding: 50,
      },
    });

    cyRef.current = cy;

    // Click Handler
    cy.on("tap", (event) => {
      const node = event.target;
      if (node.isNode()) {
        const nodeData = node.data();

        if (nodeData.type === "group") {
          setExpandedCluster(nodeData.category);
          setModalOpen(true);
        }

        setSelectedNode(nodeData);
      } else {
        setSelectedNode(null);
      }
    });

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy();
        cyRef.current = null;
      }
    };
  }, [clusters, domain, clusterNames]);

  // Save mapping
  const handleSave = async () => {
    if (!cyRef.current) return;

    const mapping = {};
    cyRef.current.nodes().forEach((node) => {
      const data = node.data();
      if (data.type === "subdomain") {
        mapping[data.id] = data.group || "ungrouped";
      }
    });

    if (onSave) await onSave(mapping);
  };

  if (!clusters || Object.keys(clusters).length === 0) {
    return (
      <div className="bg-gray-900 p-6 rounded border border-gray-700 text-gray-400">
        No cluster data available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 bg-gray-900 p-4 rounded border border-gray-700">
      {/* Graph Container */}
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "600px",
          backgroundColor: "#000000",
        }}
        className="rounded border border-gray-700"
      />

      {/* Modal */}
      {modalOpen &&
        expandedCluster !== null &&
        clusters?.[expandedCluster] && (
          <div className="fixed inset-0 flex items-center justify-center z-50 backdrop-blur-sm bg-black/20">
            <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 max-w-2xl w-full mx-4 max-h-96 overflow-auto">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-green-400">
                  {clusterNames[expandedCluster] || `Category ${expandedCluster}`} — Subdomains ({clusters[expandedCluster].length})
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyAll(clusters[expandedCluster])}
                    className="text-xs font-mono px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-green-700 text-gray-400 hover:text-green-400 rounded-lg transition-all"
                  >
                    {copiedAll ? "✓ Copied all" : "Copy all"}
                  </button>
                  <button
                    onClick={() => setModalOpen(false)}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {clusters[expandedCluster].map((subdomain, index) => {
                  const m = meta && meta[subdomain] ? meta[subdomain] : null;
                  return (
                    <div
                      key={index}
                      className="group bg-gray-800 p-3 rounded border border-gray-700 hover:border-cyan-400 transition"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="flex items-center gap-2">
                            <p className="text-cyan-400 font-mono text-sm truncate">{subdomain}</p>
                            <button
                              onClick={() => handleCopySub(subdomain)}
                              className="shrink-0 text-xs font-mono text-gray-600 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-all"
                            >
                              {copiedSub === subdomain ? "✓" : "copy"}
                            </button>
                          </div>
                          <p className="text-sm text-gray-300">{m && m.title ? m.title : ''}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm text-green-300">{m ? (m.status_code || m.error) : '—'}</div>
                          <div className="text-xs text-gray-400">{m && m.final_url ? m.final_url : ''}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      {/* Info Panel */}
      <div className="bg-gray-800 p-3 rounded">
        <h4 className="font-semibold text-cyan-400 mb-2">Selected Node</h4>
        {selectedNode ? (
          <div className="text-sm text-gray-300 space-y-1">
            <p className="text-yellow-400 font-mono">
              {selectedNode.categoryName || selectedNode.id}
            </p>
            <p>Type: {selectedNode.type}</p>
            {selectedNode.type === "group" && (
              <p>Subdomains: {selectedNode.subdomain_count}</p>
            )}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            Click a category to view subdomains
          </p>
        )}
      </div>

      {/* Save Button */}
      <div className="bg-gray-800 p-3 rounded">
        <button
          onClick={handleSave}
          className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-semibold text-white"
        >
          Save Mapping
        </button>
      </div>
    </div>
  );
}