// src/TargetManager.jsx
// Shown on every page load — lets user create new target or reopen existing one
// Persists recent targets in localStorage so reloading never loses work

import { useState, useEffect, useRef } from "react";
import axios from "axios";

const API = "http://localhost:8000";
const RECENT_KEY = "asdmt_recent_targets";

// ── localStorage helpers ──────────────────────────────────────────────────────
function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
  catch { return []; }
}
export function saveRecent(meta) {
  const list = getRecent().filter(t => t.target_folder !== meta.target_folder);
  localStorage.setItem(RECENT_KEY, JSON.stringify([meta, ...list].slice(0, 10)));
}

// ── Boot animation ────────────────────────────────────────────────────────────
function BootScreen({ onDone }) {
  const LINES = [
    { t: "ASDMT v2.0  —  Attack Surface Discovery & Management",  c: "#4ade80" },
    { t: "Authorized Use Only // All activity is logged",          c: "#374151" },
    { t: "─────────────────────────────────────────────────────",  c: "#1f2937" },
    { t: "[ OK ]  Subdomain discovery engines ........... ready",  c: "#6b7280" },
    { t: "[ OK ]  URL crawl engines (gau/wayback/katana). ready",  c: "#6b7280" },
    { t: "[ OK ]  Graph analysis module .................. ready",  c: "#6b7280" },
    { t: "[ OK ]  Target storage system .................. ready",  c: "#6b7280" },
    { t: "─────────────────────────────────────────────────────",  c: "#1f2937" },
    { t: "System ready. Select an option below.",                   c: "#4ade80" },
  ];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (shown >= LINES.length) { setTimeout(onDone, 300); return; }
    const delay = shown === 0 ? 0 : shown < 3 ? 120 : 180;
    const t = setTimeout(() => setShown(s => s + 1), delay);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <div className="min-h-screen bg-black flex flex-col justify-center items-center p-8">
      <div className="w-full max-w-xl font-mono text-sm space-y-1">
        {LINES.slice(0, shown).map((l, i) => (
          <div key={i} style={{ color: l.c }}>{l.t}</div>
        ))}
        {shown < LINES.length && <span style={{ color: "#4ade80" }} className="animate-pulse">▊</span>}
      </div>
    </div>
  );
}

// ── Shared field components ───────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, hint, type = "text" }) {
  return (
    <div className="space-y-1">
      <label style={{ fontSize: 10, color: "#16a34a", letterSpacing: "0.1em", fontFamily: "monospace", textTransform: "uppercase", display: "block" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", background: "#000", border: "1px solid #1f2937",
          borderRadius: 6, padding: "8px 12px", color: "#86efac",
          fontFamily: "monospace", fontSize: 13, outline: "none", boxSizing: "border-box",
        }}
        onFocus={e => e.target.style.borderColor = "#166534"}
        onBlur={e => e.target.style.borderColor = "#1f2937"}
      />
      {hint && <p style={{ fontSize: 11, color: "#374151", fontFamily: "monospace" }}>{hint}</p>}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div className="space-y-1">
      <label style={{ fontSize: 10, color: "#16a34a", letterSpacing: "0.1em", fontFamily: "monospace", textTransform: "uppercase", display: "block" }}>
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: "100%", background: "#000", border: "1px solid #1f2937",
          borderRadius: 6, padding: "8px 12px", color: "#86efac",
          fontFamily: "monospace", fontSize: 13, outline: "none", appearance: "none",
        }}
      >
        <option value="">— SELECT —</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

