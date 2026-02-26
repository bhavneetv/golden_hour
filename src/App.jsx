import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend
} from "recharts";


const BASE_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "/api";

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, options);
  let payload = null;
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    const detail = typeof payload?.detail === "string"
      ? payload.detail
      : Array.isArray(payload?.detail)
        ? payload.detail.map((d) => d?.msg).filter(Boolean).join(", ")
        : null;
    throw new Error(detail || `API ${response.status}`);
  }
  return payload ?? {};
}

const api = {
  triage: (data) => request("/triage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  explain: (patient_id) => request(`/triage/explain?patient_id=${encodeURIComponent(patient_id)}`),
  fairness: () => request("/triage/fairness"),
  referral: (location = "New Delhi, India") => request(`/referral/recommend?location=${encodeURIComponent(location)}`),
  queue: () => request("/queue"),
  nextMove: (patient_id) => request(`/patients/${encodeURIComponent(patient_id)}/next-move-prediction`),
  recommendations: (patient_id) => request(`/recommendations/clinical?patient_id=${encodeURIComponent(patient_id)}`),
  history: (patient_id, limit = 50) => request(`/patients/${encodeURIComponent(patient_id)}/history?limit=${limit}`),
  analyticsSummary: () => request("/analytics/summary"),
};


function genPatientId() {
  const n = Math.floor(Math.random() * 90) + 10;
  return `PAT-2026-0${n}`;
}

function timeSince(iso) {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  const m = Math.floor(diff / 60);
  const s = diff % 60;
  return { minutes: m, seconds: s, total: diff };
}

function timerColor(minutes) {
  if (minutes < 5) return "#22c55e";
  if (minutes <= 10) return "#f97316";
  return "#ef4444";
}

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch { return iso; }
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", { dateStyle: "medium" });
  } catch { return iso; }
}

const INPUT_LIMITS = {
  age: { min: 0, max: 120, label: "Age" },
  heart_rate: { min: 20, max: 240, label: "Heart rate" },
  systolic_bp: { min: 50, max: 260, label: "Systolic BP" },
  spo2: { min: 50, max: 100, label: "SpO2" },
  temperature: { min: 30, max: 45, label: "Temperature" },
};


const icons = {
  dashboard: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>,
  queue: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  add: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>,
  analytics: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  history: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  close: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  refresh: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>,
  bell: <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  alert: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  chevronDown: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>,
  chevronRight: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>,
  search: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  brain: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>,
};


function Spinner({ size = 24 }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ width: size, height: size, border: "2px solid rgba(59,130,246,0.2)", borderTopColor: "#3b82f6", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
    </div>
  );
}


function TriageBadge({ category, size = "sm" }) {
  const colors = {
    RED: { bg: "rgba(239,68,68,0.12)", color: "#ef4444", border: "rgba(239,68,68,0.3)" },
    ORANGE: { bg: "rgba(249,115,22,0.12)", color: "#f97316", border: "rgba(249,115,22,0.3)" },
    YELLOW: { bg: "rgba(234,179,8,0.12)", color: "#eab308", border: "rgba(234,179,8,0.3)" },
    GREEN: { bg: "rgba(34,197,94,0.12)", color: "#22c55e", border: "rgba(34,197,94,0.3)" },
  };
  const s = colors[category] || colors.GREEN;
  const dot = { RED: "🔴", ORANGE: "🟠", YELLOW: "🟡", GREEN: "🟢" }[category] || "🟢";
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 6, padding: size === "lg" ? "4px 14px" : "2px 9px", fontSize: size === "lg" ? 13 : 11, fontWeight: 700, letterSpacing: 0.8, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 8 }}>{dot}</span>{category}
    </span>
  );
}


function TimerCell({ lastUpdated }) {
  const [, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(iv); }, []);
  const { minutes, seconds } = timeSince(lastUpdated);
  const color = timerColor(minutes);
  return <span style={{ color, fontWeight: 700, fontFamily: "monospace", fontSize: 13 }}>{String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}</span>;
}


function VitalBadge({ icon, label, value, unit, warning }) {
  return (
    <div style={{ background: warning ? "rgba(239,68,68,0.06)" : "#f8fafc", borderRadius: 8, padding: "8px 12px", border: `1px solid ${warning ? "rgba(239,68,68,0.2)" : "#f1f5f9"}`, display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontWeight: 800, color: warning ? "#ef4444" : "#0f172a", fontSize: 14, fontFamily: "monospace" }}>{value}<span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8", marginLeft: 2 }}>{unit}</span></div>
      </div>
    </div>
  );
}


function CriticalNotifications({ patients }) {
  const [dismissed, setDismissed] = useState(new Set());
  const [expanded, setExpanded] = useState(true);

  const critical = (patients || []).filter(p =>
    p.triage === "RED" || p.triage === "ORANGE" || p.risk_score >= 60
  ).filter(p => !dismissed.has(p.patient_id));

  if (critical.length === 0) return null;

  const getNotifMessage = (p) => {
    if (p.risk_score >= 80) return `CRITICAL: ${p.patient_id} — Risk ${p.risk_score}/100. Predicted: ${(p.predicted_next_move || "").replace(/_/g, " ")}. Immediate ICU attention required.`;
    if (p.risk_score >= 60) return `WARNING: ${p.patient_id} — Risk ${p.risk_score}/100. Next predicted move: ${(p.predicted_next_move || "").replace(/_/g, " ")}. Monitor closely.`;
    return `ALERT: ${p.patient_id} — Elevated risk ${p.risk_score}/100. Status: ${p.status}.`;
  };

  const getColor = (p) => p.risk_score >= 80 ? "#ef4444" : p.risk_score >= 60 ? "#f97316" : "#eab308";

  return (
    <div style={{ marginBottom: 20, background: "linear-gradient(135deg, #0f172a, #1e293b)", borderRadius: 14, border: "1px solid rgba(239,68,68,0.25)", overflow: "hidden", boxShadow: "0 4px 24px rgba(239,68,68,0.1)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", borderBottom: expanded ? "1px solid rgba(255,255,255,0.07)" : "none", cursor: "pointer" }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse 1.5s infinite" }} />
          <span style={{ color: "#ef4444", fontWeight: 800, fontSize: 13, letterSpacing: 0.5 }}>🚨 CRITICAL ALERTS</span>
          <span style={{ background: "#ef4444", color: "white", borderRadius: 20, padding: "1px 8px", fontSize: 11, fontWeight: 800 }}>{critical.length}</span>
        </div>
        <div style={{ color: "#475569", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11 }}>AI + Dataset Predictions</span>
          {expanded ? icons.chevronDown : icons.chevronRight}
        </div>
      </div>
      {expanded && (
        <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {critical.slice(0, 5).map(p => (
            <div key={p.patient_id} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: "10px 14px", border: `1px solid ${getColor(p)}30`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div style={{ display: "flex", gap: 10, flex: 1 }}>
                <span style={{ fontSize: 16, marginTop: 1 }}>{p.risk_score >= 80 ? "🔴" : p.risk_score >= 60 ? "🟠" : "🟡"}</span>
                <div>
                  <div style={{ fontSize: 12.5, color: "white", fontWeight: 600, lineHeight: 1.5 }}>{getNotifMessage(p)}</div>
                  {p.priority && <div style={{ fontSize: 11, color: getColor(p), marginTop: 3, fontWeight: 700 }}>Priority: {p.priority}</div>}
                </div>
              </div>
              <button onClick={() => setDismissed(d => new Set([...d, p.patient_id]))} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 6, padding: "3px 8px", cursor: "pointer", color: "#64748b", fontSize: 11, whiteSpace: "nowrap" }}>Dismiss</button>
            </div>
          ))}
          {critical.length > 5 && <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", padding: "4px 0" }}>+{critical.length - 5} more alerts</div>}
        </div>
      )}
    </div>
  );
}


