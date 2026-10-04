"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { createClient, type PostgrestError } from "@supabase/supabase-js";
import { AlertTriangle, CheckCircle2, Clock3, Filter, RefreshCw, UserRound } from "lucide-react";

type Alert = {
    id: string;
    mesin: string;
    time_stamp: string;
    penyebab: string;
    alert_status: "info" | "warning" | "critical";
    recommended_action: string | null;
    assign_staf: string | null;
    status: "unsolved" | "in_progress" | "solved";
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

const supabase = createClient(supabaseUrl, supabaseKey);
function isSolved(status: Alert["status"]) {
    return status === "solved";
}

function displayStatus(status: Alert["status"]) {
    return isSolved(status) ? "solved" : status;
}

export function AlertsContent() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [machine, setMachine] = useState("All machines");
    const [status, setStatus] = useState("All statuses");
    const [loading, setLoading] = useState(true);
    const [sourceError, setSourceError] = useState<PostgrestError | null>(null);

    const loadAlerts = async () => {
        setLoading(true);
        const { data, error } = await supabase.from("alerts").select("id, mesin, time_stamp, penyebab, alert_status, recommended_action, assign_staf, status").order("time_stamp", { ascending: false });
        if (error) {
            setSourceError(error);
            setAlerts([]);
        } else {
            setSourceError(null);
            setAlerts((data ?? []) as Alert[]);
        }
        setLoading(false);
    };

    useEffect(() => { void loadAlerts(); }, []);

    const machines = useMemo(() => ["All machines", ...Array.from(new Set(alerts.map((alert) => alert.mesin)))], [alerts]);
    const filtered = alerts.filter((alert) => (machine === "All machines" || alert.mesin === machine) && (status === "All statuses" || (status === "solved" ? isSolved(alert.status) : alert.status === status)));
    const openCount = alerts.filter((alert) => !isSolved(alert.status)).length;
    const criticalCount = alerts.filter((alert) => alert.alert_status === "critical").length;
    const solvedCount = alerts.filter((alert) => isSolved(alert.status)).length;

    return <div className="min-h-full space-y-6 bg-[#f4f6fa] p-1 text-[#172337]">
        <section className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5c8ce8]">Operations control</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#082f80]">Alerts</h2><p className="mt-1 text-sm text-[#6c83a4]">Machine alerts, ownership, and recommended response actions</p></div><button type="button" onClick={() => void loadAlerts()} className="inline-flex items-center gap-2 rounded-xl border border-[#dce7f7] bg-white px-3 py-2 text-sm font-semibold text-[#173e82] shadow-sm hover:border-[#91b1ed]"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Refresh</button></section>
        <section className="grid gap-4 sm:grid-cols-3"><Stat label="Open alerts" value={openCount} icon={<Clock3 className="h-4 w-4" />} /><Stat label="Critical" value={criticalCount} icon={<AlertTriangle className="h-4 w-4" />} /><Stat label="Solved" value={solvedCount} icon={<CheckCircle2 className="h-4 w-4" />} /></section>
        <section className="rounded-2xl border border-[#dce7f7] bg-white p-5 shadow-[0_10px_28px_rgba(8,47,128,0.06)]"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-[#173e82]"><Filter className="h-4 w-4 text-[#1257c7]" />Filter alerts</div><p className="text-xs text-[#7890b2]">{sourceError ? `Could not load alerts: ${sourceError.message}` : loading ? "Loading alerts…" : "Synced with Supabase alerts"}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><select aria-label="Filter by machine" value={machine} onChange={(event) => setMachine(event.target.value)} className="rounded-xl border border-[#dce7f7] bg-[#f8faff] px-3 py-2.5 text-sm text-[#173e82] outline-none focus:ring-2 focus:ring-[#91b1ed]">{machines.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-[#dce7f7] bg-[#f8faff] px-3 py-2.5 text-sm text-[#173e82] outline-none focus:ring-2 focus:ring-[#91b1ed]"><option>All statuses</option><option value="unsolved">Unsolved</option><option value="in_progress">In progress</option><option value="solved">Solved</option></select></div></section>
        <section className="overflow-hidden rounded-2xl border border-[#dce7f7] bg-white shadow-[0_10px_28px_rgba(8,47,128,0.06)]"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left"><thead className="border-b border-[#e7edf7] bg-[#f8faff] text-[11px] uppercase tracking-[0.12em] text-[#7890b2]"><tr><th className="px-5 py-4">Machine</th><th className="px-5 py-4">Alert</th><th className="px-5 py-4">Cause</th><th className="px-5 py-4">Recommended action</th><th className="px-5 py-4">Owner</th><th className="px-5 py-4">Status</th></tr></thead><tbody className="divide-y divide-[#edf2fa]">{filtered.map((alert) => <tr key={alert.id} className="align-top hover:bg-[#fbfdff]"><td className="px-5 py-4"><p className="font-semibold text-[#173e82]">{alert.mesin}</p><p className="mt-1 text-xs text-[#7890b2]">{new Date(alert.time_stamp).toLocaleString()}</p></td><td className="px-5 py-4"><Severity value={alert.alert_status} /></td><td className="max-w-[240px] px-5 py-4 text-sm text-[#45648d]">{alert.penyebab}</td><td className="max-w-[280px] px-5 py-4 text-sm text-[#45648d]">{alert.recommended_action ?? "No action assigned"}</td><td className="px-5 py-4 text-sm text-[#45648d]"><span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4 text-[#91b1ed]" />{alert.assign_staf ?? "Unassigned"}</span></td><td className="px-5 py-4"><Status value={alert.status} /></td></tr>)}</tbody></table></div>{filtered.length === 0 && <p className="p-8 text-center text-sm text-[#7890b2]">No alerts match the selected filters.</p>}</section>
    </div>;
}

function Stat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) { return <div className="rounded-2xl border border-[#dce7f7] bg-white p-5 shadow-[0_10px_28px_rgba(8,47,128,0.05)]"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7890b2]">{icon}{label}</div><p className="mt-3 text-3xl font-semibold text-[#082f80]">{value}</p></div>; }
function Severity({ value }: { value: Alert["alert_status"] }) { const styles = { info: "bg-[#eef4ff] text-[#1257c7]", warning: "bg-[#fff8e8] text-[#b57616]", critical: "bg-[#fff0f0] text-[#bf3d4b]" }; return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${styles[value]}`}>{value}</span>; }
function Status({ value }: { value: Alert["status"] }) { const normalized = displayStatus(value); const styles = { unsolved: "bg-[#fff0f0] text-[#bf3d4b]", in_progress: "bg-[#fff8e8] text-[#b57616]", solved: "bg-[#eef8f2] text-[#27834f]" }; return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${styles[normalized]}`}>{normalized.replace("_", " ")}</span>; }