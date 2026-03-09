// src/DNSView.jsx
import { useState, useMemo, useEffect } from "react";
import axios from "axios";

const API = "http://localhost:8000";

// ── Helpers ───────────────────────────────────────────────────────────────────

const C = {
  A:       "#4ade80",  AAAA:  "#67e8f9", CNAME: "#f9a8d4",
  MX:      "#fbbf24",  TXT:   "#a78bfa", NS:    "#60a5fa",
  SOA:     "#34d399",  CAA:   "#fb923c", SRV:   "#e879f9",
  PTR:     "#86efac",  DKIM:  "#fde68a",
};

const RISK_C = {
  critical:{ fg:"#ef4444", bg:"#0f0303", border:"#7f1d1d" },
  high:    { fg:"#f97316", bg:"#0f0600", border:"#7c2d12" },
  medium:  { fg:"#eab308", bg:"#0f0a00", border:"#713f12" },
  low:     { fg:"#22c55e", bg:"#00100a", border:"#14532d" },
  info:    { fg:"#60a5fa", bg:"#030d1f", border:"#1e3a5f" },
};

function Tag({ color, children }) {
  return (
    <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:700, color, background:color+"18",
      border:`1px solid ${color}44`, padding:"0px 6px", borderRadius:4, letterSpacing:"0.05em" }}>
      {children}
    </span>
  );
}

function IssueRow({ text, level = "high" }) {
  const r = RISK_C[level] || RISK_C.high;
  return (
    <div style={{ display:"flex", gap:7, alignItems:"flex-start", padding:"5px 8px",
      background:r.bg, border:`1px solid ${r.border}`, borderRadius:6, marginBottom:3 }}>
      <span style={{ fontFamily:"monospace", fontSize:10, color:r.fg, flexShrink:0 }}>⚠</span>
      <span style={{ fontFamily:"monospace", fontSize:10, color:"#9ca3af" }}>{text}</span>
    </div>
  );
}

function RecordPill({ value, color }) {
  return (
    <span style={{ fontFamily:"monospace", fontSize:10, color, background:color+"12",
      border:`1px solid ${color}33`, padding:"2px 8px", borderRadius:4, display:"inline-block", marginBottom:3 }}>
      {value}
    </span>
  );
}

function SectionBox({ title, color, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border:`1px solid #0f1923`, borderLeft:`3px solid ${color}`, borderRadius:8, overflow:"hidden", marginBottom:6 }}>
      <div onClick={()=>setOpen(o=>!o)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"8px 14px", cursor:"pointer", background:"#080c10" }}>
        <span style={{ fontFamily:"monospace", fontSize:10, fontWeight:700, color, letterSpacing:"0.1em" }}>{title}</span>
        <span style={{ fontFamily:"monospace", fontSize:10, color:"#1f2937" }}>{open?"▲":"▼"}</span>
      </div>
      {open && <div style={{ padding:"10px 14px", background:"#050507" }}>{children}</div>}
    </div>
  );
}

// ── Sub-panels ────────────────────────────────────────────────────────────────