function Sidebar({ active, setActive, mobile, onClose }) {
  const nav = [
    { id: "dashboard", label: "Dashboard", icon: icons.dashboard },
    { id: "queue", label: "Emergency Queue", icon: icons.queue },
    { id: "addPatient", label: "Add Patient", icon: icons.add },
    { id: "history", label: "Patient History", icon: icons.history },
    { id: "analytics", label: "Analytics", icon: icons.analytics },
  ];

  return (
    <div style={{ width: 220, minHeight: "100vh", background: "linear-gradient(180deg, #0a0f1e 0%, #0f172a 100%)", display: "flex", flexDirection: "column", position: mobile ? "fixed" : "relative", zIndex: mobile ? 100 : 1, top: 0, left: 0, boxShadow: mobile ? "4px 0 32px rgba(0,0,0,0.5)" : "1px 0 0 rgba(255,255,255,0.05)", borderRight: "1px solid rgba(255,255,255,0.04)" }}>
      <div style={{ padding: "22px 16px 18px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ background: "linear-gradient(135deg, #3b82f6, #1d4ed8)", borderRadius: 10, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(59,130,246,0.4)" }}>
            <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div>
            <div style={{ color: "white", fontWeight: 800, fontSize: 14, letterSpacing: -0.3 }}>GoldenHour</div>
            <div style={{ color: "#475569", fontSize: 11, fontWeight: 500 }}>AI Triage System</div>
          </div>
        </div>
        {mobile && (
          <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.05)", border: "none", color: "#94a3b8", cursor: "pointer", borderRadius: 8, padding: 6 }}>{icons.close}</button>
        )}
      </div>

      <nav style={{ padding: "10px 10px", flex: 1 }}>
        {nav.map((item) => (
          <button key={item.id} onClick={() => { setActive(item.id); onClose && onClose(); }}
            style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer", background: active === item.id ? "rgba(59,130,246,0.15)" : "none", color: active === item.id ? "#60a5fa" : "#64748b", fontWeight: active === item.id ? 600 : 400, fontSize: 13.5, marginBottom: 2, transition: "all 0.15s", textAlign: "left", borderLeft: active === item.id ? "2px solid #3b82f6" : "2px solid transparent" }}>
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div style={{ padding: "14px 16px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
          <span style={{ color: "#475569", fontSize: 11 }}>System Online · v2.0</span>
        </div>
      </div>
    </div>
  );
}


function AddPatientForm({ patientToRetriage, onClearRetriage }) {
  const isRetriage = !!patientToRetriage;

  const [form, setForm] = useState({
    patient_id: patientToRetriage?.patient_id || genPatientId(),
    age: patientToRetriage?.age || patientToRetriage?.vitals?.age || "",
    gender: patientToRetriage?.gender || "Male",
    rural: patientToRetriage?.rural || false,
    heart_rate: patientToRetriage?.vitals?.heart_rate || "",
    systolic_bp: patientToRetriage?.vitals?.systolic_bp || "",
    spo2: patientToRetriage?.vitals?.spo2 || "",
    temperature: patientToRetriage?.vitals?.temperature || "",
    symptoms: Array.isArray(patientToRetriage?.symptoms) ? patientToRetriage.symptoms.join(", ") : (patientToRetriage?.symptoms || ""),
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [nextMove, setNextMove] = useState(null);
  const [recommendations, setRecommendations] = useState([]);

  useEffect(() => {
    if (patientToRetriage) {
      setForm({
        patient_id: patientToRetriage.patient_id || genPatientId(),
        age: patientToRetriage.age || "",
        gender: patientToRetriage.gender || "Male",
        rural: patientToRetriage.rural || false,
        heart_rate: patientToRetriage.vitals?.heart_rate || "",
        systolic_bp: patientToRetriage.vitals?.systolic_bp || "",
        spo2: patientToRetriage.vitals?.spo2 || "",
        temperature: patientToRetriage.vitals?.temperature || "",
        symptoms: Array.isArray(patientToRetriage.symptoms) ? patientToRetriage.symptoms.join(", ") : "",
      });
      setResult(null);
      setError(null);
      setNextMove(null);
      setRecommendations([]);
    }
  }, [patientToRetriage]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setResult(null); setError(null); setNextMove(null); setRecommendations([]);
    try {
      const age = Number(form.age);
      const heartRate = Number(form.heart_rate);
      const systolicBp = Number(form.systolic_bp);
      const spo2 = Number(form.spo2);
      const temperature = Number(form.temperature);

      if (![age, heartRate, systolicBp, spo2, temperature].every(Number.isFinite)) {
        throw new Error("Please fill all required vitals before submitting.");
      }
      const rangeChecks = [
        { key: "age", value: age },
        { key: "heart_rate", value: heartRate },
        { key: "systolic_bp", value: systolicBp },
        { key: "spo2", value: spo2 },
        { key: "temperature", value: temperature },
      ];
      for (const item of rangeChecks) {
        const limits = INPUT_LIMITS[item.key];
        if (item.value < limits.min || item.value > limits.max) {
          throw new Error(`${limits.label} must be between ${limits.min} and ${limits.max}.`);
        }
      }

      const symptoms = form.symptoms
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (symptoms.length > 12) {
        throw new Error("Please provide up to 12 symptoms only.");
      }
      const dedupedSymptoms = [...new Map(symptoms.map((s) => [s.toLowerCase(), s])).values()];

      const payload = {
        patient_id: form.patient_id,
        age,
        gender: form.gender,
        rural: form.rural,
        vitals: { heart_rate: heartRate, systolic_bp: systolicBp, spo2, temperature },
        symptoms: dedupedSymptoms,
      };
      const data = await api.triage(payload);
      setResult(data);
      const [predictionData, recommendationData] = await Promise.all([
        api.nextMove(payload.patient_id).catch(() => null),
        api.recommendations(payload.patient_id).catch(() => null),
      ]);
      setNextMove(predictionData);
      setRecommendations(recommendationData?.recommendations || []);
    } catch (err) {
      setError(err?.message || "Failed to submit triage.");
    }
    setLoading(false);
  };

  const inputStyle = { width: "100%", padding: "9px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13.5, outline: "none", background: "white", color: "#1e293b", boxSizing: "border-box", transition: "border-color 0.15s, box-shadow 0.15s", fontFamily: "inherit" };
  const disabledInputStyle = { ...inputStyle, background: "#f1f5f9", color: "#64748b", cursor: "not-allowed", border: "1px solid #e2e8f0" };
  const labelStyle = { fontSize: 11.5, fontWeight: 600, color: "#64748b", marginBottom: 5, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };
  const sectionStyle = { background: "white", borderRadius: 12, padding: 20, marginBottom: 16, border: "1px solid #f1f5f9", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" };

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            {isRetriage && (
              <span style={{ background: "rgba(249,115,22,0.12)", color: "#f97316", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 6, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>
                🔄 RE-TRIAGE MODE
              </span>
            )}
            <h2 style={{ color: "#0f172a", fontSize: 20, fontWeight: 800, letterSpacing: -0.5 }}>
              {isRetriage ? `Re-triaging ${form.patient_id}` : "Add New Patient"}
            </h2>
          </div>
          <p style={{ color: "#94a3b8", fontSize: 13.5 }}>
            {isRetriage ? "Patient ID & Age are locked for re-triage. Update vitals and symptoms." : "Submit vitals for AI triage assessment"}
          </p>
        </div>
        {isRetriage && (
          <button onClick={onClearRetriage} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "8px 16px", cursor: "pointer", color: "#64748b", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            {icons.close} Cancel Re-triage
          </button>
        )}
      </div>

      {isRetriage && (
        <div style={{ background: "rgba(249,115,22,0.06)", border: "1px solid rgba(249,115,22,0.25)", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>ℹ️</span>
          <span style={{ fontSize: 13, color: "#92400e" }}>
            Re-triage: Patient ID <strong>{form.patient_id}</strong> and Age are locked. A new timestamped record will be created.
          </span>
        </div>
      )}

      {/* Two-column layout: Form left, Result right */}
      <div style={{ display: "grid", gridTemplateColumns: result ? "1fr 1fr" : "1fr", gap: 20, alignItems: "start" }}>
        {/* LEFT: Form */}
        <div>
          <form onSubmit={submit}>
            {/* Patient Info */}
            <div style={sectionStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>Patient Info</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14 }}>
                <div>
                  <label style={labelStyle}>
                    Patient ID {isRetriage && <span style={{ color: "#f97316", fontSize: 10 }}>🔒 LOCKED</span>}
                  </label>
                  <input style={isRetriage ? disabledInputStyle : inputStyle} value={form.patient_id} onChange={isRetriage ? undefined : set("patient_id")} readOnly={isRetriage} disabled={isRetriage} required />
                </div>
                <div>
                  <label style={labelStyle}>Age {isRetriage && <span style={{ color: "#f97316", fontSize: 10 }}>🔒 LOCKED</span>}</label>
                  <input style={isRetriage ? disabledInputStyle : inputStyle} type="number" value={form.age} onChange={isRetriage ? undefined : set("age")} readOnly={isRetriage} disabled={isRetriage} min={INPUT_LIMITS.age.min} max={INPUT_LIMITS.age.max} required />
                </div>
                <div>
                  <label style={labelStyle}>Gender</label>
                  <select style={inputStyle} value={form.gender} onChange={set("gender")}>
                    <option>Male</option><option>Female</option><option>Other</option>
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 22 }}>
                  <input type="checkbox" id="rural" checked={form.rural} onChange={set("rural")} style={{ width: 16, height: 16, accentColor: "#3b82f6" }} />
                  <label htmlFor="rural" style={{ ...labelStyle, marginBottom: 0, cursor: "pointer" }}>Rural Patient</label>
                </div>
              </div>
            </div>

            {/* Vitals */}
            <div style={sectionStyle}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>
                ⚕ Vital Signs {isRetriage && <span style={{ color: "#3b82f6", fontWeight: 400, textTransform: "none", fontSize: 11 }}>— Update with new readings</span>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
                {[
                  { key: "heart_rate", label: "Heart Rate (bpm)", placeholder: "e.g. 82", icon: "❤️", min: INPUT_LIMITS.heart_rate.min, max: INPUT_LIMITS.heart_rate.max, step: 1 },
                  { key: "systolic_bp", label: "Systolic BP (mmHg)", placeholder: "e.g. 120", icon: "🩸", min: INPUT_LIMITS.systolic_bp.min, max: INPUT_LIMITS.systolic_bp.max, step: 1 },
                  { key: "spo2", label: "SpO₂ (%)", placeholder: "e.g. 98", icon: "💧", min: INPUT_LIMITS.spo2.min, max: INPUT_LIMITS.spo2.max, step: "0.1" },
                  { key: "temperature", label: "Temperature (°C)", placeholder: "e.g. 37.2", icon: "🌡️", min: INPUT_LIMITS.temperature.min, max: INPUT_LIMITS.temperature.max, step: "0.1" },
                ].map(({ key, label, placeholder, icon, min, max, step }) => (
                  <div key={key}>
                    <label style={labelStyle}>{icon} {label}</label>
                    <input style={inputStyle} type="number" step={step} min={min} max={max} placeholder={placeholder} value={form[key]} onChange={set(key)} required />
                  </div>
                ))}
              </div>
            </div>

            {/* Symptoms */}
            <div style={sectionStyle}>
              <label style={labelStyle}>Symptoms (comma-separated)</label>
              <input style={inputStyle} placeholder="e.g. chest pain, shortness of breath, dizziness" value={form.symptoms} onChange={set("symptoms")} />
            </div>

            <button type="submit" disabled={loading} style={{ background: loading ? "#93c5fd" : "linear-gradient(135deg, #3b82f6, #2563eb)", color: "white", border: "none", borderRadius: 10, padding: "11px 32px", fontSize: 14, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", boxShadow: loading ? "none" : "0 4px 12px rgba(59,130,246,0.35)", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 8 }}>
              {loading ? <><Spinner size={16} /> Analyzing...</> : `🧠 ${isRetriage ? "Re-submit for Triage" : "Submit for Triage"}`}
            </button>
          </form>

          {error && (
            <div style={{ marginTop: 16, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: 14, color: "#dc2626", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
              ⚠ {error}
            </div>
          )}
        </div>

        {/* RIGHT: Results Panel */}
        {result && (
          <div style={{ animation: "fadeIn 0.5s ease", display: "flex", flexDirection: "column", gap: 14 }}>
            {isRetriage && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "10px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                <span>✅</span>
                <span style={{ fontSize: 13, color: "#166534", fontWeight: 600 }}>
                  Re-triage recorded at {formatDateTime(result.timestamp)} — New record added to patient history.
                </span>
              </div>
            )}

            {/* AI Triage Result Card */}
            <div style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", borderRadius: 14, padding: 22, border: "1px solid rgba(59,130,246,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
                <div style={{ fontWeight: 800, color: "white", fontSize: 15 }}>🧠 AI Triage Result</div>
                <TriageBadge category={result.triage_category} size="lg" />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { label: "Risk Score", value: `${result.risk_score} / 100`, highlight: result.risk_score >= 80 },
                  { label: "Deterioration 60m", value: `${(result.deterioration_probability_60min * 100).toFixed(0)}%` },
                  { label: "Action", value: result.action?.replace("_", " ") },
                  { label: "Confidence", value: result.confidence },
                  { label: "Predicted Move", value: (nextMove?.predicted_next_move || result.predicted_next_move || "N/A").replaceAll("_", " ") },
                  { label: "Priority", value: nextMove?.priority || result.priority || "N/A" },
                ].map(({ label, value, highlight }) => (
                  <div key={label} style={{ background: "rgba(255,255,255,0.05)", borderRadius: 10, padding: "12px 14px", border: "1px solid rgba(255,255,255,0.08)" }}>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                    <div style={{ fontWeight: 800, color: highlight ? "#ef4444" : "white", fontSize: 14 }}>{value}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "8px 12px", marginTop: 10, border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 10, color: "#64748b", marginBottom: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>Timestamp</div>
                <div style={{ fontWeight: 600, color: "#94a3b8", fontSize: 12 }}>{formatDateTime(result.timestamp)}</div>
              </div>
            </div>

            {/* Next Day Prediction */}
            {(nextMove || recommendations.length > 0) && (
              <div style={{ background: "linear-gradient(145deg, #0b1426, #101b33)", borderRadius: 14, padding: 18, border: "1px solid rgba(59,130,246,0.25)", boxShadow: "0 8px 26px rgba(2,6,23,0.35)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 16 }}>🔮</span>
                  <div style={{ fontWeight: 800, color: "#e2e8f0", fontSize: 14 }}>Next-Day Prediction</div>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>AI + Dataset Analysis</span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
                  {[
                    { label: "Next Move", value: (nextMove?.predicted_next_move || result.predicted_next_move || "N/A").replaceAll("_", " ") },
                    { label: "Priority", value: nextMove?.priority || result.priority || "N/A" },
                    { label: "Next-Day Risk (est.)", value: `${nextMove?.critical_risk_estimate_pct ?? 0}% critical risk` },
                    { label: "Likely Outcome", value: `${(nextMove?.likely_outcome || nextMove?.predicted_next_move || "N/A").replaceAll("_", " ")} (${Math.round((nextMove?.likely_outcome_probability || 0) * 100)}%)` },
                    { label: "Model Confidence", value: nextMove?.confidence_band || result.confidence || "N/A" },
                    { label: "Anomaly Score", value: `${nextMove?.anomaly_score ?? result.anomaly_score ?? 0}/100 (${(nextMove?.anomaly_level || result.anomaly_level || "LOW").replaceAll("_", " ")})` },
                    { label: "24h Trajectory", value: (nextMove?.next_24h_trajectory || result.next_24h_trajectory || "STABLE").replaceAll("_", " ") },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 12px", border: "1px solid rgba(255,255,255,0.08)" }}>
                      <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                      <div style={{ fontWeight: 800, color: "white", fontSize: 13 }}>{value}</div>
                    </div>
                  ))}
                </div>

                {nextMove?.probabilities?.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Move Probability Distribution</div>
                    {nextMove.probabilities.map(({ move, probability }) => {
                      const colors = { ICU_ADMISSION: "#ef4444", IN_TREATMENT: "#f97316", REFERRED: "#eab308", OBSERVATION: "#3b82f6", DISCHARGED: "#22c55e" };
                      const col = colors[move] || "#64748b";
                      return (
                        <div key={move} style={{ marginBottom: 6 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 11 }}>
                            <span style={{ color: "#93c5fd" }}>{move.replace(/_/g, " ")}</span>
                            <span style={{ color: col, fontWeight: 700 }}>{Math.round(probability * 100)}%</span>
                          </div>
                          <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${probability * 100}%`, background: col, borderRadius: 3, transition: "width 0.8s ease" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {(nextMove?.ai_watchouts?.length > 0 || result?.ai_watchouts?.length > 0) && (
                  <div style={{ background: "rgba(248,113,113,0.12)", borderRadius: 10, padding: 12, border: "1px solid rgba(248,113,113,0.24)", marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#fecaca", marginBottom: 8 }}>🚨 AI Watchouts</div>
                    {(nextMove?.ai_watchouts || result?.ai_watchouts || []).map((item, idx) => (
                      <div key={idx} style={{ fontSize: 12.5, color: "#fee2e2", marginBottom: 6, display: "flex", alignItems: "flex-start", gap: 7 }}>
                        <span style={{ color: "#fda4af" }}>→</span>{item}
                      </div>
                    ))}
                  </div>
                )}

                {recommendations.length > 0 && (
                  <div style={{ background: "rgba(59,130,246,0.12)", borderRadius: 10, padding: 12, border: "1px solid rgba(59,130,246,0.2)" }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#93c5fd", marginBottom: 8 }}>🤖 AI Clinical Recommendations</div>
                    {recommendations.map((item, idx) => (
                      <div key={idx} style={{ fontSize: 12.5, color: "#e2e8f0", marginBottom: 6, display: "flex", alignItems: "flex-start", gap: 7 }}>
                        <span style={{ color: "#60a5fa" }}>→</span>{item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


function ExplainModal({ patientId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.explain(patientId).then(setData).catch(() => {}).finally(() => setLoading(false)); }, [patientId]);
  const impactColor = { HIGH: "#ef4444", MEDIUM: "#f97316", LOW: "#22c55e" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, animation: "fadeIn 0.2s ease", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 16, padding: 28, width: "min(480px, 92vw)", boxShadow: "0 24px 64px rgba(0,0,0,0.25)", animation: "slideUp 0.3s ease" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17, color: "#0f172a" }}>Explainable AI</div>
            <div style={{ color: "#94a3b8", fontSize: 13, fontFamily: "monospace" }}>{patientId}</div>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", color: "#64748b", padding: 8 }}>{icons.close}</button>
        </div>
        {loading ? <Spinner /> : data && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 10, textTransform: "uppercase", letterSpacing: 1 }}>Top Risk Factors</div>
            {data.top_risk_factors.map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f8fafc", borderRadius: 8, marginBottom: 8, border: "1px solid #f1f5f9" }}>
                <span style={{ fontSize: 14, color: "#1e293b", fontWeight: 500 }}>{f.factor}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: impactColor[f.impact] || "#374151", background: `${impactColor[f.impact]}15`, padding: "2px 10px", borderRadius: 20, border: `1px solid ${impactColor[f.impact]}30` }}>{f.impact}</span>
              </div>
            ))}
            <div style={{ marginTop: 14, background: "#eff6ff", borderRadius: 10, padding: 14, border: "1px solid #bfdbfe" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2563eb", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>💡 Explainability Note</div>
              <div style={{ fontSize: 13, color: "#1e40af", lineHeight: 1.65 }}>{data.explainability_note}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


function PatientHistoryModal({ patientId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.history(patientId, 50).then(setData).catch(e => setError("Could not load patient history.")).finally(() => setLoading(false));
  }, [patientId]);

  const records = data?.records || [];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(2,6,23,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(4px)", animation: "fadeIn 0.2s ease" }} onClick={onClose}>
      <div style={{ background: "white", borderRadius: 18, padding: 0, width: "min(780px, 96vw)", maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 32px 80px rgba(0,0,0,0.3)", animation: "slideUp 0.3s ease" }} onClick={e => e.stopPropagation()}>
        <div style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", padding: "20px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "white", fontWeight: 800, fontSize: 17 }}>📋 Patient History</div>
            <div style={{ color: "#64748b", fontSize: 13, fontFamily: "monospace", marginTop: 2 }}>{patientId}</div>
            {data && (
              <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>
                {records.length} unique records{data.raw_records_scanned ? ` (from ${data.raw_records_scanned} scanned)` : ""} · Latest: {data.latest_triage_category} · {data.latest_status}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 8, cursor: "pointer", color: "#94a3b8", padding: 10 }}>{icons.close}</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px" }}>
          {loading && <Spinner />}
          {error && <div style={{ color: "#ef4444", padding: 16, textAlign: "center" }}>{error}</div>}
          {!loading && !error && records.length === 0 && <div style={{ textAlign: "center", color: "#94a3b8", padding: 32 }}>No records found for this patient.</div>}
          {!loading && records.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {records.map((rec, idx) => (
                <div key={idx} style={{ background: idx === 0 ? "linear-gradient(135deg, #f0f9ff, #eff6ff)" : "#f8fafc", borderRadius: 12, padding: 16, border: `1px solid ${idx === 0 ? "#bfdbfe" : "#f1f5f9"}`, position: "relative" }}>
                  {idx === 0 && <span style={{ position: "absolute", top: 12, right: 12, background: "#3b82f6", color: "white", borderRadius: 20, padding: "2px 10px", fontSize: 10, fontWeight: 700 }}>LATEST</span>}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 12, fontFamily: "monospace", color: "#475569", fontWeight: 600 }}>#{records.length - idx}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{formatDateTime(rec.timestamp)}</span>
                    <TriageBadge category={rec.triage_category} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", background: "#eff6ff", borderRadius: 20, padding: "2px 10px", border: "1px solid #bfdbfe" }}>{rec.status}</span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>Risk: <strong style={{ color: rec.risk_score >= 80 ? "#ef4444" : rec.risk_score >= 60 ? "#f97316" : "#0f172a" }}>{rec.risk_score}</strong>/100</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    {rec.vitals && <>
                      <VitalBadge icon="❤️" label="HR" value={rec.vitals.heart_rate || "—"} unit="bpm" warning={rec.vitals.heart_rate > 100 || rec.vitals.heart_rate < 60} />
                      <VitalBadge icon="🩸" label="BP" value={rec.vitals.systolic_bp || "—"} unit="mmHg" warning={rec.vitals.systolic_bp > 140 || rec.vitals.systolic_bp < 90} />
                      <VitalBadge icon="💧" label="SpO₂" value={rec.vitals.spo2 || "—"} unit="%" warning={rec.vitals.spo2 < 95} />
                      <VitalBadge icon="🌡️" label="Temp" value={rec.vitals.temperature || "—"} unit="°C" warning={rec.vitals.temperature > 38.5} />
                    </>}
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                    <span style={{ color: "#64748b" }}>🧠 Predicted: <strong style={{ color: "#1e293b" }}>{(rec.predicted_next_move || "—").replace(/_/g, " ")}</strong></span>
                    <span style={{ color: "#64748b" }}>Priority: <strong style={{ color: "#1e293b" }}>{rec.priority || "—"}</strong></span>
                    <span style={{ color: "#64748b" }}>Deterioration (60m): <strong style={{ color: "#1e293b" }}>{rec.deterioration_probability_60min != null ? `${(rec.deterioration_probability_60min * 100).toFixed(0)}%` : "—"}</strong></span>
                    {rec.symptoms?.length > 0 && <span style={{ color: "#64748b" }}>Symptoms: <strong style={{ color: "#1e293b" }}>{rec.symptoms.join(", ")}</strong></span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function QueuePage({ onRetriage }) {
  const [queueData, setQueueData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [expandedRow, setExpandedRow] = useState(null);
  const [historyPatient, setHistoryPatient] = useState(null);

  const fetch_ = useCallback(async () => {
    try { const d = await api.queue(); setQueueData(d); } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetch_(); const iv = setInterval(fetch_, 10000); return () => clearInterval(iv); }, [fetch_]);

  const sorted = queueData?.patients?.slice().sort((a, b) => b.risk_score - a.risk_score) || [];
  const categoryStats = ["RED", "ORANGE", "YELLOW", "GREEN"].map(cat => ({ name: cat, count: sorted.filter(p => p.triage === cat).length }));

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      {selected && <ExplainModal patientId={selected} onClose={() => setSelected(null)} />}
      {historyPatient && <PatientHistoryModal patientId={historyPatient} onClose={() => setHistoryPatient(null)} />}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ color: "#0f172a", fontSize: 20, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>Emergency Queue</h2>
          <p style={{ color: "#94a3b8", fontSize: 13 }}>Auto-refreshes every 10s · Click Patient ID for history · Click row to expand vitals</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {queueData && <span style={{ fontSize: 12, color: "#94a3b8" }}>Updated {new Date(queueData.queue_last_updated).toLocaleTimeString()}</span>}
          <button onClick={fetch_} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: "#64748b", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>{icons.refresh} Refresh</button>
        </div>
      </div>

      {/* Category stats */}
      {sorted.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 18 }}>
          {categoryStats.map(({ name, count }) => {
            const clr = { RED: "#ef4444", ORANGE: "#f97316", YELLOW: "#eab308", GREEN: "#22c55e" }[name];
            return (
              <div key={name} style={{ background: "white", borderRadius: 10, padding: "12px 14px", border: "1px solid #f1f5f9", boxShadow: "0 1px 4px rgba(0,0,0,0.04)", borderTop: `3px solid ${clr}` }}>
                <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{name}</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: clr }}>{count}</div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? <Spinner /> : (
        <div style={{ background: "white", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", overflow: "hidden", border: "1px solid #f1f5f9" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                {["Patient", "Triage", "Risk", "Status", "Next Move", "Wait Time", "Actions"].map(h => (
                  <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <Fragment key={p.patient_id}>
                  <tr
                    style={{ borderBottom: "1px solid #f8fafc", cursor: "pointer", transition: "background 0.12s", background: expandedRow === p.patient_id ? "#f0f9ff" : "white" }}
                    onMouseEnter={e => e.currentTarget.style.background = expandedRow === p.patient_id ? "#f0f9ff" : "#fafafa"}
                    onMouseLeave={e => e.currentTarget.style.background = expandedRow === p.patient_id ? "#f0f9ff" : "white"}
                  >
                    <td style={{ padding: "13px 16px" }}>
                      <button onClick={() => setHistoryPatient(p.patient_id)} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5, color: "#3b82f6", fontFamily: "monospace", textDecoration: "underline", textDecorationStyle: "dotted", padding: 0 }} title="Click to view full history">
                        {p.patient_id}
                      </button>
                    </td>
                    <td style={{ padding: "13px 16px" }} onClick={() => setExpandedRow(expandedRow === p.patient_id ? null : p.patient_id)}><TriageBadge category={p.triage} /></td>
                    <td style={{ padding: "13px 16px" }} onClick={() => setExpandedRow(expandedRow === p.patient_id ? null : p.patient_id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 52, height: 5, borderRadius: 3, background: "#f1f5f9", overflow: "hidden" }}>
                          <div style={{ width: `${p.risk_score}%`, height: "100%", background: p.risk_score >= 80 ? "#ef4444" : p.risk_score >= 60 ? "#f97316" : "#22c55e", borderRadius: 3, transition: "width 0.5s" }} />
                        </div>
                        <span style={{ fontWeight: 800, fontSize: 14, color: "#0f172a" }}>{p.risk_score}</span>
                      </div>
                    </td>
                    <td style={{ padding: "13px 16px" }} onClick={() => setExpandedRow(expandedRow === p.patient_id ? null : p.patient_id)}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", background: "#eff6ff", borderRadius: 20, padding: "2px 10px", border: "1px solid #bfdbfe" }}>{p.status}</span>
                    </td>
                    <td style={{ padding: "13px 16px" }} onClick={() => setExpandedRow(expandedRow === p.patient_id ? null : p.patient_id)}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#7c3aed", background: "#f5f3ff", borderRadius: 20, padding: "2px 10px", border: "1px solid #ddd6fe" }}>{(p.predicted_next_move || "—").replace(/_/g, " ")}</span>
                    </td>
                    <td style={{ padding: "13px 16px" }} onClick={() => setExpandedRow(expandedRow === p.patient_id ? null : p.patient_id)}>
                      <TimerCell lastUpdated={queueData.queue_last_updated} />
                    </td>
                    <td style={{ padding: "13px 16px" }}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setSelected(p.patient_id)} style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7, padding: "5px 10px", cursor: "pointer", color: "#3b82f6", fontSize: 11, fontWeight: 700 }}>Explain</button>
                        <button onClick={() => onRetriage(p)} style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 7, padding: "5px 10px", cursor: "pointer", color: "#f97316", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>{icons.refresh} Re-triage</button>
                      </div>
                    </td>
                  </tr>
                  {expandedRow === p.patient_id && p.vitals && (
                    <tr key={`${p.patient_id}-expand`} style={{ background: "#f0f9ff" }}>
                      <td colSpan={7} style={{ padding: "12px 16px 14px 24px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Vital Readings</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <VitalBadge icon="❤️" label="Heart Rate" value={p.vitals?.heart_rate || "—"} unit="bpm" warning={p.vitals?.heart_rate > 100 || p.vitals?.heart_rate < 60} />
                          <VitalBadge icon="🩸" label="Systolic BP" value={p.vitals?.systolic_bp || "—"} unit="mmHg" warning={p.vitals?.systolic_bp > 140 || p.vitals?.systolic_bp < 90} />
                          <VitalBadge icon="💧" label="SpO₂" value={p.vitals?.spo2 || "—"} unit="%" warning={p.vitals?.spo2 < 95} />
                          <VitalBadge icon="🌡️" label="Temperature" value={p.vitals?.temperature || "—"} unit="°C" warning={p.vitals?.temperature > 38.5} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {sorted.length === 0 && (
            <div style={{ padding: 48, textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏥</div>No patients in queue
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function HistoryPage({ onRetriage }) {
  const [queueData, setQueueData] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientHistory, setPatientHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [nextDayPrediction, setNextDayPrediction] = useState(null);
  const [ndpLoading, setNdpLoading] = useState(false);

  useEffect(() => { api.queue().then(setQueueData).catch(() => {}); }, []);

  const allPatients = queueData?.patients || [];
  const filtered = allPatients.filter(p => p.patient_id.toLowerCase().includes(searchQuery.toLowerCase()));

  const loadPatientHistory = async (patientId) => {
    setSelectedPatient(patientId);
    setPatientHistory(null);
    setNextDayPrediction(null);
    setHistoryLoading(true);
    setNdpLoading(true);

    try {
      const hist = await api.history(patientId, 50);
      setPatientHistory(hist);
    } catch { setPatientHistory(null); }
    setHistoryLoading(false);

    try {
      const [moveData, recsData] = await Promise.all([
        api.nextMove(patientId).catch(() => null),
        api.recommendations(patientId).catch(() => null),
      ]);
      setNextDayPrediction({ move: moveData, recs: recsData });
    } catch { }
    setNdpLoading(false);
  };

  const records = patientHistory?.records || [];
  const recordsByDay = records.reduce((acc, rec) => {
    const day = formatDate(rec.timestamp);
    if (!acc[day]) acc[day] = [];
    acc[day].push(rec);
    return acc;
  }, {});

  const getRiskTrend = () => {
    if (records.length < 2) return null;
    const latest = records[0].risk_score;
    const prev = records[1].risk_score;
    if (latest > prev) return { dir: "up", delta: latest - prev, color: "#ef4444" };
    if (latest < prev) return { dir: "down", delta: prev - latest, color: "#22c55e" };
    return { dir: "same", delta: 0, color: "#94a3b8" };
  };

  const trend = getRiskTrend();

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ color: "#0f172a", fontSize: 20, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>Patient History</h2>
        <p style={{ color: "#94a3b8", fontSize: 13.5 }}>Full DB records per patient · Day-by-day breakdown · AI next-day predictions</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16, minHeight: 500 }}>
        {/* Patient list */}
        <div style={{ background: "white", borderRadius: 14, border: "1px solid #f1f5f9", boxShadow: "0 1px 8px rgba(0,0,0,0.05)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 10 }}>All Patients</div>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }}>{icons.search}</span>
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search patient ID..." style={{ width: "100%", padding: "8px 10px 8px 30px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 12.5, outline: "none", boxSizing: "border-box", fontFamily: "inherit" }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>{allPatients.length === 0 ? "No patients found" : "No matches"}</div>}
            {filtered.map(p => (
              <div key={p.patient_id} onClick={() => loadPatientHistory(p.patient_id)} style={{ padding: "12px 16px", borderBottom: "1px solid #f8fafc", cursor: "pointer", background: selectedPatient === p.patient_id ? "#eff6ff" : "white", borderLeft: selectedPatient === p.patient_id ? "3px solid #3b82f6" : "3px solid transparent", transition: "all 0.12s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: selectedPatient === p.patient_id ? "#2563eb" : "#0f172a", fontFamily: "monospace" }}>{p.patient_id}</span>
                  <TriageBadge category={p.triage} />
                </div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>Risk: {p.risk_score} · {p.status}</div>
              </div>
            ))}
          </div>
        </div>

        {/* History detail */}
        <div>
          {!selectedPatient && (
            <div style={{ background: "white", borderRadius: 14, border: "1px solid #f1f5f9", padding: 48, textAlign: "center", color: "#94a3b8" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 600, fontSize: 15, color: "#334155", marginBottom: 6 }}>Select a Patient</div>
              <div style={{ fontSize: 13 }}>Click a patient from the list to view their full history, day-by-day records, and AI next-day predictions.</div>
            </div>
          )}

          {selectedPatient && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Next Day Prediction Card */}
              <div style={{ background: "linear-gradient(135deg, #0f172a, #1e293b)", borderRadius: 14, padding: 20, border: "1px solid rgba(59,130,246,0.2)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>🔮</span>
                  <div style={{ fontWeight: 800, color: "white", fontSize: 14 }}>Next-Day Prediction</div>
                  <span style={{ fontSize: 11, color: "#64748b", marginLeft: "auto" }}>AI + Dataset Analysis</span>
                </div>
                {ndpLoading ? (
                  <div style={{ color: "#64748b", fontSize: 13 }}>Calculating predictions...</div>
                ) : nextDayPrediction ? (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
                      {[
                        { label: "Next Move", value: (nextDayPrediction.move?.predicted_next_move || "—").replace(/_/g, " ") },
                        { label: "Priority", value: nextDayPrediction.move?.priority || "—" },
                        { label: "Next-Day Risk (est.)", value: `${nextDayPrediction.move?.critical_risk_estimate_pct ?? 0}% critical risk` },
                        { label: "Likely Outcome", value: `${(nextDayPrediction.move?.likely_outcome || nextDayPrediction.move?.predicted_next_move || "—").replace(/_/g, " ")} (${Math.round((nextDayPrediction.move?.likely_outcome_probability || 0) * 100)}%)` },
                        { label: "Model Confidence", value: nextDayPrediction.move?.confidence_band || "—" },
                        { label: "Anomaly Score", value: `${nextDayPrediction.move?.anomaly_score ?? 0}/100 (${(nextDayPrediction.move?.anomaly_level || "LOW").replace(/_/g, " ")})` },
                        { label: "24h Trajectory", value: (nextDayPrediction.move?.next_24h_trajectory || "STABLE").replace(/_/g, " ") },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: "10px 14px", border: "1px solid rgba(255,255,255,0.08)" }}>
                          <div style={{ fontSize: 10, color: "#64748b", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
                          <div style={{ fontWeight: 800, color: "white", fontSize: 13 }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {nextDayPrediction.move?.probabilities && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>Move Probability Distribution</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {nextDayPrediction.move.probabilities.map(({ move, probability }) => {
                            const colors = { ICU_ADMISSION: "#ef4444", IN_TREATMENT: "#f97316", REFERRED: "#eab308", OBSERVATION: "#3b82f6", DISCHARGED: "#22c55e" };
                            const col = colors[move] || "#64748b";
                            return (
                              <div key={move} style={{ marginBottom: 4 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, fontSize: 11 }}>
                                  <span style={{ color: "#94a3b8" }}>{move.replace(/_/g, " ")}</span>
                                  <span style={{ color: col, fontWeight: 700 }}>{Math.round(probability * 100)}%</span>
                                </div>
                                <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${probability * 100}%`, background: col, borderRadius: 3, transition: "width 0.8s ease" }} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {nextDayPrediction.move?.ai_watchouts?.length > 0 && (
                      <div style={{ marginBottom: 12, background: "rgba(248,113,113,0.12)", borderRadius: 10, padding: 12, border: "1px solid rgba(248,113,113,0.22)" }}>
                        <div style={{ fontSize: 11, color: "#fecaca", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>AI Watchouts</div>
                        {nextDayPrediction.move.ai_watchouts.map((watch, i) => (
                          <div key={i} style={{ fontSize: 12, color: "#fee2e2", marginBottom: 5, display: "flex", gap: 6 }}>
                            <span style={{ color: "#fda4af" }}>→</span>{watch}
                          </div>
                        ))}
                      </div>
                    )}

                    {nextDayPrediction.recs?.recommendations?.length > 0 && (
                      <div style={{ background: "rgba(59,130,246,0.08)", borderRadius: 10, padding: 12, border: "1px solid rgba(59,130,246,0.15)" }}>
                        <div style={{ fontSize: 11, color: "#93c5fd", fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>🤖 AI Clinical Recommendations</div>
                        {nextDayPrediction.recs.recommendations.map((rec, i) => (
                          <div key={i} style={{ fontSize: 12, color: "#cbd5e1", marginBottom: 4, display: "flex", gap: 6 }}>
                            <span style={{ color: "#3b82f6" }}>→</span>{rec}
                          </div>
                        ))}
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>Source: {nextDayPrediction.recs.recommendation_source || "rule engine"}</div>
                      </div>
                    )}
                  </div>
                ) : <div style={{ color: "#64748b", fontSize: 13 }}>No prediction data available.</div>}
              </div>

              {/* Risk Trend + Mini Chart side by side */}
              {records.length > 1 && (
                <div style={{ display: "grid", gridTemplateColumns: trend ? "1fr 2fr" : "1fr", gap: 14 }}>
                  {trend && (
                    <div style={{ background: "white", borderRadius: 12, padding: 16, border: "1px solid #f1f5f9", display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
                      <div style={{ fontSize: 32, textAlign: "center" }}>{trend.dir === "up" ? "📈" : trend.dir === "down" ? "📉" : "➡️"}</div>
                      <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", textAlign: "center" }}>Risk Trend</div>
                      <div style={{ fontSize: 12, color: trend.color, fontWeight: 600, textAlign: "center" }}>
                        {trend.dir === "up" ? `▲ +${trend.delta} pts since last visit` : trend.dir === "down" ? `▼ -${trend.delta} pts since last visit` : "No change since last visit"}
                      </div>
                      <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase" }}>Records</div>
                          <div style={{ fontWeight: 800, fontSize: 20, color: "#0f172a" }}>{records.length}</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "#94a3b8", textTransform: "uppercase" }}>Days</div>
                          <div style={{ fontWeight: 800, fontSize: 20, color: "#0f172a" }}>{Object.keys(recordsByDay).length}</div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div style={{ background: "white", borderRadius: 12, padding: 18, border: "1px solid #f1f5f9" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a", marginBottom: 14 }}>📊 Risk Score Timeline</div>
                    <ResponsiveContainer width="100%" height={130}>
                      <LineChart data={[...records].reverse().map((r, i) => ({ t: i + 1, risk: r.risk_score }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
                        <XAxis dataKey="t" hide />
                        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#cbd5e1" }} />
                        <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }} formatter={(v) => [`${v}`, "Risk Score"]} />
                        <Line type="monotone" dataKey="risk" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3, fill: "#ef4444" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Day-by-day records */}
              {historyLoading ? <Spinner /> : (
                <div style={{ background: "white", borderRadius: 14, border: "1px solid #f1f5f9", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>Day-by-Day Records</div>
                    <button onClick={() => {
                      const fromQueue = allPatients.find(p => p.patient_id === selectedPatient);
                      const latestRecord = records[0];
                      const fallback = latestRecord ? { patient_id: selectedPatient, age: latestRecord.age, gender: latestRecord.gender, rural: latestRecord.rural, vitals: latestRecord.vitals, symptoms: latestRecord.symptoms } : { patient_id: selectedPatient };
                      onRetriage(fromQueue || fallback);
                    }} style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: "#f97316", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                      {icons.refresh} Re-triage
                    </button>
                  </div>
                  <div style={{ padding: "14px 20px" }}>
                    {Object.keys(recordsByDay).length === 0 && <div style={{ color: "#94a3b8", textAlign: "center", padding: 24 }}>No records found.</div>}
                    {Object.entries(recordsByDay).map(([day, dayRecords]) => (
                      <div key={day} style={{ marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />📅 {day}<div style={{ flex: 1, height: 1, background: "#f1f5f9" }} />
                        </div>
                        {dayRecords.map((rec, idx) => (
                          <div key={idx} style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid #f1f5f9" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>🕐 {new Date(rec.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                              <TriageBadge category={rec.triage_category} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#3b82f6", background: "#eff6ff", borderRadius: 20, padding: "2px 8px", border: "1px solid #bfdbfe" }}>{rec.status}</span>
                              <span style={{ fontSize: 12, color: rec.risk_score >= 80 ? "#ef4444" : "#64748b" }}>Risk: <strong>{rec.risk_score}</strong>/100</span>
                              <span style={{ fontSize: 12, color: "#7c3aed", background: "#f5f3ff", borderRadius: 20, padding: "2px 8px", border: "1px solid #ddd6fe", fontWeight: 600 }}>→ {(rec.predicted_next_move || "—").replace(/_/g, " ")}</span>
                            </div>
                            {rec.vitals && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <VitalBadge icon="❤️" label="HR" value={rec.vitals.heart_rate || "—"} unit="bpm" warning={rec.vitals.heart_rate > 100} />
                                <VitalBadge icon="🩸" label="BP" value={rec.vitals.systolic_bp || "—"} unit="mmHg" warning={rec.vitals.systolic_bp > 140 || rec.vitals.systolic_bp < 90} />
                                <VitalBadge icon="💧" label="SpO₂" value={rec.vitals.spo2 || "—"} unit="%" warning={rec.vitals.spo2 < 95} />
                                <VitalBadge icon="🌡️" label="Temp" value={rec.vitals.temperature || "—"} unit="°C" warning={rec.vitals.temperature > 38.5} />
                              </div>
                            )}
                            {rec.symptoms?.length > 0 && <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>Symptoms: {rec.symptoms.join(", ")}</div>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function FairnessCard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.fairness().then(setData).catch(() => {}); }, []);
  if (!data) return null;
  const passed = data.fairness_check === "PASSED";
  return (
    <div style={{ background: "white", borderRadius: 12, padding: 18, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", border: `1px solid ${passed ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)"}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>⚖ Fairness Check</div>
        <span style={{ background: passed ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: passed ? "#22c55e" : "#ef4444", border: `1px solid ${passed ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{data.fairness_check}</span>
      </div>
      <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: 0 }}>{data.note}</p>
      {data.alerts?.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: "#ef4444" }}>{data.alerts.map((a, i) => <div key={i}>⚠ {a}</div>)}</div>}
    </div>
  );
}


function ReferralCard() {
  const hospitals = [
    {
      name: "MM Hospital Emergency Ward",
      location: "Mullana",
      distance_km: 0,
      eta_min: 0,
      facility: "PRIMARY",
      accent: "#22c55e",
    },
    {
      name: "Civil Hospital Ambala",
      location: "Ambala",
      distance_km: 34,
      eta_min: 45,
      facility: "BACKUP",
      accent: "#3b82f6",
    },
  ];

  return (
    <div style={{ background: "white", borderRadius: 12, padding: 18, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9" }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 12 }}>🏥 Nearest Referral</div>
      <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10 }}></div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {hospitals.map((h) => (
          <div key={h.name} style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 12px", border: "1px solid #e2e8f0", borderLeft: `3px solid ${h.accent}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b" }}>{h.name}</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: h.accent, background: `${h.accent}15`, border: `1px solid ${h.accent}30`, borderRadius: 20, padding: "1px 8px" }}>{h.facility}</span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{h.location}</div>
            <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
              <span style={{ color: "#0f172a", fontWeight: 600 }}>Distance: {h.distance_km} km</span>
              <span style={{ color: "#475569" }}>ETA: {h.eta_min} min</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function TopPatientsCard({ patients, onRetriage, onExplain }) {
  const top3 = [...(patients || [])].sort((a, b) => b.risk_score - a.risk_score).slice(0, 3);

  if (top3.length === 0) return (
    <div style={{ background: "white", borderRadius: 12, padding: 20, border: "1px solid #f1f5f9", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 12 }}>🔥 Top Critical Patients</div>
      <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "20px 0" }}>No patients in queue</div>
    </div>
  );

  return (
    <div style={{ background: "white", borderRadius: 12, padding: 18, border: "1px solid #f1f5f9", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 14 }}>🔥 Top Critical Patients</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {top3.map((p, idx) => (
          <div key={p.patient_id} style={{ background: idx === 0 ? "linear-gradient(135deg, #fef2f2, #fff7f7)" : "#f8fafc", borderRadius: 10, padding: "12px 14px", border: `1px solid ${idx === 0 ? "rgba(239,68,68,0.15)" : "#f1f5f9"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ background: idx === 0 ? "#ef4444" : idx === 1 ? "#f97316" : "#eab308", color: "white", borderRadius: 6, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800 }}>#{idx + 1}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5, color: "#0f172a", fontFamily: "monospace" }}>{p.patient_id}</div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.status} · {(p.predicted_next_move || "").replace(/_/g, " ")}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <TriageBadge category={p.triage} />
                <span style={{ fontWeight: 800, fontSize: 18, color: p.risk_score >= 80 ? "#ef4444" : p.risk_score >= 60 ? "#f97316" : "#22c55e" }}>{p.risk_score}</span>
              </div>
            </div>
            {p.vitals && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                <VitalBadge icon="❤️" label="HR" value={p.vitals.heart_rate || "—"} unit="bpm" warning={p.vitals.heart_rate > 100} />
                <VitalBadge icon="🩸" label="BP" value={p.vitals.systolic_bp || "—"} unit="mmHg" warning={p.vitals.systolic_bp > 140} />
                <VitalBadge icon="💧" label="SpO₂" value={p.vitals.spo2 || "—"} unit="%" warning={p.vitals.spo2 < 95} />
                <VitalBadge icon="🌡️" label="Temp" value={p.vitals.temperature || "—"} unit="°C" warning={p.vitals.temperature > 38.5} />
              </div>
            )}
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => onExplain(p.patient_id)} style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 7, padding: "4px 10px", cursor: "pointer", color: "#3b82f6", fontSize: 11, fontWeight: 700 }}>Explain</button>
              <button onClick={() => onRetriage(p)} style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 7, padding: "4px 10px", cursor: "pointer", color: "#f97316", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>{icons.refresh} Re-triage</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function StatCard({ label, value, sub, accent, icon }) {
  return (
    <div style={{ background: "white", borderRadius: 12, padding: 18, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", borderTop: `3px solid ${accent}`, border: "1px solid #f1f5f9" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a", letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}


function QueueSummaryCard({ patients, onRetriage, onExplain }) {
  const sorted = [...(patients || [])].sort((a, b) => b.risk_score - a.risk_score).slice(0, 8);
  if (sorted.length === 0) return null;
  return (
    <div style={{ background: "white", borderRadius: 12, border: "1px solid #f1f5f9", boxShadow: "0 1px 6px rgba(0,0,0,0.05)", overflow: "hidden" }}>
      <div style={{ padding: "14px 18px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>📋 Queue Overview</div>
        <span style={{ fontSize: 11, color: "#94a3b8" }}>Top {sorted.length} by risk</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Patient", "Triage", "Risk", "Status", "Next Move"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: 0.8, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.patient_id} style={{ borderBottom: "1px solid #f8fafc" }}>
                <td style={{ padding: "10px 14px", fontWeight: 700, fontSize: 12, color: "#3b82f6", fontFamily: "monospace" }}>{p.patient_id}</td>
                <td style={{ padding: "10px 14px" }}><TriageBadge category={p.triage} /></td>
                <td style={{ padding: "10px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 40, height: 4, borderRadius: 2, background: "#f1f5f9", overflow: "hidden" }}>
                      <div style={{ width: `${p.risk_score}%`, height: "100%", background: p.risk_score >= 80 ? "#ef4444" : p.risk_score >= 60 ? "#f97316" : "#22c55e", borderRadius: 2 }} />
                    </div>
                    <span style={{ fontWeight: 700, fontSize: 12, color: "#0f172a" }}>{p.risk_score}</span>
                  </div>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#3b82f6", background: "#eff6ff", borderRadius: 20, padding: "2px 8px", border: "1px solid #bfdbfe" }}>{p.status}</span>
                </td>
                <td style={{ padding: "10px 14px" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed", background: "#f5f3ff", borderRadius: 20, padding: "2px 8px", border: "1px solid #ddd6fe" }}>{(p.predicted_next_move || "—").replace(/_/g, " ")}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


function DashboardPage({ onRetriage }) {
  const [queueData, setQueueData] = useState(null);
  const [explainId, setExplainId] = useState(null);

  useEffect(() => {
    api.queue().then(setQueueData).catch(() => {});
    const iv = setInterval(() => api.queue().then(setQueueData).catch(() => {}), 15000);
    return () => clearInterval(iv);
  }, []);

  const pts = queueData?.patients || [];
  const red = pts.filter(p => p.triage === "RED").length;
  const orange = pts.filter(p => p.triage === "ORANGE").length;
  const yellow = pts.filter(p => p.triage === "YELLOW").length;
  const green = pts.filter(p => p.triage === "GREEN").length;
  const avgRisk = pts.length ? Math.round(pts.reduce((a, b) => a + b.risk_score, 0) / pts.length) : 0;

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      {explainId && <ExplainModal patientId={explainId} onClose={() => setExplainId(null)} />}

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: "#0f172a", fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>Dashboard</h2>
        <p style={{ color: "#94a3b8", fontSize: 13.5 }}>AI-Powered Golden Hour Triage · Real-time overview</p>
      </div>

      {/* Critical Notifications */}
      <CriticalNotifications patients={pts} />

      {/* Stats Row - 4 cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 18 }}>
        <StatCard label="Patients in Queue" value={pts.length} sub="Active cases" accent="#3b82f6" icon="👥" />
        <StatCard label="Critical (Red)" value={red} sub="Immediate care" accent="#ef4444" icon="🚨" />
        <StatCard label="Avg Risk Score" value={avgRisk || "—"} sub="Across all patients" accent="#f97316" icon="📊" />
        <StatCard label="System Status" value="ACTIVE" sub="All systems online" accent="#22c55e" icon="✅" />
      </div>

      {/* Triage breakdown bar */}
      {pts.length > 0 && (
        <div style={{ background: "white", borderRadius: 12, padding: "14px 18px", marginBottom: 18, border: "1px solid #f1f5f9", boxShadow: "0 1px 6px rgba(0,0,0,0.04)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#0f172a" }}>Triage Distribution</div>
            <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#64748b" }}>
              {[["RED", red, "#ef4444"], ["ORANGE", orange, "#f97316"], ["YELLOW", yellow, "#eab308"], ["GREEN", green, "#22c55e"]].map(([name, count, color]) => (
                <span key={name} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: "inline-block" }}></span>
                  <span style={{ fontWeight: 600, color }}>{count}</span> {name}
                </span>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", height: 10 }}>
            {[["RED", red, "#ef4444"], ["ORANGE", orange, "#f97316"], ["YELLOW", yellow, "#eab308"], ["GREEN", green, "#22c55e"]].map(([name, count, color]) => (
              count > 0 && <div key={name} style={{ flex: count, background: color, transition: "flex 0.5s ease" }} title={`${name}: ${count}`} />
            ))}
            {pts.length === 0 && <div style={{ flex: 1, background: "#f1f5f9" }} />}
          </div>
        </div>
      )}

      {/* Main 3-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 320px", gap: 16, marginBottom: 16 }}>
        {/* Col 1 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <TopPatientsCard patients={pts} onRetriage={onRetriage} onExplain={setExplainId} />
        </div>
        {/* Col 2 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <QueueSummaryCard patients={pts} onRetriage={onRetriage} onExplain={setExplainId} />
        </div>
        {/* Col 3 - right sidebar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <FairnessCard />
          <ReferralCard />
        </div>
      </div>
    </div>
  );
}


function AnalyticsPage() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    try {
      const data = await api.analyticsSummary();
      setSummary(data);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
    const iv = setInterval(loadSummary, 30000);
    return () => clearInterval(iv);
  }, [loadSummary]);

  const hourlyData = (summary?.hourly_volume_24h || []).map((row) => ({
    hour: row.hour,
    patients: row.total,
    red: row.red,
    orange: row.orange,
    yellow: row.yellow,
    green: row.green,
  }));

  const total24h = summary?.total_records_24h || 0;
  const critical24h = summary?.critical_cases_24h || 0;
  const alertRates = summary?.vitals_alert_rates_24h || {};
  const criticalRatio = total24h > 0 ? Math.round((critical24h / total24h) * 100) : 0;

  const radarData = [
    { subject: "Critical Load", value: criticalRatio },
    { subject: "Hypoxia", value: alertRates.hypoxia_pct || 0 },
    { subject: "Hypotension", value: alertRates.hypotension_pct || 0 },
    { subject: "Tachycardia", value: alertRates.tachycardia_pct || 0 },
    { subject: "Fever", value: alertRates.fever_pct || 0 },
  ];

  const triage24h = summary?.triage_counts_24h || { RED: 0, ORANGE: 0, YELLOW: 0, GREEN: 0 };
  const triageDistrib = [
    { name: "GREEN", value: triage24h.GREEN || 0, color: "#22c55e" },
    { name: "YELLOW", value: triage24h.YELLOW || 0, color: "#eab308" },
    { name: "ORANGE", value: triage24h.ORANGE || 0, color: "#f97316" },
    { name: "RED", value: triage24h.RED || 0, color: "#ef4444" },
  ];

  const dailyData = summary?.daily_volume_7d || [];
  const totalTriage24h = triageDistrib.reduce((acc, row) => acc + row.value, 0);

  if (loading) {
    return (
      <div style={{ animation: "fadeIn 0.4s ease" }}>
        <div style={{ marginBottom: 22 }}>
          <h2 style={{ color: "#0f172a", fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>Analytics</h2>
          <p style={{ color: "#94a3b8", fontSize: 13.5 }}>Loading live database metrics...</p>
        </div>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ animation: "fadeIn 0.4s ease" }}>
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ color: "#0f172a", fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>Analytics</h2>
        <p style={{ color: "#94a3b8", fontSize: 13.5 }}>
          Live trends from triage database {summary?.generated_at ? `· Updated ${new Date(summary.generated_at).toLocaleTimeString()}` : ""}
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Total Records (24h)", value: summary?.total_records_24h ?? 0, accent: "#3b82f6", icon: "👥" },
          { label: "Critical Cases (24h)", value: summary?.critical_cases_24h ?? 0, accent: "#ef4444", icon: "🚨" },
          { label: "Avg Risk Score (24h)", value: summary?.average_risk_score_24h ?? "—", accent: "#22c55e", icon: "📊" },
          {
            label: "Avg Deterioration (24h)",
            value: summary?.average_deterioration_probability_24h != null
              ? `${Math.round(summary.average_deterioration_probability_24h * 100)}%`
              : "—",
            accent: "#7c3aed",
            icon: "🧠",
          },
        ].map(({ label, value, accent, icon }) => (
          <StatCard key={label} label={label} value={value} accent={accent} icon={icon} />
        ))}
      </div>

      {/* Charts row 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 22, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 16 }}>Patient Volume by Hour</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={hourlyData} barCategoryGap="30%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="green" stackId="a" fill="#22c55e" name="Green" radius={[0, 0, 0, 0]} />
              <Bar dataKey="yellow" stackId="a" fill="#eab308" name="Yellow" />
              <Bar dataKey="orange" stackId="a" fill="#f97316" name="Orange" />
              <Bar dataKey="red" stackId="a" fill="#ef4444" name="Red" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 22, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 16 }}>Clinical Risk Signals (24h)</div>
          <ResponsiveContainer width="100%" height={240}>
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
              <PolarGrid stroke="#f1f5f9" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name="AI" dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.15} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "white", borderRadius: 12, padding: 22, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 16 }}>Triage Distribution (24h)</div>
          {triageDistrib.map(({ name, value, color }) => (
            <div key={name} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{name}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color }}>{value} patients</span>
              </div>
              <div style={{ height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${totalTriage24h > 0 ? (value / totalTriage24h) * 100 : 0}%`, background: color, borderRadius: 3, transition: "width 1s ease" }} />
              </div>
            </div>
          ))}
        </div>

        <div style={{ background: "white", borderRadius: 12, padding: 22, boxShadow: "0 1px 6px rgba(0,0,0,0.05)", border: "1px solid #f1f5f9" }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 16 }}>Admission Trend (7 days)</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f8fafc" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12 }} />
              <Line type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3, fill: "#3b82f6" }} name="Total" />
              <Line type="monotone" dataKey="critical" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#ef4444" }} name="Critical" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}


export default function App() {
  const [page, setPage] = useState("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [retriagePatient, setRetriagePatient] = useState(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const handleRetriage = (patient) => {
    setRetriagePatient(patient);
    setPage("addPatient");
  };

  const pages = {
    dashboard: <DashboardPage onRetriage={handleRetriage} />,
    queue: <QueuePage onRetriage={handleRetriage} />,
    addPatient: (
      <AddPatientForm
        key={retriagePatient?.patient_id || "new"}
        patientToRetriage={retriagePatient}
        onClearRetriage={() => setRetriagePatient(null)}
      />
    ),
    history: <HistoryPage onRetriage={handleRetriage} />,
    analytics: <AnalyticsPage />,
  };

  const pageTitles = { dashboard: "Dashboard", queue: "Emergency Queue", addPatient: "Add Patient", history: "Patient History", analytics: "Analytics" };

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', 'Inter', system-ui, sans-serif; background: #f5f7fa; }
        @import url('https:
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        button:hover { opacity: 0.9; }
        input:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.1) !important; }
        select:focus { border-color: #3b82f6 !important; box-shadow: 0 0 0 3px rgba(59,130,246,0.1) !important; }
        @media (max-width: 1100px) {
          .dash-3col { grid-template-columns: 1fr 1fr !important; }
          .dash-3col > :last-child { grid-column: 1 / -1; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        }
        @media (max-width: 768px) {
          .stats-4col { grid-template-columns: 1fr 1fr !important; }
          .dash-3col { grid-template-columns: 1fr !important; }
          .dash-3col > :last-child { grid-column: 1; display: flex; flex-direction: column; }
          .form-result-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 480px) {
          .stats-4col { grid-template-columns: 1fr !important; }
        }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #f8fafc; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
      `}</style>

      <div style={{ display: "flex", minHeight: "100vh" }}>
        {isMobile && sidebarOpen && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99, backdropFilter: "blur(2px)" }} onClick={() => setSidebarOpen(false)} />
        )}

        {(!isMobile || sidebarOpen) && (
          <Sidebar active={page} setActive={setPage} mobile={isMobile} onClose={() => setSidebarOpen(false)} />
        )}

        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {/* Topbar */}
          <div style={{ background: "white", borderBottom: "1px solid #e8edf2", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 1px 3px rgba(0,0,0,0.04)", position: "sticky", top: 0, zIndex: 50 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {isMobile && (
                <button onClick={() => setSidebarOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4, borderRadius: 6 }}>
                  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
              )}
              <div>
                <div style={{ fontWeight: 800, color: "#0f172a", fontSize: 15, letterSpacing: -0.3 }}>GoldenHour AI Triage</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{pageTitles[page]} · {new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {retriagePatient && page !== "addPatient" && (
                <div style={{ background: "rgba(249,115,22,0.1)", color: "#f97316", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20, border: "1px solid rgba(249,115,22,0.2)", cursor: "pointer" }} onClick={() => setPage("addPatient")}>
                  🔄 Re-triage ready · {retriagePatient.patient_id}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 20, padding: "5px 12px" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 700 }}>Live</span>
              </div>
            </div>
          </div>

          <div style={{ flex: 1, padding: "22px 24px", overflowY: "auto" }}>
            {pages[page]}
          </div>
        </div>
      </div>
    </>
  );
}
