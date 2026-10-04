"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type React from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Filter,
    RefreshCw,
    Save,
    Trash2,
    UserRound,
} from "lucide-react";

type Alert = {
    id: string;
    mesin: string;
    time_stamp: string;
    penyebab: string;
    alert_status: string;
    recommended_action: string | null;
    assign_staf: string | null;
    status: "unsolved" | "in_progress" | "solved";
};

type Employee = {
    id: string;
    full_name: string;
};

type DataRow = Record<string, unknown>;

function isDataRow(value: unknown): value is DataRow {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAlert(value: unknown): value is Alert {
    return (
        isDataRow(value) &&
        typeof value.id === "string" &&
        typeof value.mesin === "string" &&
        typeof value.time_stamp === "string" &&
        typeof value.penyebab === "string" &&
        typeof value.alert_status === "string" &&
        (typeof value.recommended_action === "string" ||
            value.recommended_action === null) &&
        (typeof value.assign_staf === "string" || value.assign_staf === null) &&
        ["unsolved", "in_progress", "solved"].includes(String(value.status))
    );
}

async function fetchTableRows(table: string): Promise<DataRow[]> {
    const rows: DataRow[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
        const response = await fetch(
            `/api/tables/${table}?limit=30&offset=${offset}`,
            { cache: "no-store" }
        );
        const payload: unknown = await response.json();

        if (!response.ok) {
            const message =
                isDataRow(payload) && typeof payload.error === "string"
                    ? payload.error
                    : `Could not load ${table} (${response.status}).`;
            throw new Error(message);
        }
        if (!isDataRow(payload) || !Array.isArray(payload.data)) {
            throw new Error(`Unexpected response while loading ${table}.`);
        }

        rows.push(...payload.data.filter(isDataRow));
        hasMore =
            isDataRow(payload.pagination) && payload.pagination.hasMore === true;
        offset += 30;
    }

    return rows;
}

async function readError(response: Response, fallback: string): Promise<string> {
    const payload: unknown = await response.json();
    return isDataRow(payload) && typeof payload.error === "string"
        ? payload.error
        : fallback;
}

function isSolved(status: Alert["status"]) {
    return status === "solved";
}

function statusClass(status: Alert["status"]) {
    switch (status) {
        case "unsolved":
            return "border-red-200 bg-red-50 text-red-700";
        case "in_progress":
            return "border-blue-200 bg-blue-50 text-blue-700";
        case "solved":
            return "border-green-200 bg-green-50 text-green-700";
    }
}

function isAlertStatus(value: string): value is Alert["status"] {
    return value === "unsolved" || value === "in_progress" || value === "solved";
}

function formatTimestamp(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat("id-ID", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Jakarta",
    }).format(date);
}

