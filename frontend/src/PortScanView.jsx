// src/PortScanView.jsx
import { useState, useMemo, useEffect } from "react";
import axios from "axios";

import API from "./Config";

const PORT_RISK = {
  21:"high",22:"low",23:"critical",25:"medium",53:"low",69:"medium",
  79:"medium",80:"low",110:"low",111:"medium",135:"critical",139:"critical",
  143:"low",389:"medium",443:"low",445:"critical",465:"low",512:"high",
  513:"high",514:"high",587:"low",636:"low",873:"high",993:"low",995:"low",
  1080:"medium",1099:"high",1433:"critical",1521:"critical",1723:"medium",
  2049:"high",2181:"high",2375:"critical",2376:"high",2379:"critical",
  3000:"medium",3128:"medium",3306:"high",3389:"critical",4443:"medium",
  4848:"critical",5000:"medium",5432:"high",5601:"medium",5900:"high",
  6379:"critical",6443:"medium",7000:"medium",7001:"critical",7443:"medium",
  8000:"low",8009:"high",8080:"low",8443:"low",8500:"high",8888:"medium",
  9000:"medium",9090:"medium",9200:"critical",9300:"high",9418:"medium",
  10250:"critical",11211:"critical",27017:"critical",27018:"high",
  50070:"critical",61616:"critical",
};

const RISK = {
  critical:{ color:"#ef4444", dim:"#7f1d1d", bg:"#0f0303", glow:"#ef444422", label:"CRITICAL" },
  high:    { color:"#f97316", dim:"#7c2d12", bg:"#0f0600", glow:"#f9731622", label:"HIGH" },
  medium:  { color:"#eab308", dim:"#713f12", bg:"#0f0a00", glow:"#eab30822", label:"MEDIUM" },
  low:     { color:"#22c55e", dim:"#14532d", bg:"#00100a", glow:"#22c55e22", label:"LOW" },
  none:    { color:"#374151", dim:"#1f2937", bg:"#0a0c10", glow:"none",     label:"NONE" },
};

function RiskBadge({ risk, small }) {
  const r = RISK[risk] || RISK.low;
  return (
    <span style={{
      fontFamily:"monospace", fontSize: small ? 8 : 9, fontWeight:700,
      color:r.color, background:r.bg, border:`1px solid ${r.dim}`,
      padding: small ? "0 4px" : "1px 6px", borderRadius:4, letterSpacing:"0.06em",
    }}>{r.label}</span>
  );
}

function CveBadge({ count }) {
  if (!count) return null;
  return <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:700, color:"#f97316", background:"#0f0600", border:"1px solid #7c2d12", padding:"1px 6px", borderRadius:4 }}>{count} CVE{count>1?"s":""}</span>;
}

function SslBadge({ ssl }) {
  if (!ssl) return null;
  if (ssl.error) return <span style={{ fontFamily:"monospace", fontSize:9, color:"#374151" }}>SSL ERR</span>;
  const days = ssl.expiry_days;
  const color = ssl.expired ? "#ef4444" : days < 30 ? "#f97316" : "#22c55e";
  const label = ssl.expired ? "EXPIRED" : days < 30 ? `${days}d` : "TLS ✓";
  return <span style={{ fontFamily:"monospace", fontSize:9, fontWeight:700, color, background:"#050507", border:`1px solid ${color}44`, padding:"1px 6px", borderRadius:4 }}>{label}</span>;
}