function EmailSecurityPanel({ spf, dmarc, dkim }) {
  const spfOk   = spf?.policy === "fail";
  const dmarcOk = dmarc?.policy === "reject" || dmarc?.policy === "quarantine";
  const dkimOk  = dkim?.found?.length > 0;

  const score = (spfOk ? 33 : 0) + (dmarcOk ? 34 : 0) + (dkimOk ? 33 : 0);
  const scoreColor = score >= 90 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";

  return (
    <SectionBox title="EMAIL SECURITY" color="#fbbf24">
      {/* Score bar */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
        <div style={{ flex:1, height:6, background:"#0f1923", borderRadius:99, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${score}%`, background:scoreColor, borderRadius:99, transition:"width 0.5s" }}/>
        </div>
        <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:scoreColor, width:40 }}>{score}%</span>
      </div>

      {/* SPF */}
      <div style={{ marginBottom:10 }}>
        <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:5 }}>
          <Tag color={C.TXT}>SPF</Tag>
          {spf?.found
            ? <Tag color={spfOk ? "#22c55e" : "#f97316"}>{spf.policy?.toUpperCase() || "FOUND"}</Tag>
            : <Tag color="#ef4444">MISSING</Tag>}
        </div>
        {spf?.record && <pre style={{ fontFamily:"monospace", fontSize:9, color:"#4b5563", background:"#030305",
          border:"1px solid #0f1923", borderRadius:4, padding:"6px 8px", margin:"0 0 6px 0",
          whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{spf.record}</pre>}
        {spf?.includes?.length > 0 && (
          <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:5 }}>
            {spf.includes.map(i => <RecordPill key={i} value={`include:${i}`} color="#a78bfa"/>)}
          </div>
        )}
        {spf?.issues?.map((iss, i) => <IssueRow key={i} text={iss} level={iss.startsWith("CRITICAL") ? "critical" : "high"}/>)}
      </div>

      {/* DMARC */}
      <div style={{ marginBottom:10 }}>
        <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:5 }}>
          <Tag color={C.TXT}>DMARC</Tag>
          {dmarc?.found
            ? <Tag color={dmarcOk ? "#22c55e" : "#f97316"}>{dmarc.policy?.toUpperCase()}</Tag>
            : <Tag color="#ef4444">MISSING</Tag>}
          {dmarc?.found && <Tag color="#374151">sp={dmarc.subdomain_policy}</Tag>}
          {dmarc?.pct != null && dmarc.pct < 100 && <Tag color="#f97316">pct={dmarc.pct}%</Tag>}
          {dmarc?.adkim && <Tag color="#374151">adkim={dmarc.adkim}</Tag>}
        </div>
        {dmarc?.record && <pre style={{ fontFamily:"monospace", fontSize:9, color:"#4b5563", background:"#030305",
          border:"1px solid #0f1923", borderRadius:4, padding:"6px 8px", margin:"0 0 6px 0",
          whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{dmarc.record}</pre>}
        {dmarc?.reporting_uri && <p style={{ fontFamily:"monospace", fontSize:9, color:"#374151", margin:"0 0 5px 0" }}>Reports → {dmarc.reporting_uri}</p>}
        {dmarc?.issues?.map((iss, i) => <IssueRow key={i} text={iss} level="medium"/>)}
      </div>

      {/* DKIM */}
      <div>
        <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:5 }}>
          <Tag color={C.DKIM}>DKIM</Tag>
          {dkim
            ? dkim.found?.length > 0
              ? <Tag color="#22c55e">{dkim.found.length} selector{dkim.found.length>1?"s":""} found</Tag>
              : <Tag color="#f97316">No selectors found</Tag>
            : <Tag color="#374151">Not checked</Tag>}
        </div>
        {dkim?.found?.map(k => (
          <div key={k.selector} style={{ background:"#030305", border:"1px solid #0f1923", borderRadius:6, padding:"6px 10px", marginBottom:4 }}>
            <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:3 }}>
              <Tag color={C.DKIM}>{k.selector}</Tag>
              {k.key_bits && <Tag color={k.key_bits >= 2048 ? "#22c55e" : "#ef4444"}>{k.key_bits} bit</Tag>}
              {k.revoked && <Tag color="#ef4444">REVOKED</Tag>}
            </div>
            <pre style={{ fontFamily:"monospace", fontSize:8, color:"#374151", margin:0, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{k.record.slice(0,150)}</pre>
          </div>
        ))}
        {dkim?.issues?.map((iss, i) => <IssueRow key={i} text={iss} level="high"/>)}
      </div>
    </SectionBox>
  );
}

function IpInfoPanel({ ipInfo, ptr }) {
  const entries = Object.entries(ipInfo || {}).filter(([,v]) => v && Object.keys(v).length);
  if (!entries.length) return null;
  return (
    <SectionBox title="IP INTELLIGENCE" color={C.A}>
      {entries.map(([ip, info]) => (
        <div key={ip} style={{ background:"#030d1f", border:"1px solid #1e3a5f", borderRadius:8, padding:"10px 12px", marginBottom:6 }}>
          <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6, flexWrap:"wrap" }}>
            <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:C.A }}>{ip}</span>
            {info.country && <Tag color="#60a5fa">{info.country}</Tag>}
            {info.is_cloud && <Tag color="#fbbf24">Cloud IP</Tag>}
            {ptr?.[ip]?.length > 0 && <Tag color={C.PTR}>PTR: {ptr[ip][0]}</Tag>}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4 }}>
            {[
              ["ASN",      info.asn],
              ["ORG",      info.org?.slice(0,30)],
              ["CITY",     info.city],
              ["REGION",   info.region],
              ["TIMEZONE", info.timezone],
            ].filter(([,v])=>v).map(([l,v])=>(
              <div key={l} style={{ background:"#050507", border:"1px solid #0f1923", borderRadius:4, padding:"4px 8px" }}>
                <p style={{ fontFamily:"monospace", fontSize:7, color:"#374151", marginBottom:2 }}>{l}</p>
                <p style={{ fontFamily:"monospace", fontSize:10, color:"#9ca3af", margin:0 }}>{v}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </SectionBox>
  );
}

function TakeoverPanel({ takeover }) {
  if (!takeover || (!takeover.provider && !takeover.possible)) return null;
  const r = takeover.possible ? RISK_C.critical : RISK_C.medium;
  return (
    <SectionBox title="SUBDOMAIN TAKEOVER" color={takeover.possible ? "#ef4444" : "#eab308"}>
      <div style={{ background:r.bg, border:`1px solid ${r.border}`, borderRadius:8, padding:"10px 14px" }}>
        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:6 }}>
          <Tag color={r.fg}>{takeover.possible ? "⚠ VULNERABLE" : "POTENTIAL"}</Tag>
          {takeover.provider && <Tag color="#9ca3af">{takeover.provider}</Tag>}
        </div>
        {takeover.reason && <p style={{ fontFamily:"monospace", fontSize:10, color:"#9ca3af", margin:"0 0 4px 0" }}>{takeover.reason}</p>}
        {takeover.evidence && <p style={{ fontFamily:"monospace", fontSize:10, color:r.fg, margin:0 }}>Evidence: "{takeover.evidence}"</p>}
        {!takeover.possible && <p style={{ fontFamily:"monospace", fontSize:10, color:"#374151", margin:"6px 0 0 0" }}>CNAME points to claimable resource — verify manually</p>}
      </div>
    </SectionBox>
  );
}

function ZoneTransferPanel({ zt }) {
  if (!zt) return null;
  return (
    <SectionBox title="ZONE TRANSFER (AXFR)" color={zt.success ? "#ef4444" : "#374151"} defaultOpen={zt.success}>
      <div style={{ marginBottom:6, display:"flex", gap:6, flexWrap:"wrap" }}>
        <Tag color={zt.success ? "#ef4444" : "#22c55e"}>{zt.success ? "⚠ VULNERABLE" : "REFUSED"}</Tag>
        {zt.servers_tried?.map(s => <Tag key={s} color="#374151">{s}</Tag>)}
      </div>
      {zt.success && zt.records?.length > 0 && (
        <>
          <p style={{ fontFamily:"monospace", fontSize:9, color:"#ef4444", marginBottom:6 }}>
            {zt.records.length} records leaked
          </p>
          <pre style={{ fontFamily:"monospace", fontSize:9, color:"#fca5a5", background:"#0f0303",
            border:"1px solid #7f1d1d", borderRadius:6, padding:"8px 10px",
            maxHeight:200, overflowY:"auto", whiteSpace:"pre-wrap", wordBreak:"break-all" }}>
            {zt.records.slice(0,50).join("\n")}
            {zt.records.length > 50 && `\n... and ${zt.records.length - 50} more`}
          </pre>
        </>
      )}
    </SectionBox>
  );
}

function PropagationPanel({ prop }) {
  if (!prop) return null;
  const resolvers = prop.resolvers || {};
  return (
    <SectionBox title="DNS PROPAGATION" color={prop.consistent ? "#22c55e" : "#f97316"}>
      {!prop.consistent && <IssueRow text={prop.note} level="medium"/>}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:4, marginTop:6 }}>
        {Object.entries(resolvers).map(([name, ips]) => (
          <div key={name} style={{ background:"#030d1f", border:"1px solid #1e3a5f", borderRadius:6, padding:"7px 10px" }}>
            <p style={{ fontFamily:"monospace", fontSize:8, color:"#374151", marginBottom:4 }}>{name}</p>
            {ips.length ? ips.map(ip => <p key={ip} style={{ fontFamily:"monospace", fontSize:10, color:C.A, margin:"1px 0" }}>{ip}</p>)
              : <p style={{ fontFamily:"monospace", fontSize:10, color:"#1f2937", margin:0 }}>No answer</p>}
          </div>
        ))}
      </div>
    </SectionBox>
  );
}

function SoaPanel({ soa }) {
  if (!soa || !soa.mname) return null;
  return (
    <SectionBox title="SOA RECORD" color={C.SOA} defaultOpen={false}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:4 }}>
        {Object.entries(soa).map(([k,v]) => (
          <div key={k} style={{ background:"#030505", border:"1px solid #0f1923", borderRadius:4, padding:"5px 8px" }}>
            <p style={{ fontFamily:"monospace", fontSize:7, color:"#374151", marginBottom:2, textTransform:"uppercase" }}>{k}</p>
            <p style={{ fontFamily:"monospace", fontSize:10, color:C.SOA, margin:0, wordBreak:"break-all" }}>{String(v)}</p>
          </div>
        ))}
      </div>
    </SectionBox>
  );
}

function CaaPanel({ caa }) {
  if (!caa?.length) return null;
  return (
    <SectionBox title="CAA RECORDS" color={C.CAA} defaultOpen={false}>
      <p style={{ fontFamily:"monospace", fontSize:9, color:"#374151", marginBottom:6 }}>
        Authorised certificate authorities
      </p>
      {caa.map((r,i) => (
        <div key={i} style={{ display:"flex", gap:6, alignItems:"center", marginBottom:3 }}>
          <Tag color={C.CAA}>{r.tag}</Tag>
          <span style={{ fontFamily:"monospace", fontSize:11, color:"#e2e8f0" }}>{r.value}</span>
          <span style={{ fontFamily:"monospace", fontSize:9, color:"#374151" }}>flag:{r.flag}</span>
        </div>
      ))}
    </SectionBox>
  );
}

function SrvPanel({ srv }) {
  if (!srv?.length) return null;
  return (
    <SectionBox title={`SRV RECORDS (${srv.length})`} color={C.SRV} defaultOpen={false}>
      {srv.map((r,i) => (
        <div key={i} style={{ background:"#0c0318", border:"1px solid #4c1d95", borderRadius:6, padding:"7px 10px", marginBottom:4 }}>
          <div style={{ display:"flex", gap:6, alignItems:"center", marginBottom:3 }}>
            <Tag color={C.SRV}>{r.service}</Tag>
            <span style={{ fontFamily:"monospace", fontSize:11, color:"#e2e8f0" }}>{r.target}:{r.port}</span>
          </div>
          <span style={{ fontFamily:"monospace", fontSize:9, color:"#374151" }}>priority:{r.priority} weight:{r.weight}</span>
        </div>
      ))}
    </SectionBox>
  );
}

function DohPanel({ doh }) {
  if (!doh || doh.error) return null;
  return (
    <SectionBox title="DoH SPLIT-HORIZON CHECK" color={doh.mismatch ? "#f97316" : "#22c55e"} defaultOpen={false}>
      {doh.mismatch
        ? <IssueRow text={doh.note} level="medium"/>
        : <p style={{ fontFamily:"monospace", fontSize:10, color:"#22c55e" }}>✓ Consistent with Cloudflare DoH</p>}
      {doh.doh_ips?.length > 0 && (
        <div style={{ marginTop:6, display:"flex", gap:4, flexWrap:"wrap" }}>
          {doh.doh_ips.map(ip => <RecordPill key={ip} value={ip} color="#f97316"/>)}
        </div>
      )}
    </SectionBox>
  );
}

function DnsKeyRecordsPanel({ data }) {
  const hasMX  = data.MX?.length > 0;
  const hasTXT = data.TXT?.length > 0;
  const hasNS  = data.NS?.length > 0;

  return (
    <SectionBox title="DNS RECORDS" color="#6b7280" defaultOpen={true}>
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {/* A */}
        {data.A?.length > 0 && (
          <div>
            <p style={{ fontFamily:"monospace", fontSize:9, color:C.A, letterSpacing:"0.1em", marginBottom:4 }}>A</p>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{data.A.map(v=><RecordPill key={v} value={v} color={C.A}/>)}</div>
          </div>
        )}
        {/* AAAA */}
        {data.AAAA?.length > 0 && (
          <div>
            <p style={{ fontFamily:"monospace", fontSize:9, color:C.AAAA, letterSpacing:"0.1em", marginBottom:4 }}>AAAA</p>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{data.AAAA.map(v=><RecordPill key={v} value={v} color={C.AAAA}/>)}</div>
          </div>
        )}
        {/* CNAME */}
        {data.CNAME?.length > 0 && (
          <div>
            <p style={{ fontFamily:"monospace", fontSize:9, color:C.CNAME, letterSpacing:"0.1em", marginBottom:4 }}>CNAME</p>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{data.CNAME.map(v=><RecordPill key={v} value={v} color={C.CNAME}/>)}</div>
          </div>
        )}
        {/* MX */}
        {hasMX && (
          <div>
            <p style={{ fontFamily:"monospace", fontSize:9, color:C.MX, letterSpacing:"0.1em", marginBottom:4 }}>MX</p>
            {data.MX.map((r,i) => (
              <div key={i} style={{ display:"flex", gap:6, alignItems:"center", marginBottom:3 }}>
                <span style={{ fontFamily:"monospace", fontSize:9, color:"#374151", width:24 }}>{r.priority}</span>
                <RecordPill value={r.host} color={C.MX}/>
              </div>
            ))}
          </div>
        )}
        {/* NS */}
        {hasNS && (
          <div>
            <p style={{ fontFamily:"monospace", fontSize:9, color:C.NS, letterSpacing:"0.1em", marginBottom:4 }}>NS</p>
            <div style={{ display:"flex", gap:4, flexWrap:"wrap" }}>{data.NS.map(v=><RecordPill key={v} value={v} color={C.NS}/>)}</div>
          </div>
        )}
        {/* TXT */}
        {hasTXT && (
          <div>
            <p style={{ fontFamily:"monospace", fontSize:9, color:C.TXT, letterSpacing:"0.1em", marginBottom:4 }}>TXT</p>
            {data.TXT.map((t,i) => (
              <pre key={i} style={{ fontFamily:"monospace", fontSize:9, color:"#6b7280",
                background:"#030305", border:"1px solid #0f1923", borderRadius:4, padding:"4px 8px",
                whiteSpace:"pre-wrap", wordBreak:"break-all", marginBottom:3 }}>{t.slice(0,200)}</pre>
            ))}
          </div>
        )}
      </div>
    </SectionBox>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DNSView({ subdomains, primaryDomain, savedDns, onDnsChange }) {
  const domain = primaryDomain;
  const [results, setResults]   = useState(savedDns || null);
  const [loading, setLoading]   = useState(false);
  const [progress, setProgress] = useState(0);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState("");
  const [deep, setDeep]         = useState(false);

  // Restore when savedDns arrives async (after target open)
  useEffect(() => {
    if (savedDns && Object.keys(savedDns).length > 0) {
      setResults(savedDns);
      setSelected(prev => {
        if (prev && savedDns[prev]) return prev;          // keep current selection if still valid
        return Object.keys(savedDns)[0] || null;          // else pick first
      });
    }
  }, [savedDns]);

  const run = async () => {
    if (!subdomains.length) return;
    setLoading(true); setResults(null); setProgress(0); setSelected(null);
    const batch = 10; const all = {};
    for (let i = 0; i < subdomains.length; i += batch) {
      try {
        const res = await axios.post(`${API}/recon/dns/bulk`, {
          subdomains: subdomains.slice(i, i + batch),
          primary_domain: domain,
          deep,
        });
        Object.assign(all, res.data);
      } catch {}
      setProgress(Math.round(Math.min(((i + batch) / subdomains.length) * 100, 100)));
    }
    setResults(all); onDnsChange?.(all); setLoading(false);
    const first = Object.keys(all)[0];
    if (first) setSelected(first);
  };

  const listEntries = useMemo(() => {
    if (!results) return [];
    return Object.entries(results).filter(([sub]) =>
      !filter || sub.toLowerCase().includes(filter.toLowerCase())
    );
  }, [results, filter]);

  const stats = useMemo(() => {
    if (!results) return {};
    const all = Object.values(results);
    return {
      total:          all.length,
      withA:          all.filter(r => r.A?.length).length,
      withCname:      all.filter(r => r.CNAME?.length).length,
      takeover:       all.filter(r => r.takeover?.possible).length,
      potentialTakeover: all.filter(r => r.takeover?.provider && !r.takeover?.possible).length,
      noSpf:          all.filter(r => !r.spf?.found).length,
      noDmarc:        all.filter(r => !r.dmarc?.found).length,
      zoneTransfer:   all.filter(r => r.zone_transfer?.success).length,
      cloudIp:        all.filter(r => r.ip_info && Object.values(r.ip_info).some(i => i?.is_cloud)).length,
      dnssecEnabled:  all.filter(r => r.dnssec?.enabled).length,
    };
  }, [results]);

  const sel = selected && results?.[selected];

  // Compute issues for selected host
  const selIssues = useMemo(() => {
    if (!sel) return [];
    const issues = [];
    if (sel.takeover?.possible) issues.push({ text: `Subdomain takeover: ${sel.takeover.provider}`, level: "critical" });
    if (sel.zone_transfer?.success) issues.push({ text: "Zone transfer allowed — AXFR leaking all DNS records", level: "critical" });
    if (!sel.spf?.found) issues.push({ text: "No SPF record", level: "high" });
    if (!sel.dmarc?.found) issues.push({ text: "No DMARC record", level: "high" });
    if (sel.spf?.policy === "pass_all" || sel.spf?.policy === "neutral") issues.push({ text: `Weak SPF policy: ${sel.spf.policy}`, level: "high" });
    if (sel.dmarc?.policy === "none") issues.push({ text: "DMARC policy=none: not enforced", level: "medium" });
    if (sel.doh_comparison?.mismatch) issues.push({ text: "Split-horizon DNS detected", level: "medium" });
    if (!sel.dnssec?.enabled) issues.push({ text: "DNSSEC not enabled", level: "low" });
    if (!sel.CAA?.length) issues.push({ text: "No CAA records — any CA can issue certs", level: "low" });
    return issues;
  }, [sel]);

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Header */}
      <div style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:12, padding:"16px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{ width:7, height:7, borderRadius:"50%",
                background:loading?"#f97316":results?"#22c55e":"#1f2937",
                boxShadow:loading?"0 0 8px #f97316":results?"0 0 8px #22c55e":"none" }}/>
              <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#4ade80", letterSpacing:"0.15em" }}>DNS RECON</span>
            </div>
            <span style={{ fontFamily:"monospace", fontSize:11, color:"#1f2937" }}>
              {subdomains.length} subdomains · records · SPF/DMARC/DKIM · takeover · zone transfer · propagation · IP intel
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <label style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer" }}>
              <input type="checkbox" checked={deep} onChange={e=>setDeep(e.target.checked)} style={{ accentColor:"#22c55e" }}/>
              <span style={{ fontFamily:"monospace", fontSize:9, color:"#374151" }}>Deep (DKIM + SRV + AXFR + propagation)</span>
            </label>
            <button onClick={run} disabled={loading||!subdomains.length} style={{
              padding:"10px 24px", borderRadius:8, cursor:loading?"not-allowed":"pointer",
              fontFamily:"monospace", fontSize:12, fontWeight:700,
              background:loading?"#0d1117":"linear-gradient(135deg,#166534,#15803d)",
              border:`1px solid ${loading?"#1f2937":"#22c55e55"}`,
              color:loading?"#374151":"#fff",
              boxShadow:loading?"none":"0 0 20px #22c55e22",
            }}>{loading?`RESOLVING ${progress}%`:results?"↺  RE-QUERY":"▶  RUN DNS RECON"}</button>
          </div>
        </div>
        {loading && (
          <div style={{ marginTop:12 }}>
            <div style={{ height:3, background:"#0f1923", borderRadius:99, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${progress}%`, background:"linear-gradient(90deg,#166534,#22c55e)", borderRadius:99, transition:"width 0.3s" }}/>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      {results && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
          {[
            { label:"RESOLVED",    value:stats.withA,            color:"#4ade80" },
            { label:"CNAME",       value:stats.withCname,        color:C.CNAME },
            { label:"TAKEOVER",    value:stats.takeover,         color:"#ef4444" },
            { label:"NO SPF",      value:stats.noSpf,            color:"#f97316" },
            { label:"NO DMARC",    value:stats.noDmarc,          color:"#eab308" },
            { label:"ZONE XFR",    value:stats.zoneTransfer,     color:"#ef4444" },
            { label:"CLOUD IP",    value:stats.cloudIp,          color:"#60a5fa" },
            { label:"DNSSEC",      value:stats.dnssecEnabled,    color:"#67e8f9" },
            { label:"POTENTIAL TO",value:stats.potentialTakeover, color:"#fb923c" },
            { label:"TOTAL",       value:stats.total,            color:"#6b7280" },
          ].map(s => (
            <div key={s.label} style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:8, padding:"8px 12px", borderTop:`2px solid ${s.color}` }}>
              <div style={{ fontFamily:"monospace", fontSize:8, color:"#374151", letterSpacing:"0.08em", marginBottom:3 }}>{s.label}</div>
              <div style={{ fontFamily:"monospace", fontSize:18, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Split panel */}
      {results && (
        <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:10, height:560 }}>

          {/* Left list */}
          <div style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:12, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"8px 10px", borderBottom:"1px solid #0f1923" }}>
              <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter subdomains…"
                style={{ width:"100%", boxSizing:"border-box", background:"#050507", border:"1px solid #0f1923",
                  borderRadius:6, padding:"5px 9px", fontFamily:"monospace", fontSize:11, color:"#86efac", outline:"none" }}
                onFocus={e=>e.target.style.borderColor="#166534"} onBlur={e=>e.target.style.borderColor="#0f1923"}/>
            </div>
            <div style={{ flex:1, overflowY:"auto" }}>
              {listEntries.map(([sub, r]) => {
                const isSel = selected === sub;
                const hasIssue = r.takeover?.possible || r.zone_transfer?.success;
                const hasWarning = !r.spf?.found || !r.dmarc?.found || r.takeover?.provider;
                const borderColor = hasIssue ? "#ef4444" : hasWarning ? "#f97316" : "transparent";
                return (
                  <button key={sub} onClick={() => setSelected(sub)} style={{
                    width:"100%", textAlign:"left", padding:"8px 10px",
                    background: isSel ? "#050e05" : "transparent",
                    border:"none", borderBottom:"1px solid #0a0c0f",
                    borderLeft:`3px solid ${isSel ? "#4ade80" : borderColor}`,
                    cursor:"pointer",
                  }}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="#0a0d10";}}
                    onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background="transparent";}}>
                    <p style={{ fontFamily:"monospace", fontSize:10, color: isSel?"#67e8f9":hasIssue?"#f87171":hasWarning?"#fb923c":"#4b5563",
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:3 }}>{sub}</p>
                    <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                      {r.A?.slice(0,1).map(ip => <span key={ip} style={{ fontFamily:"monospace", fontSize:8, color:"#22c55e" }}>{ip}</span>)}
                      {r.CNAME?.slice(0,1).map(c => <span key={c} style={{ fontFamily:"monospace", fontSize:8, color:C.CNAME, overflow:"hidden", textOverflow:"ellipsis", maxWidth:140, whiteSpace:"nowrap", display:"block" }}>{c}</span>)}
                      {r.provider && <span style={{ fontFamily:"monospace", fontSize:8, color:"#fbbf24" }}>{r.provider}</span>}
                      {r.takeover?.possible && <span style={{ fontFamily:"monospace", fontSize:8, color:"#ef4444", fontWeight:700 }}>TAKEOVER</span>}
                      {r.dnssec?.enabled && <span style={{ fontFamily:"monospace", fontSize:8, color:"#67e8f9" }}>DNSSEC</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right detail */}
          <div style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:12, overflowY:"auto" }}>
            {sel ? (
              <div style={{ padding:"14px 18px" }}>
                {/* Title bar */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                    <span style={{ fontFamily:"monospace", fontSize:13, fontWeight:700, color:"#67e8f9" }}>{selected}</span>
                    {sel.provider && <Tag color="#fbbf24">{sel.provider}</Tag>}
                    {sel.dnssec?.enabled && <Tag color="#67e8f9">DNSSEC</Tag>}
                    {sel.error && <Tag color="#ef4444">ERROR: {sel.error}</Tag>}
                  </div>
                </div>

                {/* Issues summary */}
                {selIssues.length > 0 && (
                  <div style={{ marginBottom:10 }}>
                    {selIssues.map((iss,i) => <IssueRow key={i} text={iss.text} level={iss.level}/>)}
                  </div>
                )}

                {/* Takeover alert */}
                <TakeoverPanel takeover={sel.takeover}/>

                {/* DNS records */}
                <DnsKeyRecordsPanel data={sel}/>

                {/* IP intel */}
                <IpInfoPanel ipInfo={sel.ip_info} ptr={sel.PTR}/>

                {/* Email security */}
                <EmailSecurityPanel spf={sel.spf} dmarc={sel.dmarc} dkim={sel.dkim}/>

                {/* Zone transfer */}
                {sel.zone_transfer?.attempted && <ZoneTransferPanel zt={sel.zone_transfer}/>}

                {/* DoH split-horizon */}
                <DohPanel doh={sel.doh_comparison}/>

                {/* Propagation */}
                {sel.propagation && <PropagationPanel prop={sel.propagation}/>}

                {/* SOA */}
                <SoaPanel soa={sel.SOA}/>

                {/* CAA */}
                <CaaPanel caa={sel.CAA}/>

                {/* SRV */}
                {sel.SRV?.length > 0 && <SrvPanel srv={sel.SRV}/>}

                {/* Interesting TXT */}
                {sel.txt_interesting?.length > 0 && (
                  <SectionBox title="INTERESTING TXT RECORDS" color={C.TXT} defaultOpen={false}>
                    {sel.txt_interesting.map((t,i) => (
                      <div key={i} style={{ marginBottom:4 }}>
                        <Tag color={C.TXT}>{t.type}</Tag>
                        <pre style={{ fontFamily:"monospace", fontSize:9, color:"#6b7280", background:"#030305",
                          border:"1px solid #0f1923", borderRadius:4, padding:"4px 8px", marginTop:3,
                          whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{t.record}</pre>
                      </div>
                    ))}
                  </SectionBox>
                )}
              </div>
            ) : (
              <div style={{ flex:1, height:"100%", display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center", gap:10 }}>
                <div style={{ fontFamily:"monospace", fontSize:40, color:"#0f1923" }}>⬡</div>
                <p style={{ fontFamily:"monospace", fontSize:12, color:"#1f2937" }}>Select a subdomain to inspect</p>
              </div>
            )}
          </div>
        </div>
      )}

      {!results && !loading && (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, padding:60 }}>
          <div style={{ fontFamily:"monospace", fontSize:48, color:"#0f1923" }}>⬡</div>
          <p style={{ fontFamily:"monospace", fontSize:13, color:"#1f2937" }}>Click RUN DNS RECON to query {subdomains.length} subdomains</p>
          <p style={{ fontFamily:"monospace", fontSize:10, color:"#111827" }}>
            Records · SPF/DMARC/DKIM · Takeover · Zone Transfer · IP Intel · DoH · Propagation
          </p>
        </div>
      )}
    </div>
  );
}