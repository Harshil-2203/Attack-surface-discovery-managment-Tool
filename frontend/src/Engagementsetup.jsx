import { useState, useEffect } from "react";

const STEPS = ["operator", "organization", "scope", "confirm"];

const STEP_META = {
  operator: {
    title: "OPERATOR IDENTIFICATION",
    subtitle: "Who is conducting this engagement?",
    icon: "👤",
  },
  organization: {
    title: "TARGET ORGANIZATION",
    subtitle: "Define the organization under assessment",
    icon: "🏢",
  },
  scope: {
    title: "ENGAGEMENT SCOPE",
    subtitle: "Define rules of engagement and authorization",
    icon: "🎯",
  },
  confirm: {
    title: "ENGAGEMENT BRIEF",
    subtitle: "Review and initialize session",
    icon: "📋",
  },
};

function TerminalLine({ text, delay = 0, className = "" }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return (
    <div
      className={`font-mono text-xs transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"} ${className}`}
    >
      {text}
    </div>
  );
}

function InputField({ label, id, type = "text", value, onChange, placeholder, required, hint }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-mono text-green-500 tracking-widest uppercase">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="w-full bg-black border border-gray-700 focus:border-green-500 rounded px-3 py-2.5 text-green-300 font-mono text-sm placeholder-gray-700 outline-none transition-colors"
      />
      {hint && <p className="text-xs text-gray-600 font-mono">{hint}</p>}
    </div>
  );
}

function SelectField({ label, id, value, onChange, options, required }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-mono text-green-500 tracking-widest uppercase">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={onChange}
        className="w-full bg-black border border-gray-700 focus:border-green-500 rounded px-3 py-2.5 text-green-300 font-mono text-sm outline-none transition-colors appearance-none"
      >
        <option value="">— SELECT —</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function TextareaField({ label, id, value, onChange, placeholder, rows = 3, hint }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-mono text-green-500 tracking-widest uppercase">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-black border border-gray-700 focus:border-green-500 rounded px-3 py-2.5 text-green-300 font-mono text-sm placeholder-gray-700 outline-none transition-colors resize-none"
      />
      {hint && <p className="text-xs text-gray-600 font-mono">{hint}</p>}
    </div>
  );
}

// ── Step 1: Operator ──────────────────────────────────────────────────────────
function StepOperator({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <InputField
          label="Analyst Name"
          id="analystName"
          value={data.analystName}
          onChange={e => onChange("analystName", e.target.value)}
          placeholder="John Doe"
          required
        />
        <InputField
          label="Analyst ID / Badge"
          id="analystId"
          value={data.analystId}
          onChange={e => onChange("analystId", e.target.value)}
          placeholder="SEC-0042"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <InputField
          label="Team / Department"
          id="team"
          value={data.team}
          onChange={e => onChange("team", e.target.value)}
          placeholder="Red Team / AppSec"
        />
        <SelectField
          label="Role"
          id="role"
          value={data.role}
          onChange={e => onChange("role", e.target.value)}
          required
          options={[
            { value: "pentester", label: "Penetration Tester" },
            { value: "redteam", label: "Red Team Operator" },
            { value: "bugbounty", label: "Bug Bounty Hunter" },
            { value: "security_engineer", label: "Security Engineer" },
            { value: "ciso", label: "CISO / Security Lead" },
            { value: "student", label: "Student / Researcher" },
          ]}
        />
      </div>
      <InputField
        label="Contact Email"
        id="email"
        type="email"
        value={data.email}
        onChange={e => onChange("email", e.target.value)}
        placeholder="analyst@company.com"
      />
    </div>
  );
}

