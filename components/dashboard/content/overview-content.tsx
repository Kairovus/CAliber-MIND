"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  Factory,
  Gauge,
  MapPin,
  RefreshCw,
  Search,
} from "lucide-react";
import type { Section } from "@/app/page";

type DataRow = Record<string, unknown>;

type DashboardMachine = {
  id: string;
  name: string;
  area: string;
  x: string;
  y: string;
  prefix: string;
  tableKey: string;
};

type MachineSnapshot = {
  latest: DataRow | null;
  history: DataRow[];
  error: string | null;
};

type AlertRow = {
  id: string;
  mesin: string;
  time_stamp: string;
  penyebab: string;
  alert_status: string;
  recommended_action: string | null;
  status: string;
};

type IncidentRow = {
  status: string;
};

const machines: DashboardMachine[] = [
  { id: "BL-5702", name: "Product Blower", area: "Process bay", x: "24%", y: "32%", prefix: "BL5702", tableKey: "production-rca5-bl-5702" },
  { id: "HE-3301", name: "Feed / Effluent Heat Exchanger", area: "Heat & utilities", x: "76%", y: "32%", prefix: "HE3301", tableKey: "production-rca4-he-3301" },
  { id: "PM-4405B", name: "Cooling Water Pump", area: "Utilities bay", x: "81%", y: "72%", prefix: "PM4405B", tableKey: "production-rca3-pm-4405b" },
  { id: "KO-3201", name: "Cracked Gas Compressor", area: "Compression bay", x: "35%", y: "72%", prefix: "KO3201", tableKey: "production-rca2-ko-3201" },
  { id: "PU-2101B", name: "Feed Charge Pump", area: "Pump bay", x: "63%", y: "72%", prefix: "PU2101B", tableKey: "production-rca1-pu-2101b" },
];

const emptySnapshots = Object.fromEntries(
  machines.map((machine) => [
    machine.id,
    { latest: null, history: [], error: null } satisfies MachineSnapshot,
  ])
) as Record<string, MachineSnapshot>;

interface OverviewContentProps {
  onNavigate: (section: Section) => void;
}

function isDataRow(value: unknown): value is DataRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function fetchTable(
  tableKey: string,
  limit: number,
  signal: AbortSignal
): Promise<DataRow[]> {
  const response = await fetch(`/api/tables/${tableKey}?limit=${limit}`, {
    cache: "no-store",
    signal,
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const message =
      isDataRow(payload) && typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status}).`;
    throw new Error(message);
  }
  if (!isDataRow(payload) || !Array.isArray(payload.data)) {
    throw new Error(`Unexpected response while loading ${tableKey}.`);
  }

  return payload.data.filter(isDataRow);
}

function formatValue(value: unknown, suffix = ""): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}${suffix}`;
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== "string") return "Time unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function normalized(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isOpenAlert(alert: AlertRow): boolean {
  return normalized(alert.status) !== "solved";
}

function isActiveIncident(incident: IncidentRow): boolean {
  return !/(solved|resolved|closed|complete|completed|cancelled)/i.test(
    incident.status
  );
}

function machineHasData(snapshot: MachineSnapshot | undefined): boolean {
  return Boolean(snapshot?.latest);
}

function statusLabel(
  snapshot: MachineSnapshot | undefined,
  alerts: AlertRow[],
  loading: boolean
): string {
  if (loading) return "Loading";
  if (snapshot?.error) return "Unavailable";
  if (!snapshot?.latest) return "No data";

  const runStatus = snapshot.latest.RUN_STATUS;
  if (typeof runStatus === "string" && runStatus.trim()) {
    if (normalized(runStatus) === "off") return "Idle";
    if (alerts.some((alert) => normalized(alert.alert_status) === "critical")) {
      return "Critical alert";
    }
    if (alerts.length > 0) return "Attention";
    return runStatus;
  }

  return alerts.length > 0 ? "Attention" : "Status unavailable";
}