export function AlertsContent() {
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [actionDrafts, setActionDrafts] = useState<Record<string, string>>({});
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [machine, setMachine] = useState("All machines");
    const [status, setStatus] = useState("All statuses");
    const [loading, setLoading] = useState(true);
    const [employeesLoading, setEmployeesLoading] = useState(true);
    const [sourceError, setSourceError] = useState<string | null>(null);
    const [employeesError, setEmployeesError] = useState<string | null>(null);
    const [mutationError, setMutationError] = useState<string | null>(null);
    const [mutationMessage, setMutationMessage] = useState<string | null>(null);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [refreshKey, setRefreshKey] = useState(0);

    const loadAlerts = useCallback(async () => {
        setLoading(true);
        setSourceError(null);
        try {
            const rows = await fetchTableRows("alerts");
            const loadedAlerts = rows.filter(isAlert);
            setAlerts(loadedAlerts);
            setActionDrafts(
                Object.fromEntries(
                    loadedAlerts.map((alert) => [
                        alert.id,
                        alert.recommended_action ?? "",
                    ])
                )
            );
        } catch (error) {
            setAlerts([]);
            setSourceError(
                error instanceof Error ? error.message : "Unable to load alerts."
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadAlerts();
    }, [loadAlerts, refreshKey]);

    useEffect(() => {
        let active = true;
        setEmployeesLoading(true);
        setEmployeesError(null);

        void fetchTableRows("employees")
            .then((rows) => {
                if (!active) return;
                setEmployees(
                    Array.from(
                        new Map(
                            rows
                                .filter(
                                    (row): row is DataRow & {
                                        id: string;
                                        full_name: string;
                                        is_active: boolean;
                                    } =>
                                        typeof row.id === "string" &&
                                        typeof row.full_name === "string" &&
                                        row.is_active === true
                                )
                                .map(({ id, full_name }) => [
                                    full_name,
                                    { id, full_name },
                                ] as const)
                        ).values()
                    ).sort((left, right) => left.full_name.localeCompare(right.full_name))
                );
            })
            .catch((error: unknown) => {
                if (!active) return;
                setEmployeesError(
                    error instanceof Error ? error.message : "Unable to load employees."
                );
            })
            .finally(() => {
                if (active) setEmployeesLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    const machines = useMemo(
        () => ["All machines", ...Array.from(new Set(alerts.map((alert) => alert.mesin)))],
        [alerts]
    );
    const filtered = alerts.filter(
        (alert) =>
            (machine === "All machines" || alert.mesin === machine) &&
            (status === "All statuses" ||
                (status === "solved" ? isSolved(alert.status) : alert.status === status))
    );
    const openCount = alerts.filter((alert) => !isSolved(alert.status)).length;
    const criticalCount = alerts.filter((alert) =>
        ["critical", "high risk"].includes(alert.alert_status.toLowerCase())
    ).length;
    const solvedCount = alerts.filter((alert) => isSolved(alert.status)).length;

    const updateAlert = async (
        alertId: string,
        update: Partial<
            Pick<Alert, "recommended_action" | "assign_staf" | "status">
        >
    ) => {
        setBusyKey(alertId);
        setMutationError(null);
        setMutationMessage(null);
        try {
            const response = await fetch(`/api/alerts/${encodeURIComponent(alertId)}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(update),
            });
            if (!response.ok) {
                throw new Error(await readError(response, "Could not update alert."));
            }
            setMutationMessage("Alert updated.");
            window.dispatchEvent(new Event("alerts:updated"));
            setRefreshKey((value) => value + 1);
        } catch (error) {
            setMutationError(
                error instanceof Error ? error.message : "Could not update alert."
            );
        } finally {
            setBusyKey(null);
        }
    };

    const deleteSolvedAlert = async (alert: Alert) => {
        if (!window.confirm(`Delete solved alert for ${alert.mesin}? This cannot be undone.`)) {
            return;
        }
        setBusyKey(alert.id);
        setMutationError(null);
        setMutationMessage(null);
        try {
            const response = await fetch(`/api/alerts/${encodeURIComponent(alert.id)}`, {
                method: "DELETE",
            });
            if (!response.ok) {
                throw new Error(await readError(response, "Could not delete solved alert."));
            }
            setMutationMessage("Solved alert deleted.");
            window.dispatchEvent(new Event("alerts:updated"));
            setRefreshKey((value) => value + 1);
        } catch (error) {
            setMutationError(
                error instanceof Error ? error.message : "Could not delete solved alert."
            );
        } finally {
            setBusyKey(null);
        }
    };

    const deleteAllSolved = async () => {
        if (solvedCount === 0) return;
        if (
            !window.confirm(
                `Delete all ${solvedCount} solved alerts? This cannot be undone.`
            )
        ) {
            return;
        }
        setBusyKey("delete-all-solved");
        setMutationError(null);
        setMutationMessage(null);
        try {
            const response = await fetch("/api/alerts", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ confirm: true }),
            });
            const payload: unknown = await response.json();
            if (!response.ok) {
                throw new Error(
                    isDataRow(payload) && typeof payload.error === "string"
                        ? payload.error
                        : "Could not delete solved alerts."
                );
            }
            const deleted =
                isDataRow(payload) && typeof payload.deleted === "number"
                    ? payload.deleted
                    : 0;
            setMutationMessage(`${deleted} solved alert${deleted === 1 ? "" : "s"} deleted.`);
            window.dispatchEvent(new Event("alerts:updated"));
            setRefreshKey((value) => value + 1);
        } catch (error) {
            setMutationError(
                error instanceof Error ? error.message : "Could not delete solved alerts."
            );
        } finally {
            setBusyKey(null);
        }
    };

    return (
        <div className="min-h-full space-y-6 bg-[#f4f6fa] p-1 text-[#172337]">
            <section className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5c8ce8]">
                        Operations control
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#082f80]">
                        Alerts
                    </h2>
                    <p className="mt-1 text-sm text-[#6c83a4]">
                        Machine alerts, ownership, and recommended response actions
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        type="button"
                        onClick={() => void deleteAllSolved()}
                        disabled={solvedCount === 0 || busyKey !== null || loading}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete all solved alerts ({solvedCount})
                    </button>
                    <button
                        type="button"
                        onClick={() => setRefreshKey((value) => value + 1)}
                        disabled={loading || busyKey !== null}
                        className="inline-flex items-center gap-2 rounded-xl border border-[#dce7f7] bg-white px-3 py-2 text-sm font-semibold text-[#173e82] shadow-sm hover:border-[#91b1ed] disabled:opacity-50"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </button>
                </div>
            </section>

            <section className="grid gap-4 sm:grid-cols-3">
                <Stat label="Open alerts" value={openCount} icon={<Clock3 className="h-4 w-4" />} />
                <Stat label="Critical" value={criticalCount} icon={<AlertTriangle className="h-4 w-4" />} />
                <Stat label="Solved" value={solvedCount} icon={<CheckCircle2 className="h-4 w-4" />} />
            </section>

            <section className="rounded-2xl border border-[#dce7f7] bg-white p-5 shadow-[0_10px_28px_rgba(8,47,128,0.06)]">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#173e82]">
                        <Filter className="h-4 w-4 text-[#1257c7]" />
                        Filter alerts
                    </div>
                    <p className="text-xs text-[#7890b2]">
                        {sourceError
                            ? `Could not load alerts: ${sourceError}`
                            : loading
                                ? "Loading alerts…"
                                : "Synced with Supabase alerts"}
                    </p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <select
                        aria-label="Filter by machine"
                        value={machine}
                        onChange={(event) => setMachine(event.target.value)}
                        className="rounded-xl border border-[#dce7f7] bg-[#f8faff] px-3 py-2.5 text-sm text-[#173e82] outline-none focus:ring-2 focus:ring-[#91b1ed]"
                    >
                        {machines.map((item) => <option key={item}>{item}</option>)}
                    </select>
                    <select
                        aria-label="Filter by status"
                        value={status}
                        onChange={(event) => setStatus(event.target.value)}
                        className="rounded-xl border border-[#dce7f7] bg-[#f8faff] px-3 py-2.5 text-sm text-[#173e82] outline-none focus:ring-2 focus:ring-[#91b1ed]"
                    >
                        <option>All statuses</option>
                        <option value="unsolved">Unsolved</option>
                        <option value="in_progress">In progress</option>
                        <option value="solved">Solved</option>
                    </select>
                </div>
            </section>

            {(mutationError || mutationMessage || employeesError) && (
                <div
                    role={mutationError || employeesError ? "alert" : "status"}
                    className={`rounded-xl border p-3 text-sm ${mutationError || employeesError
                        ? "border-red-200 bg-red-50 text-red-800"
                        : "border-green-200 bg-green-50 text-green-800"
                        }`}
                >
                    {mutationError ?? employeesError ?? mutationMessage}
                </div>
            )}

            <section className="overflow-hidden rounded-2xl border border-[#dce7f7] bg-white shadow-[0_10px_28px_rgba(8,47,128,0.06)]">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1120px] text-left">
                        <thead className="border-b border-[#e7edf7] bg-[#f8faff] text-[11px] uppercase tracking-[0.12em] text-[#7890b2]">
                            <tr>
                                <th className="px-5 py-4">Machine</th>
                                <th className="px-5 py-4">Alert</th>
                                <th className="px-5 py-4">Cause</th>
                                <th className="px-5 py-4">Recommended action</th>
                                <th className="px-5 py-4">Owner</th>
                                <th className="px-5 py-4">Status</th>
                                <th className="px-5 py-4">Delete</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#edf2fa]">
                            {filtered.map((alert) => {
                                const busy = busyKey === alert.id || busyKey === "delete-all-solved";
                                return (
                                    <tr key={alert.id} className="align-top hover:bg-[#fbfdff]">
                                        <td className="px-5 py-4">
                                            <p className="font-semibold text-[#173e82]">{alert.mesin}</p>
                                            <p className="mt-1 text-xs text-[#7890b2]">
                                                {formatTimestamp(alert.time_stamp)}
                                            </p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <Severity value={alert.alert_status} />
                                        </td>
                                        <td className="max-w-[240px] whitespace-pre-wrap px-5 py-4 text-sm text-[#45648d]">
                                            {alert.penyebab}
                                        </td>
                                        <td className="max-w-[300px] px-5 py-4">
                                            <label className="sr-only" htmlFor={`action-${alert.id}`}>
                                                Recommended action for {alert.mesin}
                                            </label>
                                            <textarea
                                                id={`action-${alert.id}`}
                                                value={actionDrafts[alert.id] ?? ""}
                                                onChange={(event) =>
                                                    setActionDrafts((current) => ({
                                                        ...current,
                                                        [alert.id]: event.target.value,
                                                    }))
                                                }
                                                rows={3}
                                                maxLength={2000}
                                                disabled={busy}
                                                placeholder="No action assigned"
                                                className="w-full min-w-[220px] resize-y rounded-lg border border-[#dce7f7] bg-white px-3 py-2 text-sm leading-6 text-[#45648d] outline-none focus:border-[#91b1ed] focus:ring-2 focus:ring-[#91b1ed]/40 disabled:opacity-60"
                                            />
                                            <div className="mt-2 flex items-center justify-between gap-2">
                                                <span className="text-[10px] text-[#7890b2]">
                                                    {(actionDrafts[alert.id] ?? "").length}/2000
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        void updateAlert(alert.id, {
                                                            recommended_action: (actionDrafts[alert.id] ?? "").trim(),
                                                        })
                                                    }
                                                    disabled={
                                                        busy ||
                                                        (actionDrafts[alert.id] ?? "") ===
                                                        (alert.recommended_action ?? "")
                                                    }
                                                    aria-label={`Save recommended action for ${alert.mesin}`}
                                                    className="inline-flex items-center gap-1.5 rounded-md border border-[#dce7f7] bg-[#f8faff] px-2.5 py-1.5 text-xs font-semibold text-[#1257c7] hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-50"
                                                >
                                                    <Save className="h-3.5 w-3.5" />
                                                    Save
                                                </button>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <label className="sr-only" htmlFor={`owner-${alert.id}`}>
                                                Owner for {alert.mesin}
                                            </label>
                                            <span className="mb-1 flex items-center gap-1.5 text-xs text-[#7890b2]">
                                                <UserRound className="h-3.5 w-3.5" />
                                                Owner
                                            </span>
                                            <select
                                                id={`owner-${alert.id}`}
                                                value={alert.assign_staf ?? "Unassigned"}
                                                disabled={busy || employeesLoading}
                                                onChange={(event) =>
                                                    void updateAlert(alert.id, { assign_staf: event.target.value })
                                                }
                                                className="max-w-[190px] rounded-lg border border-[#dce7f7] bg-white px-2 py-1.5 text-sm text-[#45648d] disabled:opacity-60"
                                            >
                                                <option value="Unassigned">Unassigned</option>
                                                {employees.map((employee) => (
                                                    <option key={employee.id} value={employee.full_name}>
                                                        {employee.full_name}
                                                    </option>
                                                ))}
                                                {alert.assign_staf &&
                                                    alert.assign_staf !== "Unassigned" &&
                                                    !employees.some(
                                                        (employee) => employee.full_name === alert.assign_staf
                                                    ) && (
                                                        <option value={alert.assign_staf}>{alert.assign_staf}</option>
                                                    )}
                                            </select>
                                        </td>
                                        <td className="px-5 py-4">
                                            <label className="sr-only" htmlFor={`status-${alert.id}`}>
                                                Status for {alert.mesin}
                                            </label>
                                            <select
                                                id={`status-${alert.id}`}
                                                value={alert.status}
                                                disabled={busy}
                                                onChange={(event) =>
                                                    isAlertStatus(event.target.value) &&
                                                    void updateAlert(alert.id, { status: event.target.value })
                                                }
                                                className={`rounded-lg border px-2 py-1.5 text-sm font-semibold disabled:opacity-60 ${statusClass(alert.status)}`}
                                            >
                                                <option value="unsolved">Unsolved</option>
                                                <option value="in_progress">In progress</option>
                                                <option value="solved">Solved</option>
                                            </select>
                                        </td>
                                        <td className="px-5 py-4">
                                            {isSolved(alert.status) && (
                                                <button
                                                    type="button"
                                                    onClick={() => void deleteSolvedAlert(alert)}
                                                    disabled={busy}
                                                    aria-label={`Delete solved alert for ${alert.mesin}`}
                                                    title="Delete solved alert"
                                                    className="rounded-lg p-2 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {filtered.length === 0 && (
                    <p className="p-8 text-center text-sm text-[#7890b2]">
                        {loading ? "Loading alerts…" : "No alerts match the selected filters."}
                    </p>
                )}
            </section>
        </div>
    );
}

function Stat({
    label,
    value,
    icon,
}: {
    label: string;
    value: number;
    icon: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-[#dce7f7] bg-white p-5 shadow-[0_10px_28px_rgba(8,47,128,0.05)]">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#7890b2]">
                {icon}
                {label}
            </div>
            <p className="mt-3 text-3xl font-semibold text-[#082f80]">{value}</p>
        </div>
    );
}

function Severity({ value }: { value: string }) {
    const normalized = value.toLowerCase();
    const tone =
        normalized === "critical" || normalized === "high risk"
            ? "bg-[#fff0f0] text-[#bf3d4b]"
            : normalized === "warning" || normalized === "medium risk"
                ? "bg-[#fff8e8] text-[#b57616]"
                : "bg-[#eef4ff] text-[#1257c7]";

    return (
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${tone}`}>
            {value}
        </span>
    );
}