// ── Folder input with live validation ────────────────────────────────────────
function FolderInput({ value, onChange, onValidate, status }) {
  return (
    <div className="space-y-1">
      <label style={{ fontSize: 10, color: "#16a34a", letterSpacing: "0.1em", fontFamily: "monospace", textTransform: "uppercase", display: "block" }}>
        Save Folder *
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={navigator.platform.includes("Win") ? "C:\\Targets\\Acme" : "/home/user/targets/acme"}
          style={{
            flex: 1, background: "#000",
            border: `1px solid ${status === "ok" ? "#166534" : status === "err" ? "#7f1d1d" : "#1f2937"}`,
            borderRadius: 6, padding: "8px 12px", color: "#86efac",
            fontFamily: "monospace", fontSize: 13, outline: "none",
          }}
        />
        <button
          onClick={() => onValidate(value)}
          style={{
            padding: "8px 14px", background: "#111827", border: "1px solid #374151",
            borderRadius: 6, color: "#9ca3af", fontFamily: "monospace", fontSize: 12,
            cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          Verify
        </button>
      </div>
      <p style={{ fontSize: 11, fontFamily: "monospace", color: status === "ok" ? "#166534" : status === "err" ? "#dc2626" : "#374151" }}>
        {status === "ok" ? "✓ Folder accessible — all findings saved here automatically" :
         status === "err" ? "✗ Cannot write to this folder" :
         "All subdomains, URLs and scan data will be saved here"}
      </p>
    </div>
  );
}

// ── New Target Wizard ─────────────────────────────────────────────────────────
function NewTargetWizard({ onCreated, onBack }) {
  const [step, setStep]           = useState(0);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [folderStatus, setFolderStatus] = useState("idle"); // idle | ok | err

  const [f, setF] = useState({
    save_folder: "", analyst_name: "", analyst_id: "", team: "", role: "",
    email: "", org_name: "", primary_domain: "", sector: "",
    additional_scope: "", out_of_scope: "", engagement_type: "", auth_level: "",
    start_date: "", end_date: "", target_ref: "", notes: "", acknowledged: false,
  });
  const upd = k => v => setF(p => ({ ...p, [k]: v }));

  const validateFolder = async (path) => {
    if (!path.trim()) return;
    try {
      const r = await axios.get(`${API}/targets/validate-folder?path=${encodeURIComponent(path)}`);
      setFolderStatus(r.data.valid ? "ok" : "err");
    } catch { setFolderStatus("err"); }
  };

  const steps = [
    {
      title: "01 — SAVE LOCATION & OPERATOR",
      valid: folderStatus === "ok" && f.analyst_name && f.role,
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FolderInput value={f.save_folder} onChange={v => { upd("save_folder")(v); setFolderStatus("idle"); }} onValidate={validateFolder} status={folderStatus} />
          <div style={{ height: 1, background: "#111827" }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Analyst Name *" value={f.analyst_name} onChange={upd("analyst_name")} placeholder="John Doe" />
            <Field label="Badge / ID" value={f.analyst_id} onChange={upd("analyst_id")} placeholder="SEC-0042" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Team" value={f.team} onChange={upd("team")} placeholder="Red Team" />
            <Select label="Role *" value={f.role} onChange={upd("role")} options={[
              { v: "analyst", l: "Analyst" }, { v: "pentester", l: "Penetration Tester" },
              { v: "redteam", l: "Red Team Operator" }, { v: "bugbounty", l: "Bug Bounty Hunter" },
              { v: "researcher", l: "Researcher" },
            ]} />
          </div>
          <Field label="Email" value={f.email} onChange={upd("email")} placeholder="analyst@corp.com" type="email" />
        </div>
      ),
    },
    {
      title: "02 — TARGET ORGANIZATION",
      valid: f.org_name && f.primary_domain,
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Organization Name *" value={f.org_name} onChange={upd("org_name")} placeholder="Acme Corp" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Primary Domain *" value={f.primary_domain} onChange={upd("primary_domain")} placeholder="acme.com"
              hint="Root domain — subdomains will be auto-discovered" />
            <Select label="Sector" value={f.sector} onChange={upd("sector")} options={[
              { v: "fintech", l: "FinTech / Banking" }, { v: "healthcare", l: "Healthcare" },
              { v: "ecommerce", l: "E-Commerce" }, { v: "saas", l: "SaaS / Software" },
              { v: "telecom", l: "Telecom" }, { v: "government", l: "Government" },
              { v: "other", l: "Other" },
            ]} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: "#16a34a", letterSpacing: "0.1em", fontFamily: "monospace", textTransform: "uppercase" }}>Additional In-Scope</label>
            <textarea value={f.additional_scope} onChange={e => upd("additional_scope")(e.target.value)}
              placeholder={"beta.acme.com\napi.acme.io"} rows={2}
              style={{ background: "#000", border: "1px solid #1f2937", borderRadius: 6, padding: "8px 12px", color: "#86efac", fontFamily: "monospace", fontSize: 13, outline: "none", resize: "none" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: "#16a34a", letterSpacing: "0.1em", fontFamily: "monospace", textTransform: "uppercase" }}>Out of Scope</label>
            <textarea value={f.out_of_scope} onChange={e => upd("out_of_scope")(e.target.value)}
              placeholder={"staging.acme.com"} rows={2}
              style={{ background: "#000", border: "1px solid #1f2937", borderRadius: 6, padding: "8px 12px", color: "#86efac", fontFamily: "monospace", fontSize: 13, outline: "none", resize: "none" }} />
          </div>
        </div>
      ),
    },
    {
      title: "03 — ENGAGEMENT SCOPE & AUTHORIZATION",
      valid: f.engagement_type && f.auth_level && f.acknowledged,
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Select label="Engagement Type *" value={f.engagement_type} onChange={upd("engagement_type")} options={[
              { v: "pentest_black", l: "Pentest — Black Box" },
              { v: "pentest_grey", l: "Pentest — Grey Box" },
              { v: "pentest_white", l: "Pentest — White Box" },
              { v: "redteam", l: "Red Team" },
              { v: "bugbounty", l: "Bug Bounty" },
              { v: "recon", l: "Passive Recon Only" },
            ]} />
            <Select label="Authorization Level *" value={f.auth_level} onChange={upd("auth_level")} options={[
              { v: "full", l: "Full Authorization" },
              { v: "limited", l: "Limited — No Active Exploitation" },
              { v: "passive", l: "Passive / OSINT Only" },
              { v: "bugbounty", l: "Bug Bounty Program" },
            ]} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Start Date" value={f.start_date} onChange={upd("start_date")} type="date" />
            <Field label="End Date" value={f.end_date} onChange={upd("end_date")} type="date" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Target Reference / Ticket" value={f.target_ref} onChange={upd("target_ref")} placeholder="JIRA-1234" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label style={{ fontSize: 10, color: "#16a34a", letterSpacing: "0.1em", fontFamily: "monospace", textTransform: "uppercase" }}>Notes</label>
            <textarea value={f.notes} onChange={e => upd("notes")(e.target.value)}
              placeholder="Engagement context, special instructions..." rows={3}
              style={{ background: "#000", border: "1px solid #1f2937", borderRadius: 6, padding: "8px 12px", color: "#86efac", fontFamily: "monospace", fontSize: 13, outline: "none", resize: "none" }} />
          </div>
          <div
            onClick={() => upd("acknowledged")(!f.acknowledged)}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer",
              background: f.acknowledged ? "#052e16" : "#0a0a0a",
              border: `1px solid ${f.acknowledged ? "#166534" : "#1f2937"}`,
              borderRadius: 8, padding: "12px 14px",
            }}
          >
            <div style={{
              width: 16, height: 16, border: `2px solid ${f.acknowledged ? "#4ade80" : "#374151"}`,
              borderRadius: 3, background: f.acknowledged ? "#4ade80" : "transparent",
              flexShrink: 0, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {f.acknowledged && <span style={{ color: "#000", fontSize: 11, fontWeight: "bold" }}>✓</span>}
            </div>
            <p style={{ fontFamily: "monospace", fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
              I confirm I have written authorization to perform reconnaissance and scanning activities against this target.
              All findings are confidential.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "04 — CONFIRM TARGET",
      valid: true,
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: "monospace" }}>
          <div style={{ background: "#052e16", border: "1px solid #166534", borderRadius: 8, padding: 16 }}>
            <p style={{ color: "#4ade80", fontSize: 13, fontWeight: "bold", marginBottom: 8 }}>TARGET BRIEF</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 20px", fontSize: 12 }}>
              {[
                ["Analyst", f.analyst_name], ["Role", f.role], ["Team", f.team || "—"],
                ["Organization", f.org_name], ["Domain", f.primary_domain], ["Sector", f.sector || "—"],
                ["Engagement", f.engagement_type], ["Auth Level", f.auth_level],
                ["Start", f.start_date || "—"], ["End", f.end_date || "—"],
                ["Ref", f.target_ref || "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <span style={{ color: "#374151" }}>{k}: </span>
                  <span style={{ color: "#86efac" }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 8, padding: 12 }}>
            <p style={{ fontSize: 11, color: "#4b5563" }}>Save location</p>
            <p style={{ fontSize: 12, color: "#6b7280", wordBreak: "break-all" }}>{f.save_folder}</p>
          </div>
          {error && (
            <p style={{ color: "#ef4444", fontSize: 12, background: "#1c0a0a", padding: "8px 12px", borderRadius: 6, border: "1px solid #7f1d1d" }}>
              {error}
            </p>
          )}
        </div>
      ),
    },
  ];

  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${API}/targets/create`, f);
      saveRecent(res.data);
      onCreated(res.data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to create target");
    } finally {
      setLoading(false);
    }
  };

  const current = steps[step];

  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      {/* Grid bg */}
      <div style={{ position: "fixed", inset: 0, opacity: 0.02, backgroundImage: "linear-gradient(#00ff88 1px, transparent 1px), linear-gradient(90deg, #00ff88 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 560, position: "relative" }}>
        {/* Step indicators */}
        <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: i <= step ? "#166534" : "#1f2937",
              transition: "background 0.3s",
            }} />
          ))}
        </div>

        <div style={{ background: "#030712", border: "1px solid #1f2937", borderRadius: 12, padding: 28 }}>
          {/* Title row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ fontFamily: "monospace", fontSize: 13, color: "#4ade80", letterSpacing: "0.1em" }}>{current.title}</h2>
            <button onClick={onBack} style={{ fontFamily: "monospace", fontSize: 11, color: "#374151", background: "none", border: "none", cursor: "pointer" }}>← Back to menu</button>
          </div>

          {current.content}

          {/* Nav buttons */}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
            <button
              onClick={() => step === 0 ? onBack() : setStep(s => s - 1)}
              style={{ padding: "10px 20px", background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 8, color: "#6b7280", fontFamily: "monospace", fontSize: 12, cursor: "pointer" }}
            >
              ← Back
            </button>
            {step < steps.length - 1 ? (
              <button
                onClick={() => setStep(s => s + 1)}
                disabled={!current.valid}
                style={{
                  padding: "10px 24px", background: current.valid ? "#166534" : "#0a0a0a",
                  border: `1px solid ${current.valid ? "#166534" : "#1f2937"}`,
                  borderRadius: 8, color: current.valid ? "#fff" : "#374151",
                  fontFamily: "monospace", fontSize: 12, cursor: current.valid ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                Continue →
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={loading}
                style={{
                  padding: "10px 24px", background: loading ? "#0a0a0a" : "#166534",
                  border: "1px solid #166534", borderRadius: 8, color: loading ? "#374151" : "#fff",
                  fontFamily: "monospace", fontSize: 12, cursor: loading ? "not-allowed" : "pointer",
                  letterSpacing: "0.05em",
                }}
              >
                {loading ? "Creating..." : "► Create Target"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Open Existing Target ──────────────────────────────────────────────────────
function OpenTargetPanel({ onOpened, onBack, prefilledPath }) {
  // Always extract a clean string — prefilledPath may be a string or object
  const toStr = (v) => {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (typeof v === "object") return v.target_folder || "";
    return String(v);
  };

  const [folder, setFolder] = useState(toStr(prefilledPath));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const recent = getRecent();

  const handleOpen = async (path) => {
    const raw = path !== undefined ? path : folder;
    const target = toStr(raw).trim();
    if (!target) { setError("Enter a folder path"); return; }
    setLoading(true);
    setError("");
    console.log("[ASDMT] Opening target:", target);
    try {
      const res = await axios.post(`${API}/targets/open`, { folder: target }, { timeout: 8000 });
      console.log("[ASDMT] Open success:", res.data?.meta?.target_id);
      saveRecent(res.data.meta);
      setLoading(false);
      onOpened(res.data);
    } catch (e) {
      console.error("[ASDMT] Open failed:", e);
      setLoading(false);
      if (e.code === "ECONNABORTED" || e.message?.includes("timeout")) {
        setError("Request timed out — is the backend running on port 8000?");
      } else if (e.code === "ERR_NETWORK" || !e.response) {
        setError("Cannot reach backend — start uvicorn on port 8000 first");
      } else {
        setError(e.response?.data?.detail || `Error ${e.response?.status}: Could not open target`);
      }
    }
  };

  // Auto-open if a path was passed in (e.g. clicked from recent on main menu)
  const autoOpened = useRef(false);
  useEffect(() => {
    if (prefilledPath && !autoOpened.current) {
      autoOpened.current = true;
      handleOpen(prefilledPath);
    }
  }, []);   // empty deps — run once only

  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ position: "fixed", inset: 0, opacity: 0.02, backgroundImage: "linear-gradient(#00ff88 1px, transparent 1px), linear-gradient(90deg, #00ff88 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
      <div style={{ width: "100%", maxWidth: 560, position: "relative" }}>
        <div style={{ background: "#030712", border: "1px solid #1f2937", borderRadius: 12, padding: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h2 style={{ fontFamily: "monospace", fontSize: 13, color: "#4ade80", letterSpacing: "0.1em" }}>OPEN TARGET</h2>
            <button onClick={onBack} style={{ fontFamily: "monospace", fontSize: 11, color: "#374151", background: "none", border: "none", cursor: "pointer" }}>← Back</button>
          </div>

          {loading && (
            <div style={{ textAlign: "center", padding: "24px 0", fontFamily: "monospace", fontSize: 13, color: "#4ade80" }}>
              <span className="animate-pulse">Loading target...</span>
            </div>
          )}

          {!loading && (
            <>
              {/* Manual path entry */}
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  value={folder}
                  onChange={e => setFolder(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleOpen()}
                  placeholder="Paste target folder path..."
                  style={{
                    flex: 1, background: "#000", border: "1px solid #1f2937", borderRadius: 6,
                    padding: "10px 12px", color: "#86efac", fontFamily: "monospace", fontSize: 13, outline: "none",
                  }}
                />
                <button
                  onClick={() => handleOpen()}
                  style={{
                    padding: "10px 18px", background: "#166534", border: "1px solid #166534",
                    borderRadius: 6, color: "#fff", fontFamily: "monospace", fontSize: 12, cursor: "pointer",
                  }}
                >
                  Open
                </button>
              </div>

              {error && <p style={{ color: "#ef4444", fontSize: 12, fontFamily: "monospace", marginBottom: 16, padding: "8px 10px", background: "#1c0a0a", borderRadius: 6, border: "1px solid #7f1d1d" }}>{error}</p>}

              {/* Recent targets */}
              {recent.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                    Recent Targets
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 280, overflowY: "auto" }}>
                    {recent.map((t, i) => (
                      <button
                        key={i}
                        onClick={() => handleOpen(t.target_folder)}
                        style={{
                          display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                          textAlign: "left", background: "#0a0a0a", border: "1px solid #1f2937",
                          borderRadius: 8, padding: "10px 14px", cursor: "pointer", width: "100%", transition: "border-color 0.2s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = "#166534"}
                        onMouseLeave={e => e.currentTarget.style.borderColor = "#1f2937"}
                      >
                        <div>
                          <p style={{ fontFamily: "monospace", fontSize: 13, color: "#86efac", marginBottom: 2 }}>{t.org_name}</p>
                          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#4b5563" }}>{t.primary_domain}</p>
                          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", wordBreak: "break-all", marginTop: 2 }}>{t.target_folder}</p>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#374151" }}>{t.scan_count || 0} scans</p>
                          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#374151" }}>{t.total_subdomains || 0} subdomains</p>
                          <p style={{ fontFamily: "monospace", fontSize: 10, color: "#1f2937", marginTop: 4 }}>
                            {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : ""}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main menu ─────────────────────────────────────────────────────────────────
function MainMenu({ onNew, onOpen }) {
  const recent = getRecent();
  return (
    <div style={{ minHeight: "100vh", background: "#000", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ position: "fixed", inset: 0, opacity: 0.02, backgroundImage: "linear-gradient(#00ff88 1px, transparent 1px), linear-gradient(90deg, #00ff88 1px, transparent 1px)", backgroundSize: "40px 40px", pointerEvents: "none" }} />
      <div style={{ width: "100%", maxWidth: 480, position: "relative" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937", letterSpacing: "0.15em", marginBottom: 8 }}>
            ████████████████████████████
          </p>
          <h1 style={{ fontFamily: "monospace", fontSize: 22, color: "#4ade80", fontWeight: "bold", letterSpacing: "0.15em" }}>ASDMT</h1>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#374151", letterSpacing: "0.1em", marginTop: 4 }}>
            ATTACK SURFACE DISCOVERY & MANAGEMENT
          </p>
          <p style={{ fontFamily: "monospace", fontSize: 11, color: "#1f2937", letterSpacing: "0.15em", marginTop: 8 }}>
            ████████████████████████████
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={onNew}
            style={{
              padding: "16px 24px", background: "#052e16", border: "1px solid #166534",
              borderRadius: 10, color: "#4ade80", fontFamily: "monospace", fontSize: 14,
              cursor: "pointer", letterSpacing: "0.08em", transition: "all 0.2s", textAlign: "left",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#14532d"; e.currentTarget.style.boxShadow = "0 0 20px rgba(74,222,128,0.1)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "#052e16"; e.currentTarget.style.boxShadow = "none"; }}
          >
            <span style={{ marginRight: 12 }}>►</span> New Target
            <p style={{ fontSize: 11, color: "#166534", marginTop: 3, fontWeight: "normal" }}>
              Create a new target with a save folder for persistent findings
            </p>
          </button>

          <button
            onClick={onOpen}
            style={{
              padding: "16px 24px", background: "#0a0a0a", border: "1px solid #1f2937",
              borderRadius: 10, color: "#9ca3af", fontFamily: "monospace", fontSize: 14,
              cursor: "pointer", letterSpacing: "0.08em", transition: "all 0.2s", textAlign: "left",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "#374151"; e.currentTarget.style.color = "#d1d5db"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "#1f2937"; e.currentTarget.style.color = "#9ca3af"; }}
          >
            <span style={{ marginRight: 12 }}>↩</span> Open Existing Target
            <p style={{ fontSize: 11, color: "#374151", marginTop: 3, fontWeight: "normal" }}>
              Resume a previous target — all prior scans and crawls restored
            </p>
          </button>
        </div>

        {recent.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <p style={{ fontFamily: "monospace", fontSize: 10, color: "#374151", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
              Recent
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recent.slice(0, 3).map((t, i) => (
                <button
                  key={i}
                  onClick={() => onOpen(t.target_folder)}
                  style={{
                    display: "flex", justifyContent: "space-between", textAlign: "left",
                    background: "#0a0a0a", border: "1px solid #1f2937", borderRadius: 8,
                    padding: "10px 14px", cursor: "pointer", width: "100%", transition: "border-color 0.2s",
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "#166534"}
                  onMouseLeave={e => e.currentTarget.style.borderColor = "#1f2937"}
                >
                  <div>
                    <p style={{ fontFamily: "monospace", fontSize: 13, color: "#86efac" }}>{t.org_name}</p>
                    <p style={{ fontFamily: "monospace", fontSize: 11, color: "#4b5563" }}>{t.primary_domain}</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ fontFamily: "monospace", fontSize: 11, color: "#374151" }}>{t.total_subdomains || 0} subs / {t.total_urls || 0} URLs</p>
                    <p style={{ fontFamily: "monospace", fontSize: 10, color: "#1f2937" }}>
                      {t.updated_at ? new Date(t.updated_at).toLocaleDateString() : ""}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        <p style={{ fontFamily: "monospace", fontSize: 10, color: "#111827", textAlign: "center", marginTop: 32, letterSpacing: "0.1em" }}>
          AUTHORIZED USE ONLY // v2.0
        </p>
      </div>
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────
export default function TargetManager({ onReady }) {
  const [screen, setScreen] = useState("boot");   // boot | menu | new | open
  const [quickOpenPath, setQuickOpenPath] = useState(null);

  const handleNew = () => setScreen("new");
  const handleOpenMenu = (prefilledPath) => {
    if (prefilledPath) setQuickOpenPath(prefilledPath);
    setScreen("open");
  };

  const handleCreated = (meta) => {
    onReady({ meta, scans: [], crawls: [], subdomains: [], urls: [] });
  };

  const handleOpened = (data) => {
    onReady(data);
  };

  if (screen === "boot")  return <BootScreen onDone={() => setScreen("menu")} />;
  if (screen === "new")   return <NewTargetWizard onCreated={handleCreated} onBack={() => setScreen("menu")} />;
  if (screen === "open")  return <OpenTargetPanel key={quickOpenPath || "open"} onOpened={handleOpened} onBack={() => { setQuickOpenPath(null); setScreen("menu"); }} prefilledPath={quickOpenPath} />;

  return <MainMenu onNew={handleNew} onOpen={handleOpenMenu} />;
}