export function OverviewContent({ onNavigate }: OverviewContentProps) {
  const [selectedId, setSelectedId] = useState("BL-5702");
  const [snapshots, setSnapshots] = useState(emptySnapshots);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [incidentsError, setIncidentsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setAlertsError(null);
    setIncidentsError(null);

    const machineRequest = Promise.all(
      machines.map(async (machine) => {
        try {
          const history = await fetchTable(machine.tableKey, 20, controller.signal);
          return [
            machine.id,
            { latest: history[0] ?? null, history, error: null },
          ] as const;
        } catch (error) {
          return [
            machine.id,
            {
              latest: null,
              history: [],
              error: error instanceof Error ? error.message : "Unable to load production data.",
            },
          ] as const;
        }
      })
    ).then((entries) => {
      if (active) setSnapshots(Object.fromEntries(entries));
    });

    const alertsRequest = fetchTable("alerts", 30, controller.signal)
      .then((rows) => {
        if (!active) return;
        setAlerts(
          rows.filter(
            (row): row is AlertRow =>
              typeof row.id === "string" &&
              typeof row.mesin === "string" &&
              typeof row.time_stamp === "string" &&
              typeof row.penyebab === "string" &&
              typeof row.alert_status === "string" &&
              (typeof row.recommended_action === "string" ||
                row.recommended_action === null) &&
              typeof row.status === "string"
          )
        );
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) {
          setAlertsError(error instanceof Error ? error.message : "Unable to load alerts.");
        }
      });

    const incidentsRequest = fetchTable("equipment-risk-incidents", 30, controller.signal)
      .then((rows) => {
        if (!active) return;
        setIncidents(
          rows.filter(
            (row): row is DataRow & { "Overall Status": string } =>
              typeof row["Overall Status"] === "string"
          ).map((row) => ({
            status: row["Overall Status"],
          }))
        );
      })
      .catch((error: unknown) => {
        if (active && !controller.signal.aborted) {
          setIncidentsError(
            error instanceof Error ? error.message : "Unable to load incidents."
          );
        }
      });

    void Promise.all([machineRequest, alertsRequest, incidentsRequest]).finally(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, [refresh]);

  const selected = machines.find((machine) => machine.id === selectedId) ?? machines[0];
  const selectedSnapshot = snapshots[selected.id];
  const selectedAlerts = useMemo(
    () =>
      alerts
        .filter((alert) => alert.mesin.trim().toLowerCase() === selected.id.toLowerCase())
        .filter(isOpenAlert)
        .sort(
          (left, right) =>
            new Date(right.time_stamp).getTime() - new Date(left.time_stamp).getTime()
        ),
    [alerts, selected.id]
  );
  const openAlerts = alerts.filter(isOpenAlert);
  const activeIncidents = incidents.filter(isActiveIncident);
  const latestPlantRow = machines
    .map((machine) => snapshots[machine.id]?.latest)
    .filter((row): row is DataRow => row !== null && row !== undefined)
    .sort(
      (left, right) =>
        new Date(String(right.Timestamp ?? "")).getTime() -
        new Date(String(left.Timestamp ?? "")).getTime()
    )[0];
  const chartRows = [...(selectedSnapshot?.history ?? [])].reverse();
  const rateValues = chartRows
    .map((row) => row.PLANT_RATE)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const minRate = rateValues.length > 0 ? Math.min(...rateValues) : 0;
  const maxRate = rateValues.length > 0 ? Math.max(...rateValues) : 0;

  const selectedState = statusLabel(
    selectedSnapshot,
    selectedAlerts,
    loading && !machineHasData(selectedSnapshot)
  );
  const selectedIsAttention =
    selectedState === "Attention" || selectedState === "Critical alert";

  return (
    <div className="min-h-full space-y-5 bg-[#f4f6fa] p-2 text-[#172337] sm:p-4">
      <section className="flex flex-wrap items-end justify-between gap-4 px-1 pt-1 sm:px-2">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#5f7896]">
            <MapPin className="h-3.5 w-3.5 text-[#1f9abf]" />
            Plant A — West Jakarta
          </p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-[#15243a]">
            Live factory view
          </h2>
          <p className="mt-1 text-sm text-[#718198]">
            {latestPlantRow
              ? `Latest production reading · ${formatTimestamp(latestPlantRow.Timestamp)}`
              : loading
                ? "Loading live production data…"
                : "Production data unavailable"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-[#d7dee9] bg-white px-3 py-2 text-sm text-[#8290a3] lg:flex">
            <Search className="h-4 w-4" />
            Live equipment data
          </div>
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[#d7dee9] bg-white px-4 py-2 text-sm font-medium text-[#45576f] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
        <div className="relative min-h-[570px] overflow-hidden rounded-[22px] border border-[#ccd7e2] bg-[#dbe3ea] p-3 shadow-[0_14px_36px_rgba(36,58,84,0.10)] sm:p-6">
          <div
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                "linear-gradient(#b7c5d1 1px, transparent 1px), linear-gradient(90deg, #b7c5d1 1px, transparent 1px)",
              backgroundSize: "32px 32px",
            }}
          />
          <div className="relative h-[518px] overflow-hidden rounded-xl border-[10px] border-[#b6c3ce] bg-[#eff3f5] shadow-[inset_0_0_0_2px_#ffffff]">
            <div className="absolute left-[5%] top-[8%] h-[37%] w-[39%] rounded-lg border-4 border-[#aab9c5] bg-[#d9e2e8] shadow-[inset_0_0_0_3px_#edf3f6]">
              <span className="absolute left-4 top-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#718397]">Process bay</span>
              <div className="absolute bottom-8 left-8 h-16 w-24 rounded border-2 border-[#aebdc8] bg-[#c4d1d9]" />
              <div className="absolute bottom-10 right-8 h-20 w-14 rounded border-2 border-[#aebdc8] bg-[#c4d1d9]" />
            </div>
            <div className="absolute right-[5%] top-[8%] h-[37%] w-[42%] rounded-lg border-4 border-[#aab9c5] bg-[#e2e9ed] shadow-[inset_0_0_0_3px_#f4f7f8]">
              <span className="absolute left-4 top-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#718397]">Heat & utilities</span>
              <div className="absolute bottom-8 left-8 h-12 w-20 rounded border-2 border-[#aebdc8] bg-[#cbd7de]" />
              <div className="absolute bottom-8 right-10 h-16 w-16 rounded-full border-4 border-[#aebdc8] bg-[#d0dbe1]" />
            </div>
            <div className="absolute bottom-[8%] left-[5%] h-[38%] w-[43%] rounded-lg border-4 border-[#aab9c5] bg-[#e4eaed] shadow-[inset_0_0_0_3px_#f6f8f9]">
              <span className="absolute left-4 top-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#718397]">Compression bay</span>
              <div className="absolute bottom-8 left-8 h-14 w-28 rounded-full border-2 border-[#aebdc8] bg-[#cbd7de]" />
              <div className="absolute bottom-8 right-10 h-14 w-20 rounded border-2 border-[#aebdc8] bg-[#cbd7de]" />
            </div>
            <div className="absolute bottom-[8%] right-[5%] h-[38%] w-[35%] rounded-lg border-4 border-[#aab9c5] bg-[#d9e3e8] shadow-[inset_0_0_0_3px_#edf3f6]">
              <span className="absolute left-4 top-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#718397]">Pump bay</span>
              <div className="absolute bottom-8 left-8 h-16 w-12 rounded-full border-4 border-[#aebdc8] bg-[#c6d3da]" />
              <div className="absolute bottom-8 right-8 h-12 w-16 rounded border-2 border-[#aebdc8] bg-[#c6d3da]" />
            </div>
            <div className="absolute left-1/2 top-1/2 h-3/4 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#b7c7d2]" />
            {machines.map((machine) => {
              const snapshot = snapshots[machine.id];
              const machineAlerts = alerts
                .filter((alert) => alert.mesin.trim().toLowerCase() === machine.id.toLowerCase())
                .filter(isOpenAlert);
              const state = statusLabel(
                snapshot,
                machineAlerts,
                loading && !machineHasData(snapshot)
              );
              const markerColor =
                state === "Critical alert"
                  ? "bg-[#d84b56]"
                  : state === "Attention"
                    ? "bg-[#edac28]"
                    : state === "Idle" || state === "No data" || state === "Unavailable"
                      ? "bg-[#8290a3]"
                      : "bg-[#326b9f]";

              return (
                <button
                  key={machine.id}
                  type="button"
                  onClick={() => setSelectedId(machine.id)}
                  className={`group absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white p-1.5 shadow-[0_4px_14px_rgba(18,87,199,0.35)] transition-all duration-300 hover:scale-125 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#178ee5]/30 ${markerColor} ${selected.id === machine.id ? "scale-125 ring-2 ring-[#178ee5]" : ""}`}
                  style={{ left: machine.x, top: machine.y }}
                  aria-label={`Select ${machine.id}, ${state}`}
                  aria-pressed={selected.id === machine.id}
                >
                  <span className="block h-3 w-3 rounded-full bg-white" />
                  <span className="pointer-events-none absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#1c2c3f] px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-lg">
                    {machine.id} · {state}
                  </span>
                </button>
              );
            })}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg bg-white/90 px-3 py-2 text-xs font-medium text-[#62748a] shadow-sm">
              Select a machine to view live database readings
            </div>
          </div>
          <div className="relative mt-3 flex flex-wrap gap-4 text-xs text-[#536a82]">
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#326b9f]" />Running</span>
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#edac28]" />Open alert</span>
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#d84b56]" />Critical alert</span>
            <span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full bg-[#8290a3]" />Idle / unavailable</span>
          </div>
        </div>

        <aside className="rounded-2xl border border-[#d7dee9] bg-white p-5 shadow-[0_10px_28px_rgba(36,58,84,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7c8ca2]">Selected equipment</p>
              <h3 className="mt-2 text-xl font-bold text-[#15243a]">{selected.id}</h3>
              <p className="mt-1 text-sm text-[#718198]">{selected.name}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selectedState === "Critical alert" ? "bg-[#fff0f0] text-[#bf3d4b]" : selectedIsAttention ? "bg-[#fff4d9] text-[#ad7412]" : selectedState === "Running" || selectedState.toLowerCase() === "on" ? "bg-[#e4f7ef] text-[#16865d]" : "bg-[#eef2f6] text-[#62748a]"}`}>
              {selectedState}
            </span>
          </div>
          <div className="my-5 flex h-28 items-center justify-center rounded-xl bg-[#eff3f7]">
            <Factory className="h-16 w-16 text-[#8fa3b7]" />
          </div>
          {selectedSnapshot?.error && (
            <p role="alert" className="mb-3 rounded-lg bg-[#fff0f0] p-3 text-xs leading-5 text-[#a8323e]">
              Could not load production data: {selectedSnapshot.error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Reading label="Feed rate" value={formatValue(selectedSnapshot?.latest?.[`${selected.prefix}_FEED`])} />
            <Reading label="Discharge" value={formatValue(selectedSnapshot?.latest?.[`${selected.prefix}_DISP`])} />
            <Reading label="Vibration" value={formatValue(selectedSnapshot?.latest?.[`${selected.prefix}_VIB`])} />
            <Reading label="Temperature" value={formatValue(selectedSnapshot?.latest?.[`${selected.prefix}_TEMP`], "°")} />
            <Reading label="Plant rate" value={formatValue(selectedSnapshot?.latest?.PLANT_RATE)} />
            <Reading label="Current" value={formatValue(selectedSnapshot?.latest?.[`${selected.prefix}_AMP`])} />
          </div>
          <p className="mt-4 border-t border-[#edf0f4] pt-3 text-xs text-[#718198]">
            Last reading: {formatTimestamp(selectedSnapshot?.latest?.Timestamp)}
          </p>
          <button
            type="button"
            onClick={() => onNavigate("equipment")}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#233c58] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#172d45]"
          >
            View equipment details <ArrowUpRight className="h-4 w-4" />
          </button>
        </aside>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
        <div className="rounded-2xl border border-[#d7dee9] bg-white p-5">
          <div className="mb-4 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-[#1f9abf]" />
            <h3 className="font-bold text-[#24364c]">Live plant overview</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Plant rate" value={loading ? "…" : formatValue(latestPlantRow?.PLANT_RATE)} />
            <Stat
              label="Machines running"
              value={loading ? "…" : machines.filter((machine) => {
                const status = normalized(snapshots[machine.id]?.latest?.RUN_STATUS);
                return status !== "" && status !== "off";
              }).length.toString()}
            />
            <Stat label="Open alerts" value={alertsError ? "—" : loading ? "…" : openAlerts.length.toString()} />
            <Stat label="Active incidents" value={incidentsError ? "—" : loading ? "…" : activeIncidents.length.toString()} />
          </div>
          {(alertsError || incidentsError) && (
            <p role="alert" className="mt-3 text-xs leading-5 text-[#a8323e]">
              {alertsError && `Alerts unavailable: ${alertsError} `}
              {incidentsError && `Incidents unavailable: ${incidentsError}`}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[#d7dee9] bg-white p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-[#24364c]">Plant rate history</h3>
              <p className="mt-1 text-xs text-[#8492a5]">{selected.id} · latest readings</p>
            </div>
            <span className="text-xs text-[#8492a5]">{rateValues.length} points</span>
          </div>
          {selectedSnapshot?.error ? (
            <p role="alert" className="mt-5 rounded-lg bg-[#fff0f0] p-3 text-xs leading-5 text-[#a8323e]">
              Could not load chart data: {selectedSnapshot.error}
            </p>
          ) : rateValues.length === 0 ? (
            <p className="mt-5 flex h-20 items-center justify-center text-sm text-[#8492a5]">
              {loading ? "Loading production history…" : "No plant-rate history available."}
            </p>
          ) : (
            <div className="mt-5 flex h-20 items-end gap-1" aria-label={`${selected.id} plant rate history`}>
              {chartRows.map((row, index) => {
                const rate = row.PLANT_RATE;
                if (typeof rate !== "number" || !Number.isFinite(rate)) return null;
                const height = maxRate === minRate ? 65 : 12 + ((rate - minRate) / (maxRate - minRate)) * 82;
                return (
                  <div
                    key={`${String(row.Timestamp ?? index)}-${index}`}
                    title={`${formatTimestamp(row.Timestamp)} · ${formatValue(rate)}`}
                    className="flex-1 rounded-t bg-[#76b8df]"
                    style={{ height: `${height}%` }}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#d7dee9] bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-[#24364c]">Open alerts</h3>
            <button
              type="button"
              onClick={() => onNavigate("alerts")}
              className="text-xs font-semibold text-[#238dc0] hover:underline"
            >
              View all →
            </button>
          </div>
          {alertsError ? (
            <p role="alert" className="mt-4 text-xs leading-5 text-[#a8323e]">
              Could not load alerts: {alertsError}
            </p>
          ) : loading ? (
            <p className="mt-4 text-xs text-[#8492a5]">Loading alerts…</p>
          ) : selectedAlerts.length === 0 ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-[#27834f]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              No open alerts for {selected.id}.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {selectedAlerts.slice(0, 3).map((alert) => (
                <div key={alert.id} className="border-b border-[#edf0f4] pb-3 last:border-0">
                  <p className="flex items-start gap-2 text-sm font-semibold text-[#354b63]">
                    <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${normalized(alert.alert_status) === "critical" ? "text-[#d84b56]" : "text-[#edac28]"}`} />
                    {alert.penyebab}
                  </p>
                  {alert.recommended_action && (
                    <p className="mt-1 pl-6 text-xs leading-5 text-[#718198]">
                      {alert.recommended_action}
                    </p>
                  )}
                  <p className="mt-1 pl-6 text-[10px] text-[#8492a5]">
                    {formatTimestamp(alert.time_stamp)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-[#edf0f4] pb-2">
      <p className="text-xs text-[#7c8ca2]">{label}</p>
      <strong className="mt-1 block text-sm text-[#253a54]">{value}</strong>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#8492a5]">{label}</p>
      <p className="mt-1 text-xl font-bold text-[#253a54]">{value}</p>
    </div>
  );
}

export default OverviewContent;