function PortRow({ p, idx }) {
  const [expanded, setExpanded] = useState(false);
  const risk = p.risk || PORT_RISK[p.port] || "low";
  const r = RISK[risk];
  const hasExtra = p.banner || p.ssl || p.http || p.cves?.length > 0;

  return (
    <div style={{ borderLeft:`3px solid ${r.color}`, borderBottom:"1px solid #0f1117", background: idx%2===0?"#08080a":"#050507", transition:"background 0.12s" }}
      onMouseEnter={e=>e.currentTarget.style.background=r.bg}
      onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?"#08080a":"#050507"}>

      {/* Main row */}
      <div style={{ display:"grid", gridTemplateColumns:"52px 1fr auto", alignItems:"center", padding:"9px 16px 9px 14px", cursor: hasExtra?"pointer":"default" }}
        onClick={()=>hasExtra&&setExpanded(e=>!e)}>
        <div style={{ fontFamily:"monospace", fontSize:16, fontWeight:800, color:r.color }}>{p.port}</div>
        <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
          <div style={{ display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
            <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:600, color:"#e2e8f0" }}>
              {p.software ? `${p.software}` : p.service}
            </span>
            {p.version && <span style={{ fontFamily:"monospace", fontSize:10, color:"#93c5fd", background:"#0a1020", border:"1px solid #1e3a5f", padding:"0 5px", borderRadius:3 }}>v{p.version}</span>}
            <RiskBadge risk={risk} />
            <CveBadge count={p.cves?.length} />
            {p.ssl && <SslBadge ssl={p.ssl} />}
          </div>
          {p.http?.title && <span style={{ fontFamily:"monospace", fontSize:10, color:"#4b5563" }}>{p.http.title.slice(0,80)}</span>}
          {p.banner && !p.http?.title && <span style={{ fontFamily:"monospace", fontSize:9, color:"#1f4020", fontStyle:"italic" }}>{p.banner.split("\n")[0].slice(0,80)}</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:"#22c55e", boxShadow:"0 0 6px #22c55e" }}/>
          <span style={{ fontFamily:"monospace", fontSize:10, color:"#22c55e", letterSpacing:"0.1em" }}>OPEN</span>
          {hasExtra && <span style={{ fontFamily:"monospace", fontSize:10, color:"#374151", marginLeft:4 }}>{expanded?"▲":"▼"}</span>}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && hasExtra && (
        <div style={{ borderTop:"1px solid #0f1923", padding:"10px 16px 10px 17px", display:"flex", flexDirection:"column", gap:10, background:"#060608" }}>

          {/* Banner */}
          {p.banner && (
            <div>
              <p style={{ fontFamily:"monospace", fontSize:9, color:"#374151", letterSpacing:"0.1em", marginBottom:5 }}>BANNER</p>
              <pre style={{ fontFamily:"monospace", fontSize:10, color:"#4ade80", background:"#050507", border:"1px solid #0f1923", borderRadius:6, padding:"8px 10px", margin:0, whiteSpace:"pre-wrap", wordBreak:"break-all", maxHeight:100, overflow:"auto" }}>{p.banner}</pre>
            </div>
          )}

          {/* SSL cert */}
          {p.ssl && !p.ssl.error && (
            <div>
              <p style={{ fontFamily:"monospace", fontSize:9, color:"#374151", letterSpacing:"0.1em", marginBottom:6 }}>TLS CERTIFICATE</p>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6 }}>
                {[
                  ["CN",        p.ssl.subject_cn],
                  ["ISSUER",    p.ssl.issuer_cn],
                  ["TLS VER",   p.ssl.tls_version],
                  ["EXPIRES",   p.ssl.not_after?.slice(0,12)],
                  ["DAYS LEFT", p.ssl.expired?"EXPIRED":p.ssl.expiry_days+"d"],
                  ["SELF-SIGNED", p.ssl.self_signed?"YES":"NO"],
                ].map(([l,v])=>(
                  <div key={l} style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:6, padding:"6px 9px" }}>
                    <p style={{ fontFamily:"monospace", fontSize:8, color:"#374151", marginBottom:2 }}>{l}</p>
                    <p style={{ fontFamily:"monospace", fontSize:11, color: l==="DAYS LEFT"&&(p.ssl.expired||p.ssl.expiry_days<30)?"#ef4444":"#86efac", margin:0 }}>{v||"—"}</p>
                  </div>
                ))}
              </div>
              {p.ssl.sans?.length>0 && (
                <div style={{ marginTop:6 }}>
                  <p style={{ fontFamily:"monospace", fontSize:9, color:"#374151", letterSpacing:"0.1em", marginBottom:4 }}>SUBJECT ALT NAMES ({p.ssl.sans.length})</p>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                    {p.ssl.sans.map(s=>(
                      <span key={s} style={{ fontFamily:"monospace", fontSize:9, color:"#67e8f9", background:"#00100f", border:"1px solid #164e63", padding:"1px 6px", borderRadius:3 }}>{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {p.ssl.warnings?.length>0 && (
                <div style={{ marginTop:6 }}>
                  {p.ssl.warnings.map((w,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:6, marginTop:3 }}>
                      <span style={{ fontFamily:"monospace", fontSize:9, color:"#f97316" }}>⚠ {w}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* HTTP probe */}
          {p.http && !p.http.error && (
            <div>
              <p style={{ fontFamily:"monospace", fontSize:9, color:"#374151", letterSpacing:"0.1em", marginBottom:6 }}>HTTP RESPONSE</p>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                  <span style={{ fontFamily:"monospace", fontSize:10, color: p.http.status<400?"#4ade80":"#f87171" }}>HTTP {p.http.status}</span>
                  {p.http.server && <span style={{ fontFamily:"monospace", fontSize:10, color:"#4b5563" }}>Server: {p.http.server}</span>}
                  {p.http.powered_by && <span style={{ fontFamily:"monospace", fontSize:10, color:"#4b5563" }}>X-Powered-By: {p.http.powered_by}</span>}
                </div>
                {p.http.title && <span style={{ fontFamily:"monospace", fontSize:11, color:"#86efac" }}>"{p.http.title}"</span>}
                {p.http.final_url && <a href={p.http.final_url} target="_blank" rel="noopener noreferrer" style={{ fontFamily:"monospace", fontSize:10, color:"#67e8f9", textDecoration:"none" }}>{p.http.final_url}</a>}
                {p.http.redirects?.length>0 && (
                  <div>
                    <p style={{ fontFamily:"monospace", fontSize:9, color:"#374151", marginBottom:3 }}>REDIRECTS</p>
                    {p.http.redirects.map((r,i)=><p key={i} style={{ fontFamily:"monospace", fontSize:9, color:"#4b5563", margin:"1px 0" }}>→ {r}</p>)}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CVEs */}
          {p.cves?.length>0 && (
            <div>
              <p style={{ fontFamily:"monospace", fontSize:9, color:"#f97316", letterSpacing:"0.1em", marginBottom:6 }}>NVD CVEs FOR {p.software} {p.version||""}</p>
              <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                {p.cves.map((c,i)=>{
                  const score=parseFloat(c.score||0);
                  const sc=score>=9?"#ef4444":score>=7?"#f97316":score>=4?"#eab308":"#22c55e";
                  return (
                    <div key={i} style={{ background:"#0f0600", border:"1px solid #7c2d12", borderRadius:6, padding:"7px 10px" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:3 }}>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          {c.score&&<span style={{ fontFamily:"monospace", fontSize:9, fontWeight:700, color:sc }}>CVSS {c.score}</span>}
                          {c.severity&&<span style={{ fontFamily:"monospace", fontSize:9, color:sc }}>{c.severity}</span>}
                          <span style={{ fontFamily:"monospace", fontSize:9, color:"#374151" }}>{c.published}</span>
                        </div>
                        <a href={c.url} target="_blank" rel="noopener noreferrer"
                          style={{ fontFamily:"monospace", fontSize:9, color:"#f97316", textDecoration:"none", border:"1px solid #7c2d12", padding:"1px 6px", borderRadius:3 }}>
                          {c.cve_id} ↗
                        </a>
                      </div>
                      <p style={{ fontFamily:"monospace", fontSize:10, color:"#9ca3af", margin:0, wordBreak:"break-word" }}>{c.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PortScanView({ subdomains, savedResults, onResultsChange }) {
  const [results, setResults]   = useState(savedResults||null);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState(null);
  const [progress, setProgress] = useState(0);
  const [filter, setFilter]     = useState("");
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [opts, setOpts] = useState({ grab_banners:true, check_ssl:true, http_probe:true, lookup_cves:true });

  useEffect(()=>{
    if(savedResults){
      setResults(savedResults);
      const first=Object.entries(savedResults).find(([,r])=>r?.open_ports?.length>0);
      if(first) setSelected(first[0]);
    }
  },[savedResults]);

  const run = async()=>{
    if(!subdomains.length) return;
    setLoading(true); setResults(null); setProgress(0); setSelected(null);
    const batch=5; const all={};
    for(let i=0;i<subdomains.length;i+=batch){
      try{
        const res=await axios.post(`${API}/recon/portscan`,{subdomains:subdomains.slice(i,i+batch),...opts});
        Object.assign(all,res.data);
      }catch{}
      setProgress(Math.round(Math.min(((i+batch)/subdomains.length)*100,100)));
    }
    setResults(all); onResultsChange?.(all); setLoading(false);
    const first=Object.entries(all).find(([,r])=>r?.open_ports?.length>0);
    if(first) setSelected(first[0]);
  };

  const hostsWithPorts = useMemo(()=>{
    if(!results) return [];
    return Object.entries(results)
      .filter(([,r])=>r.open_ports?.length>0)
      .filter(([sub])=>!filter||sub.toLowerCase().includes(filter.toLowerCase()))
      .sort((a,b)=>{
        const ra=RISK[a[1].risk?.level||"low"]?.label||"low";
        const rb=RISK[b[1].risk?.level||"low"]?.label||"low";
        return (b[1].risk?.score||0)-(a[1].risk?.score||0);
      });
  },[results,filter]);

  const selResult = selected&&results?.[selected];

  const filteredPorts = useMemo(()=>{
    if(!selResult) return [];
    if(riskFilter==="ALL") return selResult.open_ports;
    return selResult.open_ports.filter(p=>(p.risk||PORT_RISK[p.port]||"low")===riskFilter.toLowerCase());
  },[selResult,riskFilter]);

  const stats = useMemo(()=>{
    if(!results) return {};
    const all=Object.values(results).flatMap(r=>r.open_ports||[]);
    const byRisk={critical:0,high:0,medium:0,low:0};
    all.forEach(p=>{const r=p.risk||PORT_RISK[p.port]||"low"; byRisk[r]++;});
    const withCve=all.filter(p=>p.cves?.length>0).length;
    const withBanner=all.filter(p=>p.banner).length;
    const withSsl=all.filter(p=>p.ssl&&!p.ssl.error).length;
    const expiredSsl=all.filter(p=>p.ssl?.expired).length;
    return{total:all.length, byRisk, hosts:hostsWithPorts.length, withCve, withBanner, withSsl, expiredSsl};
  },[results,hostsWithPorts]);

  const toggleOpt = k => setOpts(o=>({...o,[k]:!o[k]}));

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

      {/* Header */}
      <div style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:12, padding:"16px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:loading?"#f97316":results?"#22c55e":"#1f2937", boxShadow:loading?"0 0 8px #f97316":results?"0 0 8px #22c55e":"none" }}/>
              <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:700, color:"#4ade80", letterSpacing:"0.15em" }}>PORT SCANNER</span>
            </div>
            <span style={{ fontFamily:"monospace", fontSize:11, color:"#1f2937" }}>
              {subdomains.length} hosts · {Object.keys(PORT_RISK).length} ports · banner grab · SSL · CVE lookup
            </span>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {/* Options toggles */}
            <div style={{ display:"flex", gap:10 }}>
              {[["grab_banners","Banners"],["check_ssl","SSL"],["http_probe","HTTP"],["lookup_cves","CVEs"]].map(([k,l])=>(
                <label key={k} style={{ display:"flex", alignItems:"center", gap:4, cursor:"pointer" }}>
                  <input type="checkbox" checked={opts[k]} onChange={()=>toggleOpt(k)} style={{ accentColor:"#22c55e" }}/>
                  <span style={{ fontFamily:"monospace", fontSize:9, color:"#374151" }}>{l}</span>
                </label>
              ))}
            </div>
            <button onClick={run} disabled={loading||!subdomains.length} style={{
              padding:"10px 24px", borderRadius:8, cursor:loading?"not-allowed":"pointer",
              fontFamily:"monospace", fontSize:12, fontWeight:700,
              background:loading?"#0d1117":"linear-gradient(135deg,#166534,#15803d)",
              border:`1px solid ${loading?"#1f2937":"#22c55e55"}`,
              color:loading?"#374151":"#fff",
              boxShadow:loading?"none":"0 0 20px #22c55e22", transition:"all 0.2s",
            }}>{loading?`SCANNING ${progress}%`:results?"↺  RE-SCAN":"▶  START SCAN"}</button>
          </div>
        </div>
        {loading&&(
          <div style={{ marginTop:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontFamily:"monospace", fontSize:10, color:"#374151" }}>
                {[opts.grab_banners&&"banners",opts.check_ssl&&"SSL certs",opts.http_probe&&"HTTP titles",opts.lookup_cves&&"CVE lookup"].filter(Boolean).join(" · ")}…
              </span>
              <span style={{ fontFamily:"monospace", fontSize:10, color:"#f97316" }}>{progress}%</span>
            </div>
            <div style={{ height:3, background:"#0f1923", borderRadius:99, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${progress}%`, background:"linear-gradient(90deg,#166534,#22c55e)", borderRadius:99, transition:"width 0.3s" }}/>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      {results&&(
        <div style={{ display:"grid", gridTemplateColumns:"repeat(8,1fr)", gap:6 }}>
          {[
            {label:"HOSTS",    value:subdomains.length,      color:"#6b7280"},
            {label:"OPEN",     value:stats.hosts,            color:"#4ade80"},
            {label:"CRITICAL", value:stats.byRisk?.critical, color:"#ef4444"},
            {label:"HIGH",     value:stats.byRisk?.high,     color:"#f97316"},
            {label:"TOTAL PORTS",value:stats.total,          color:"#60a5fa"},
            {label:"W/ CVEs",  value:stats.withCve,          color:"#f97316"},
            {label:"TLS CERTS",value:stats.withSsl,          color:"#67e8f9"},
            {label:"EXPIRED TLS",value:stats.expiredSsl,     color:stats.expiredSsl>0?"#ef4444":"#374151"},
          ].map(s=>(
            <div key={s.label} style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:8, padding:"8px 12px", borderTop:`2px solid ${s.color}` }}>
              <div style={{ fontFamily:"monospace", fontSize:8, color:"#374151", letterSpacing:"0.08em", marginBottom:3 }}>{s.label}</div>
              <div style={{ fontFamily:"monospace", fontSize:18, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main split panel */}
      {results&&(
        <div style={{ display:"grid", gridTemplateColumns:"260px 1fr", gap:10, height:520 }}>

          {/* Left — host list */}
          <div style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:12, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            <div style={{ padding:"10px 12px", borderBottom:"1px solid #0f1923" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:7 }}>
                <span style={{ fontFamily:"monospace", fontSize:9, color:"#374151", letterSpacing:"0.1em" }}>HOSTS</span>
                <span style={{ fontFamily:"monospace", fontSize:9, color:"#22c55e" }}>{hostsWithPorts.length} open</span>
              </div>
              <input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter hosts..."
                style={{ width:"100%", boxSizing:"border-box", background:"#050507", border:"1px solid #0f1923", borderRadius:6, padding:"6px 10px", fontFamily:"monospace", fontSize:11, color:"#86efac", outline:"none" }}
                onFocus={e=>e.target.style.borderColor="#166534"} onBlur={e=>e.target.style.borderColor="#0f1923"}/>
            </div>
            <div style={{ flex:1, overflowY:"auto" }}>
              {hostsWithPorts.map(([sub,r])=>{
                const rl = r.risk?.level||"low";
                const rc = RISK[rl];
                const isSel=selected===sub;
                const hasCritical=r.open_ports.some(p=>(p.risk||PORT_RISK[p.port]||"low")==="critical");
                return (
                  <button key={sub} onClick={()=>setSelected(sub)} style={{
                    width:"100%", textAlign:"left", padding:"9px 12px",
                    background:isSel?"#0d1117":"transparent",
                    borderTop:"none", borderRight:"none",
                    borderBottom:"1px solid #0a0c0f",
                    borderLeft:`3px solid ${isSel?rc.color:"transparent"}`,
                    cursor:"pointer", transition:"all 0.12s",
                  }}
                    onMouseEnter={e=>{if(!isSel)e.currentTarget.style.background="#0a0d10";}}
                    onMouseLeave={e=>{if(!isSel)e.currentTarget.style.background="transparent";}}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                      <span style={{ fontFamily:"monospace", fontSize:11, color:isSel?"#67e8f9":hasCritical?"#f87171":"#4b5563", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:160 }}>{sub}</span>
                      <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                        <RiskBadge risk={rl} small />
                        <span style={{ fontFamily:"monospace", fontSize:9, color:rc.color }}>{r.open_ports.length}</span>
                      </div>
                    </div>
                    {/* Port strip */}
                    <div style={{ display:"flex", gap:2, flexWrap:"wrap" }}>
                      {r.open_ports.slice(0,10).map(p=>{
                        const pr=p.risk||PORT_RISK[p.port]||"low";
                        return <div key={p.port} style={{ width:4, height:4, borderRadius:1, background:RISK[pr].color, opacity:0.8 }}/>;
                      })}
                      {r.open_ports.length>10&&<span style={{ fontSize:8, color:"#374151", fontFamily:"monospace" }}>+{r.open_ports.length-10}</span>}
                    </div>
                    {/* Risk reasons */}
                    {isSel&&r.risk?.reasons?.length>0&&(
                      <div style={{ marginTop:6 }}>
                        {r.risk.reasons.slice(0,2).map((reason,i)=>(
                          <p key={i} style={{ fontFamily:"monospace", fontSize:8, color:"#f97316", margin:"1px 0" }}>⚠ {reason}</p>
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
              {hostsWithPorts.length===0&&<div style={{ padding:20, textAlign:"center", fontFamily:"monospace", fontSize:11, color:"#1f2937" }}>No open ports found</div>}
            </div>
          </div>

          {/* Right — port detail */}
          <div style={{ background:"#080c10", border:"1px solid #0f1923", borderRadius:12, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            {selResult?(
              <>
                {/* Detail header */}
                <div style={{ padding:"12px 18px", borderBottom:"1px solid #0f1923" }}>
                  <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:6 }}>
                    <div>
                      <a href={`https://${selected}`} target="_blank" rel="noopener noreferrer"
                        style={{ fontFamily:"monospace", fontSize:13, color:"#67e8f9", textDecoration:"none", fontWeight:600 }}>
                        {selected}
                      </a>
                      <div style={{ fontFamily:"monospace", fontSize:10, color:"#374151", marginTop:2 }}>
                        {selResult.open_ports.length} open ports · risk score {selResult.risk?.score||0}
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:4 }}>
                      {["ALL","CRITICAL","HIGH","MEDIUM","LOW"].map(rf=>{
                        const rk=rf.toLowerCase();
                        const count=rf==="ALL"?selResult.open_ports.length:selResult.open_ports.filter(p=>(p.risk||PORT_RISK[p.port]||"low")===rk).length;
                        if(rf!=="ALL"&&count===0) return null;
                        const rc2=rf!=="ALL"?RISK[rk]:null;
                        return (
                          <button key={rf} onClick={()=>setRiskFilter(rf)} style={{
                            padding:"3px 9px", borderRadius:4, cursor:"pointer",
                            fontFamily:"monospace", fontSize:8, fontWeight:700, letterSpacing:"0.06em",
                            background:riskFilter===rf?(rc2?rc2.bg:"#0d1117"):"transparent",
                            border:`1px solid ${riskFilter===rf?(rc2?rc2.color:"#374151"):"#1f2937"}`,
                            color:riskFilter===rf?(rc2?rc2.color:"#9ca3af"):"#374151",
                            transition:"all 0.15s",
                          }}>{rf}{count>0&&` (${count})`}</button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Risk reasons for host */}
                  {selResult.risk?.reasons?.length>0&&(
                    <div style={{ display:"flex", flexDirection:"column", gap:3, marginTop:4 }}>
                      {selResult.risk.reasons.map((reason,i)=>(
                        <div key={i} style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontFamily:"monospace", fontSize:9, color:"#f97316" }}>⚠</span>
                          <span style={{ fontFamily:"monospace", fontSize:10, color:"#6b7280" }}>{reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Column headers */}
                <div style={{ display:"grid", gridTemplateColumns:"52px 1fr auto", padding:"5px 16px 5px 17px", borderBottom:"1px solid #0f1923", background:"#050507" }}>
                  {["PORT","SERVICE / BANNER / CVEs","STATUS"].map(h=>(
                    <span key={h} style={{ fontFamily:"monospace", fontSize:9, color:"#1f2937", letterSpacing:"0.1em" }}>{h}</span>
                  ))}
                </div>

                {/* Port rows */}
                <div style={{ flex:1, overflowY:"auto" }}>
                  {filteredPorts.map((p,i)=><PortRow key={p.port} p={p} idx={i}/>)}
                  {filteredPorts.length===0&&<div style={{ padding:24, textAlign:"center", fontFamily:"monospace", fontSize:11, color:"#1f2937" }}>No ports matching filter</div>}
                </div>
              </>
            ):(
              <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12 }}>
                <div style={{ fontFamily:"monospace", fontSize:36, color:"#0f1923" }}>⬡</div>
                <span style={{ fontFamily:"monospace", fontSize:12, color:"#1f2937" }}>Select a host to inspect ports</span>
              </div>
            )}
          </div>
        </div>
      )}

      {!results&&!loading&&(
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12, padding:60 }}>
          <div style={{ fontFamily:"monospace", fontSize:48, color:"#0f1923" }}>⬡</div>
          <p style={{ fontFamily:"monospace", fontSize:13, color:"#1f2937" }}>No scan results yet</p>
          <p style={{ fontFamily:"monospace", fontSize:11, color:"#111827" }}>Click START SCAN to probe {subdomains.length} hosts · banners · SSL · CVEs</p>
        </div>
      )}
    </div>
  );
}