// ── Step 2: Organization ──────────────────────────────────────────────────────
function StepOrganization({ data, onChange }) {
  return (
    <div className="space-y-5">
      <InputField
        label="Organization Name"
        id="orgName"
        value={data.orgName}
        onChange={e => onChange("orgName", e.target.value)}
        placeholder="Acme Corp"
        required
      />
      <div className="grid grid-cols-2 gap-4">
        <InputField
          label="Primary Domain"
          id="primaryDomain"
          value={data.primaryDomain}
          onChange={e => onChange("primaryDomain", e.target.value)}
          placeholder="acme.com"
          required
          hint="Root domain — subdomains discovered automatically"
        />
        <SelectField
          label="Industry Sector"
          id="sector"
          value={data.sector}
          onChange={e => onChange("sector", e.target.value)}
          options={[
            { value: "fintech", label: "FinTech / Banking" },
            { value: "healthcare", label: "Healthcare" },
            { value: "ecommerce", label: "E-Commerce / Retail" },
            { value: "saas", label: "SaaS / Software" },
            { value: "government", label: "Government" },
            { value: "telecom", label: "Telecom" },
            { value: "media", label: "Media / Entertainment" },
            { value: "education", label: "Education" },
            { value: "other", label: "Other" },
          ]}
        />
      </div>
      <TextareaField
        label="Additional In-Scope Domains / IPs"
        id="additionalScope"
        value={data.additionalScope}
        onChange={e => onChange("additionalScope", e.target.value)}
        placeholder={"beta.acme.com\napi.acme.io\n192.168.1.0/24"}
        rows={3}
        hint="One per line — subdomains, IPs, or CIDR ranges"
      />
      <TextareaField
        label="Known Out-of-Scope Assets"
        id="outOfScope"
        value={data.outOfScope}
        onChange={e => onChange("outOfScope", e.target.value)}
        placeholder={"legacy.acme.com\npartner.acme.com"}
        rows={2}
        hint="Assets explicitly excluded from testing"
      />
    </div>
  );
}

