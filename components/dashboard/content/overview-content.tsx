"use client";

import { AlertTriangle, CheckCircle2, Clock3, Gauge, Wrench, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const throughputData = [
  { time: "06:00", output: 420 }, { time: "08:00", output: 610 }, { time: "10:00", output: 580 },
  { time: "12:00", output: 740 }, { time: "14:00", output: 680 }, { time: "16:00", output: 810 }, { time: "18:00", output: 760 },
];

const metrics = [
  { label: "Line efficiency", value: "94.8%", change: "+2.4%", icon: Gauge },
  { label: "Units produced", value: "4,820", change: "+8.6%", icon: TrendingUp },
  { label: "Equipment uptime", value: "98.2%", change: "+0.8%", icon: CheckCircle2 },
  { label: "Open incidents", value: "03", change: "2 high", icon: AlertTriangle },
  { label: "Avg. cycle time", value: "42.6s", change: "-3.1s", icon: Clock3 },
];

const equipmentKpis = [
  { name: "Assembly Robot A1", status: "Running", kpi: "98.6%", label: "OEE", detail: "412 units/hr", color: "bg-[#1257c7]" },
  { name: "Conveyor Line 03", status: "Running", kpi: "96.2%", label: "Uptime", detail: "38.4s cycle", color: "bg-[#09a7d5]" },
  { name: "Vision QA Station", status: "Attention", kpi: "91.8%", label: "Pass rate", detail: "2 alerts today", color: "bg-[#f0a23a]" },
  { name: "Packaging Cell P2", status: "Running", kpi: "94.4%", label: "Efficiency", detail: "286 units/hr", color: "bg-[#5c8ce8]" },
  { name: "CNC Mill M04", status: "Idle", kpi: "87.9%", label: "Availability", detail: "Changeover ready", color: "bg-[#91b1ed]" },
];

const incidents = [
  { id: "PL-2047", title: "Conveyor motor temperature high", line: "Line 03 · Assembly", severity: "High", time: "12 min ago" },
  { id: "PL-2046", title: "Vision inspection station offline", line: "Line 01 · Quality", severity: "Medium", time: "28 min ago" },
];

export function OverviewContent() {
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[#dce7f7] bg-[#f4f7fc] px-7 py-6">
        <div className="flex items-end justify-between gap-4">
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1257c7]">Plant 01 / Shift B</p><h2 className="text-3xl font-semibold tracking-tight text-[#082f80]">Production line command center</h2><p className="mt-2 text-sm text-[#587091]">Live status across assembly, quality, and packaging operations.</p></div>
          <div className="hidden text-right sm:block"><p className="text-xs uppercase tracking-wider text-[#7690b6]">Last synchronized</p><p className="mt-1 text-sm font-semibold text-[#173e82]">Today, 14:42:18</p></div>
        </div>
      </section>
      <div className="h-2 rounded-full bg-gradient-to-r from-[#082f80] via-[#1257c7] to-[#8eaff0]" />
      <section className="grid grid-cols-2 gap-4 xl:grid-cols-5">
        {metrics.map(({ label, value, change, icon: Icon }) => <article key={label} className="rounded-2xl border border-[#dce7f7] bg-white p-5 shadow-[0_8px_24px_rgba(8,47,128,0.06)]"><div className="flex items-start justify-between gap-3"><div className="rounded-xl bg-[#eef4ff] p-2.5 text-[#1257c7]"><Icon className="h-5 w-5" /></div><span className="text-xs font-semibold text-[#1257c7]">{change}</span></div><p className="mt-5 text-2xl font-semibold tracking-tight text-[#082f80]">{value}</p><p className="mt-1 text-sm text-[#6c83a4]">{label}</p></article>)}
      </section>
      <section className="rounded-2xl border border-[#dce7f7] bg-white p-6 shadow-[0_8px_24px_rgba(8,47,128,0.06)]"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-base font-semibold text-[#082f80]">Production output</h3><p className="mt-1 text-sm text-[#6c83a4]">Units completed by hour across all active lines</p></div><span className="rounded-lg bg-[#eef4ff] px-3 py-2 text-xs font-semibold text-[#1257c7]">Target: 700 units/hr</span></div><div className="h-[220px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={throughputData}><defs><linearGradient id="productionGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#1257c7" stopOpacity={0.26} /><stop offset="95%" stopColor="#1257c7" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#e8eef8" strokeDasharray="4 4" /><XAxis dataKey="time" tick={{ fill: "#7890b2", fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#7890b2", fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ border: "1px solid #dce7f7", borderRadius: 12, boxShadow: "0 8px 24px rgba(8,47,128,0.1)" }} /><Area type="monotone" dataKey="output" stroke="#1257c7" strokeWidth={3} fill="url(#productionGradient)" /></AreaChart></ResponsiveContainer></div></section>
      <section aria-labelledby="equipment-kpis" className="space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div><h3 id="equipment-kpis" className="text-base font-semibold text-[#082f80]">Equipment KPIs</h3><p className="mt-1 text-sm text-[#6c83a4]">Performance snapshot for each active asset</p></div>
          <span className="hidden text-xs font-semibold text-[#7690b6] sm:block">5 monitored assets</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {equipmentKpis.map((equipment) => <article key={equipment.name} className="rounded-2xl border border-[#dce7f7] bg-white p-5 shadow-[0_8px_24px_rgba(8,47,128,0.06)]"><div className="flex items-center justify-between gap-3"><div className={`h-2.5 w-2.5 rounded-full ${equipment.color}`} /><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7890b2]">{equipment.status}</span></div><h4 className="mt-4 min-h-10 text-sm font-semibold leading-5 text-[#173e82]">{equipment.name}</h4><p className="mt-4 text-2xl font-semibold tracking-tight text-[#082f80]">{equipment.kpi}</p><p className="mt-1 text-xs font-medium text-[#6c83a4]">{equipment.label}</p><div className="mt-4 border-t border-[#edf2fa] pt-3 text-xs text-[#7890b2]">{equipment.detail}</div></article>)}
        </div>
      </section>
      <section className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <article className="rounded-2xl border border-[#dce7f7] bg-white p-6 shadow-[0_8px_24px_rgba(8,47,128,0.06)]"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-base font-semibold text-[#082f80]">Open production incidents</h3><p className="mt-1 text-sm text-[#6c83a4]">Events requiring attention on the floor</p></div><span className="rounded-full bg-[#fff2f2] px-3 py-1 text-xs font-semibold text-[#bf3d4b]">3 open</span></div><div className="space-y-3">{incidents.map((incident) => <div key={incident.id} className="rounded-xl border border-[#e7edf7] bg-[#f8faff] p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#173e82]">{incident.title}</p><p className="mt-1 text-xs text-[#7890b2]">{incident.line}</p></div><span className="rounded-full bg-[#fff0f0] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#bf3d4b]">{incident.severity}</span></div><div className="mt-4 flex items-center justify-between text-xs text-[#7890b2]"><span className="font-mono">{incident.id}</span><span>{incident.time}</span></div></div>)}</div></article>
        <article className="rounded-2xl border border-[#dce7f7] bg-white p-6 shadow-[0_8px_24px_rgba(8,47,128,0.06)]"><div className="mb-5 flex items-center justify-between"><div><h3 className="text-base font-semibold text-[#082f80]">Line alerts</h3><p className="mt-1 text-sm text-[#6c83a4]">Automated checks from connected equipment</p></div><Wrench className="h-5 w-5 text-[#5c8ce8]" /></div><div className="space-y-4">{["Packaging line scheduled maintenance", "Line 02 material replenishment", "Quality gate calibration due"].map((alert, index) => <div key={alert} className="flex items-center gap-3 border-b border-[#edf2fa] pb-4 last:border-0 last:pb-0"><span className={`h-2.5 w-2.5 rounded-full ${index === 0 ? "bg-[#1257c7]" : index === 1 ? "bg-[#09a7d5]" : "bg-[#91b1ed]"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-[#173e82]">{alert}</p><p className="mt-1 text-xs text-[#7890b2]">{index === 0 ? "Due in 2 hours" : index === 1 ? "Material level at 18%" : "Due tomorrow"}</p></div></div>)}</div></article>
      </section>
    </div>
  );
}