// ── Step 3: Scope & Authorization ─────────────────────────────────────────────
function StepScope({ data, onChange }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <SelectField
          label="Engagement Type"
          id="engagementType"
          value={data.engagementType}
          onChange={e => onChange("engagementType", e.target.value)}
          required
          options={[
            { value: "pentest_black", label: "Pentest — Black Box" },
            { value: "pentest_grey", label: "Pentest — Grey Box" },
            { value: "pentest_white", label: "Pentest — White Box" },
            { value: "redteam", label: "Red Team Operation" },
            { value: "bugbounty", label: "Bug Bounty" },
            { value: "recon_only", label: "Passive Recon Only" },
            { value: "internal_audit", label: "Internal Audit" },
          ]}
        />
        <SelectField
          label="Authorization Level"
          id="authLevel"
          value={data.authLevel}
          onChange={e => onChange("authLevel", e.target.value)}
          required
          options={[
            { value: "written", label: "Written Authorization" },
            { value: "verbal", label: "Verbal Authorization" },
            { value: "bugbounty_program", label: "Bug Bounty Program" },
            { value: "self_owned", label: "Self-Owned Asset" },
            { value: "educational", label: "Educational / Lab" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <InputField
          label="Engagement Start Date"
          id="startDate"
          type="date"
          value={data.startDate}
          onChange={e => onChange("startDate", e.target.value)}
        />
        <InputField
          label="Engagement End Date"
          id="endDate"
          type="date"
          value={data.endDate}
          onChange={e => onChange("endDate", e.target.value)}
        />
      </div>
      <InputField
        label="Case / Ticket Reference"
        id="caseRef"
        value={data.caseRef}
        onChange={e => onChange("caseRef", e.target.value)}
        placeholder="PT-2025-042 / JIRA-1337"
        hint="Internal tracking reference for this engagement"
      />
      <TextareaField
        label="Engagement Notes / Objectives"
        id="notes"
        value={data.notes}
        onChange={e => onChange("notes", e.target.value)}
        placeholder="Focus on external attack surface, API endpoints, and subdomain takeover opportunities..."
        rows={3}
      />

      {/* Legal acknowledgement */}
      <div className="border border-yellow-900/50 rounded p-4 bg-yellow-950/10 space-y-3">
        <p className="text-yellow-500 text-xs font-mono font-bold tracking-wider">⚠ LEGAL ACKNOWLEDGEMENT</p>
        <p className="text-gray-500 text-xs font-mono leading-relaxed">
          By proceeding, you confirm that you have explicit authorization to perform reconnaissance
          and security testing against the specified targets. Unauthorized access to computer systems
          is illegal. The operator accepts full legal responsibility for this engagement.
        </p>
        <label className="flex items-center gap-3 cursor-pointer group">
          <input
            type="checkbox"
            checked={data.acknowledged}
            onChange={e => onChange("acknowledged", e.target.checked)}
            className="w-4 h-4 accent-green-500"
          />
          <span className="text-xs font-mono text-gray-400 group-hover:text-green-400 transition-colors">
            I confirm I have authorization to test these systems
          </span>
        </label>
      </div>
    </div>
  );
}

// ── Step 4: Confirm ───────────────────────────────────────────────────────────
function StepConfirm({ operator, organization, scope }) {
  const sessionId = `ENG-${Date.now().toString(36).toUpperCase()}`;
  const now = new Date().toISOString();

  const rows = [
    ["SESSION ID",       sessionId],
    ["TIMESTAMP",        now],
    ["─────────────────────────────", ""],
    ["OPERATOR",         operator.analystName || "—"],
    ["ROLE",             operator.role || "—"],
    ["TEAM",             operator.team || "—"],
    ["─────────────────────────────", ""],
    ["TARGET ORG",       organization.orgName || "—"],
    ["PRIMARY DOMAIN",   organization.primaryDomain || "—"],
    ["SECTOR",           organization.sector || "—"],
    ["─────────────────────────────", ""],
    ["ENGAGEMENT TYPE",  scope.engagementType || "—"],
    ["AUTHORIZATION",    scope.authLevel || "—"],
    ["CASE REF",         scope.caseRef || "—"],
    ["START DATE",       scope.startDate || "—"],
    ["END DATE",         scope.endDate || "—"],
  ];

  return (
    <div className="space-y-4">
      <div className="bg-black border border-green-900/50 rounded p-5 space-y-1.5">
        {rows.map(([k, v], i) =>
          k.startsWith("─") ? (
            <div key={i} className="text-gray-800 font-mono text-xs py-0.5">{k}</div>
          ) : (
            <div key={i} className="flex gap-3 font-mono text-xs">
              <span className="text-gray-600 w-36 shrink-0">{k}</span>
              <span className="text-green-300">{v}</span>
            </div>
          )
        )}
      </div>
      {organization.notes && (
        <div className="bg-black border border-gray-800 rounded p-4">
          <p className="text-gray-600 font-mono text-xs mb-2">NOTES</p>
          <p className="text-gray-400 font-mono text-xs leading-relaxed">{scope.notes}</p>
        </div>
      )}
      <div className="flex items-center gap-2 text-green-600 font-mono text-xs">
        <span className="animate-pulse">▊</span>
        <span>Ready to initialize attack surface discovery session...</span>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function EngagementSetup({ onComplete }) {
  const [step, setStep] = useState(0);
  const [booting, setBooting] = useState(true);

  const [operator, setOperator] = useState({
    analystName: "", analystId: "", team: "", role: "", email: "",
  });
  const [organization, setOrganization] = useState({
    orgName: "", primaryDomain: "", sector: "", additionalScope: "", outOfScope: "",
  });
  const [scope, setScope] = useState({
    engagementType: "", authLevel: "", startDate: "", endDate: "",
    caseRef: "", notes: "", acknowledged: false,
  });

  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 2200);
    return () => clearTimeout(t);
  }, []);

  const updateOperator = (k, v) => setOperator(p => ({ ...p, [k]: v }));
  const updateOrg = (k, v) => setOrganization(p => ({ ...p, [k]: v }));
  const updateScope = (k, v) => setScope(p => ({ ...p, [k]: v }));

  const canNext = () => {
    if (step === 0) return operator.analystName && operator.role;
    if (step === 1) return organization.orgName && organization.primaryDomain;
    if (step === 2) return scope.engagementType && scope.authLevel && scope.acknowledged;
    return true;
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else {
      onComplete?.({
        operator,
        organization,
        scope,
        sessionId: `ENG-${Date.now().toString(36).toUpperCase()}`,
        startedAt: new Date().toISOString(),
      });
    }
  };

  const currentKey = STEPS[step];
  const meta = STEP_META[currentKey];

  // Boot screen
  if (booting) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-8">
        <div className="space-y-2 w-full max-w-lg">
          <TerminalLine text="ASDMT v2.0 — Attack Surface Discovery & Management Tool" delay={0} className="text-green-400" />
          <TerminalLine text="Initializing forensic session framework..." delay={200} className="text-gray-500" />
          <TerminalLine text="Loading engagement modules... [OK]" delay={500} className="text-gray-600" />
          <TerminalLine text="Loading subdomain engines... [OK]" delay={800} className="text-gray-600" />
          <TerminalLine text="Loading crawl engines (gau, waybackurls, katana)... [OK]" delay={1100} className="text-gray-600" />
          <TerminalLine text="Loading graph analyzer... [OK]" delay={1400} className="text-gray-600" />
          <TerminalLine text="" delay={1600} />
          <TerminalLine text="► OPERATOR AUTHENTICATION REQUIRED" delay={1700} className="text-yellow-400 font-bold" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-green-400 flex flex-col">

      {/* Top bar */}
      <div className="border-b border-gray-900 px-8 py-3 flex items-center justify-between shrink-0">
        <div className="font-mono text-xs text-gray-600 tracking-widest">
          ASDMT v2.0 // ENGAGEMENT INITIALIZATION
        </div>
        <div className="font-mono text-xs text-gray-700">
          {new Date().toISOString()}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar — step nav */}
        <div className="w-56 shrink-0 border-r border-gray-900 p-6 flex flex-col gap-1">
          <p className="text-xs font-mono text-gray-700 tracking-widest mb-4 uppercase">Procedure</p>
          {STEPS.map((s, i) => {
            const m = STEP_META[s];
            const done = i < step;
            const active = i === step;
            return (
              <button
                key={s}
                onClick={() => i < step && setStep(i)}
                className={`text-left px-3 py-2.5 rounded font-mono text-xs transition-all flex items-center gap-2.5
                  ${active ? "bg-green-950/40 text-green-400 border border-green-900/50" : ""}
                  ${done ? "text-gray-500 hover:text-gray-400 cursor-pointer" : ""}
                  ${!active && !done ? "text-gray-700 cursor-not-allowed" : ""}
                `}
              >
                <span>{done ? "✓" : active ? "►" : "○"}</span>
                <span>{m.title.split(" ")[0]}<br />{m.title.split(" ").slice(1).join(" ")}</span>
              </button>
            );
          })}

          <div className="mt-auto pt-6 border-t border-gray-900">
            <div className="space-y-1">
              <div className="flex justify-between font-mono text-xs">
                <span className="text-gray-700">Progress</span>
                <span className="text-green-600">{step + 1}/{STEPS.length}</span>
              </div>
              <div className="h-1 bg-gray-900 rounded overflow-hidden">
                <div
                  className="h-full bg-green-600 transition-all duration-500"
                  style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Main panel */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-8 py-10">

            {/* Step header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{meta.icon}</span>
                <div>
                  <p className="font-mono text-xs text-gray-600 tracking-widest">
                    STEP {step + 1} OF {STEPS.length}
                  </p>
                  <h2 className="font-mono text-lg text-green-400 tracking-wide">
                    {meta.title}
                  </h2>
                </div>
              </div>
              <p className="font-mono text-sm text-gray-500 ml-11">{meta.subtitle}</p>
              <div className="ml-11 mt-3 h-px bg-gradient-to-r from-green-900/50 to-transparent" />
            </div>

            {/* Step content */}
            <div className="mb-10">
              {step === 0 && <StepOperator data={operator} onChange={updateOperator} />}
              {step === 1 && <StepOrganization data={organization} onChange={updateOrg} />}
              {step === 2 && <StepScope data={scope} onChange={updateScope} />}
              {step === 3 && <StepConfirm operator={operator} organization={organization} scope={scope} />}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(s => s - 1)}
                disabled={step === 0}
                className="px-5 py-2.5 font-mono text-sm border border-gray-800 text-gray-500 hover:border-gray-600 hover:text-gray-300 rounded transition-all disabled:opacity-20 disabled:cursor-not-allowed"
              >
                ← BACK
              </button>

              <button
                onClick={handleNext}
                disabled={!canNext()}
                className="px-8 py-2.5 font-mono text-sm bg-green-700 hover:bg-green-600 disabled:bg-gray-900 disabled:text-gray-700 disabled:cursor-not-allowed text-white rounded transition-all active:scale-95 tracking-wider"
              >
                {step === STEPS.length - 1 ? "▶ INITIALIZE SESSION" : "NEXT →"}
              </button>
            </div>

          </div>
        </div>

        {/* Right info panel */}
        <div className="w-48 shrink-0 border-l border-gray-900 p-5 hidden lg:flex flex-col gap-4">
          <p className="text-xs font-mono text-gray-700 tracking-widest uppercase">Field Guide</p>
          {step === 0 && (
            <div className="space-y-3 text-xs font-mono text-gray-700 leading-relaxed">
              <p>Identify the analyst conducting this engagement for audit trail purposes.</p>
              <p className="text-gray-800">All session activity is logged against the operator identity.</p>
            </div>
          )}
          {step === 1 && (
            <div className="space-y-3 text-xs font-mono text-gray-700 leading-relaxed">
              <p>Define the target organization and primary domain for discovery.</p>
              <p className="text-gray-800">Subdomains will be automatically enumerated from the primary domain.</p>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3 text-xs font-mono text-gray-700 leading-relaxed">
              <p>Scope defines what is permitted during this engagement.</p>
              <p className="text-gray-800">Ensure written authorization is obtained before active testing.</p>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3 text-xs font-mono text-gray-700 leading-relaxed">
              <p>Review the engagement brief before initializing the session.</p>
              <p className="text-gray-800">This record will be stored with all findings.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}