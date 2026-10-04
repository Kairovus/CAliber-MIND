"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  CircleGauge,
  Database,
  Factory,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";

const machines = [
  {
    id: "BL-5702",
    name: "Product Blower",
    productionTable: "production-rca5-bl-5702",
    performanceTable: "equipment-performance-rca5-bl-5702",
    tagTable: "production-tags-rca5-bl-5702",
    summaryTable: "equipment-summary-rca5-bl-5702",
    tagPrefix: "BL5702",
  },
  {
    id: "HE-3301",
    name: "Feed/Effluent Heat Exchanger",
    productionTable: "production-rca4-he-3301",
    performanceTable: "equipment-performance-rca4-he-3301",
    tagTable: "production-tags-rca4-he-3301",
    summaryTable: "equipment-summary-rca4-he-3301",
    tagPrefix: "HE3301",
  },
  {
    id: "PM-4405B",
    name: "Cooling Water Pump",
    productionTable: "production-rca3-pm-4405b",
    performanceTable: "equipment-performance-rca3-pm-4405b",
    tagTable: "production-tags-rca3-pm-4405b",
    summaryTable: "equipment-summary-rca3-pm-4405b",
    tagPrefix: "PM4405B",
  },
  {
    id: "KO-3201",
    name: "Cracked Gas Compressor",
    productionTable: "production-rca2-ko-3201",
    performanceTable: "equipment-performance-rca2-ko-3201",
    tagTable: "production-tags-rca2-ko-3201",
    summaryTable: "equipment-summary-rca2-ko-3201",
    tagPrefix: "KO3201",
  },
  {
    id: "PU-2101B",
    name: "Feed Charge Pump",
    productionTable: "production-rca1-pu-2101b",
    performanceTable: "equipment-performance-rca1-pu-2101b",
    tagTable: "production-tags-rca1-pu-2101b",
    summaryTable: "equipment-summary-rca1-pu-2101b",
    tagPrefix: "PU2101B",
  },
];

type DataRow = Record<string, unknown>;

type MachineSnapshot = {
  loading: boolean;
  latest: DataRow | null;
  performanceRows: DataRow[];
  typicalValues: Record<string, number>;
  error: string | null;
};

type KpiRule = {
  column: string;
  baselineTag: string | null;
  direction: "higher" | "lower" | "range" | "context";
  weight: number;
};

type ConditionScore = {
  score: number;
  assessedKpis: number;
  totalKpis: number;
};

type RootCauseFinding = {
  machineId: string;
  title: string;
  evidence: string;
  action: string;
};

type RootCauseInsights = {
  highRisk: RootCauseFinding[];
  mediumRisk: RootCauseFinding[];
  lowRisk: RootCauseFinding[];
};

type RootCauseLevel = keyof RootCauseInsights;
type AlertRiskLevel = "high" | "medium" | "low";
type AlertSubmission =
  | { state: "saving" }
  | { state: "created" }
  | { state: "error"; message: string };

type RootCauseResponse = {
  generatedAt: string;
  window: string;
  thresholds: string;
  insights: RootCauseInsights;
};

const kpiRules: Record<string, KpiRule[]> = {
  "BL-5702": [
    { column: "Overall Vibration\n(mm/s)", baselineTag: "VIB", direction: "higher", weight: 1 },
    { column: "2X Harmonic\n(mm/s)", baselineTag: "VIB", direction: "higher", weight: 1 },
    { column: "Coupling Offset\n(mm)", baselineTag: null, direction: "range", weight: 1 },
    { column: "Bearing Temp\n(°C)", baselineTag: "TEMP", direction: "higher", weight: 1 },
  ],
  "HE-3301": [
    { column: "Tube-side dP\n(bar)", baselineTag: "DISP", direction: "higher", weight: 1 },
    { column: "Heat Duty\n(% design)", baselineTag: null, direction: "lower", weight: 1 },
    { column: "Cold Outlet Temp\n(°C)", baselineTag: "TEMP", direction: "range", weight: 1 },
    { column: "Feed Heavy-ends\n(%)", baselineTag: null, direction: "context", weight: 0 },
  ],
  "PM-4405B": [
    { column: "Motor DE Bearing Temp\n(°C)", baselineTag: "TEMP", direction: "higher", weight: 1 },
    { column: "Motor Vibration\n(mm/s)", baselineTag: "VIB", direction: "higher", weight: 1 },
    { column: "Motor Ampere\n(A)", baselineTag: "AMP", direction: "range", weight: 1 },
    { column: "Winding Temp\n(°C)", baselineTag: "TEMP", direction: "higher", weight: 1 },
  ],
  "KO-3201": [
    { column: "DE Radial Vibration\n(micron)", baselineTag: null, direction: "higher", weight: 1 },
    { column: "Lube Oil Water Content\n(ppm)", baselineTag: null, direction: "higher", weight: 1 },
    { column: "Lube Oil Supply Press\n(barg)", baselineTag: "DISP", direction: "range", weight: 1 },
    { column: "Bearing Metal Temp\n(°C)", baselineTag: "TEMP", direction: "higher", weight: 1 },
  ],
  "PU-2101B": [
    { column: "Overall Vibration\n(mm/s)", baselineTag: "VIB", direction: "higher", weight: 1 },
    { column: "Seal Flush Flow\n(L/min)", baselineTag: null, direction: "range", weight: 1 },
    { column: "Discharge Pressure\n(barg)", baselineTag: "DISP", direction: "range", weight: 1 },
    { column: "Bearing Temp\n(°C)", baselineTag: "TEMP", direction: "higher", weight: 1 },
  ],
};

type AlertRow = {
  id: string;
  mesin: string;
  alert_status: string;
  status: string;
};

const initialSnapshots = Object.fromEntries(
  machines.map((machine) => [
    machine.id,
    {
      loading: true,
      latest: null,
      performanceRows: [],
      typicalValues: {},
      error: null,
    } satisfies MachineSnapshot,
  ])
) as Record<string, MachineSnapshot>;

function isDataRow(value: unknown): value is DataRow {
  return typeof value === "object" && value !== null;
}

function isRootCauseFinding(value: unknown): value is RootCauseFinding {
  return (
    isDataRow(value) &&
    typeof value.machineId === "string" &&
    typeof value.title === "string" &&
    typeof value.evidence === "string" &&
    typeof value.action === "string"
  );
}

function alertSubmissionKey(item: RootCauseFinding): string {
  return JSON.stringify([item.machineId, item.title, item.evidence]);
}

function isRootCauseResponse(value: unknown): value is RootCauseResponse {
  if (!isDataRow(value) || !isDataRow(value.insights)) return false;
  return (
    typeof value.generatedAt === "string" &&
    typeof value.window === "string" &&
    typeof value.thresholds === "string" &&
    Array.isArray(value.insights.highRisk) &&
    value.insights.highRisk.every(isRootCauseFinding) &&
    Array.isArray(value.insights.mediumRisk) &&
    value.insights.mediumRisk.every(isRootCauseFinding) &&
    Array.isArray(value.insights.lowRisk) &&
    value.insights.lowRisk.every(isRootCauseFinding)
  );
}

function isAlertRow(value: unknown): value is AlertRow {
  return (
    isDataRow(value) &&
    typeof value.id === "string" &&
    typeof value.mesin === "string" &&
    typeof value.alert_status === "string" &&
    typeof value.status === "string"
  );
}

async function fetchRows(
  table: string,
  limit: number,
  signal: AbortSignal,
  offset = 0
): Promise<DataRow[]> {
  const response = await fetch(
    `/api/tables/${table}?limit=${limit}&offset=${offset}`,
    { cache: "no-store", signal }
  );
  const payload: unknown = await response.json();

  if (!response.ok) {
    const message =
      isDataRow(payload) &&
      typeof payload.error === "string"
        ? payload.error
        : `Unable to load ${table}.`;
    throw new Error(message);
  }

  if (!isDataRow(payload) || !Array.isArray(payload.data)) {
    throw new Error(`Invalid response while loading ${table}.`);
  }

  return payload.data.filter(isDataRow);
}

async function fetchAllRows(table: string, signal: AbortSignal): Promise<DataRow[]> {
  const pageSize = 30;
  const rows: DataRow[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchRows(table, pageSize, signal, offset);
    rows.push(...page);
    if (page.length < pageSize) return rows;
    offset += page.length;
  }
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatDate(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function isOff(status: unknown): boolean {
  return typeof status === "string" && status.trim().toLowerCase() === "off";
}

function isOpenAlert(alert: AlertRow): boolean {
  const status = alert.status.trim().toLowerCase();
  return !["solved", "resolved", "closed", "complete", "completed", "cancelled"].includes(
    status
  );
}

function getTypicalValues(rows: DataRow[], tagPrefix: string): Record<string, number> {
  return Object.fromEntries(
    rows.flatMap((row) => {
      if (typeof row.Name !== "string" || !row.Name.startsWith(`${tagPrefix}_`)) {
        return [];
      }
      const typical = Number(row.typicalvalue);
      if (!Number.isFinite(typical)) return [];
      return [[row.Name.slice(tagPrefix.length + 1), typical]];
    })
  );
}

function scoreCondition(
  machineId: string,
  row: DataRow,
  typicalValues: Record<string, number>
): ConditionScore | null {
  const rules = kpiRules[machineId] ?? [];
  const applicableRules = rules.filter((rule) => rule.direction !== "context");
  let weightedRisk = 0;
  let totalWeight = 0;
  let assessedKpis = 0;

  for (const rule of applicableRules) {
    if (!rule.baselineTag || rule.weight <= 0) continue;
    const reading = Number(row[rule.column]);
    const typical = typicalValues[rule.baselineTag];
    if (!Number.isFinite(reading) || !Number.isFinite(typical) || typical === 0) continue;

    const margin = Math.abs(typical);
    const warningOffset = margin * 0.1;
    const alarmOffset = margin * 0.25;
    let risk = 0;

    if (rule.direction === "higher") {
      const warning = typical + warningOffset;
      const alarm = typical + alarmOffset;
      risk = Math.min(1, Math.max(0, (reading - warning) / (alarm - warning)));
    } else if (rule.direction === "lower") {
      const warning = typical - warningOffset;
      const alarm = typical - alarmOffset;
      risk = Math.min(1, Math.max(0, (warning - reading) / (warning - alarm)));
    } else {
      const warningLow = typical - warningOffset;
      const warningHigh = typical + warningOffset;
      const alarmLow = typical - alarmOffset;
      const alarmHigh = typical + alarmOffset;
      if (reading < warningLow) {
        risk = Math.min(1, Math.max(0, (warningLow - reading) / (warningLow - alarmLow)));
      } else if (reading > warningHigh) {
        risk = Math.min(1, Math.max(0, (reading - warningHigh) / (alarmHigh - warningHigh)));
      }
    }

    weightedRisk += rule.weight * risk;
    totalWeight += rule.weight;
    assessedKpis += 1;
  }

  if (totalWeight === 0) return null;
  return {
    score: 100 - (100 * weightedRisk) / totalWeight,
    assessedKpis,
    totalKpis: applicableRules.length,
  };
}

function healthBand(score: number): { label: string; color: string } {
  if (score >= 85) return { label: "Healthy", color: "text-[#25824b]" };
  if (score >= 70) return { label: "Watch", color: "text-[#b57616]" };
  if (score >= 50) return { label: "Warning", color: "text-[#bf5d27]" };
  return { label: "Critical", color: "text-[#bf3d4b]" };
}

export function PerformanceContent() {
  const [selectedMachine, setSelectedMachine] = useState("BL-5702");
  const [snapshots, setSnapshots] = useState(initialSnapshots);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [alertsRefresh, setAlertsRefresh] = useState(0);
  const [alertSubmissions, setAlertSubmissions] = useState<
    Record<string, AlertSubmission>
  >({});
  const [history, setHistory] = useState<DataRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyMachineId, setHistoryMachineId] = useState(selectedMachine);
  const [summaryRows, setSummaryRows] = useState<DataRow[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [rootCause, setRootCause] = useState<RootCauseResponse | null>(null);
  const [rootCauseLoading, setRootCauseLoading] = useState(true);
  const [rootCauseError, setRootCauseError] = useState<string | null>(null);
  const [rootCauseRefresh, setRootCauseRefresh] = useState(0);
  const [rootCauseLevel, setRootCauseLevel] = useState<RootCauseLevel>("highRisk");

  const machine = machines.find((item) => item.id === selectedMachine) ?? machines[0];
  const snapshot = snapshots[selectedMachine] ?? {
    loading: true,
    latest: null,
    performanceRows: [],
    typicalValues: {},
    error: null,
  };

  useEffect(() => {
    const controller = new AbortController();
    setSnapshots(initialSnapshots);

    void Promise.all(
      machines.map(async (item) => {
        try {
          const [productionRows, performanceRows, tagRows] = await Promise.all([
            fetchRows(item.productionTable, 1, controller.signal),
            fetchRows(item.performanceTable, 10, controller.signal),
            fetchRows(item.tagTable, 30, controller.signal),
          ]);
          return {
            id: item.id,
            value: {
              loading: false,
              latest: productionRows[0] ?? null,
              performanceRows,
              typicalValues: getTypicalValues(tagRows, item.tagPrefix),
              error: null,
            } satisfies MachineSnapshot,
          };
        } catch (error) {
          if (controller.signal.aborted) return null;
          return {
            id: item.id,
            value: {
              loading: false,
              latest: null,
              performanceRows: [],
              typicalValues: {},
              error: error instanceof Error ? error.message : "Unable to load machine data.",
            } satisfies MachineSnapshot,
          };
        }
      })
    ).then((results) => {
      if (controller.signal.aborted) return;
      setSnapshots(
        Object.fromEntries(
          results.filter((result) => result !== null).map((result) => [result.id, result.value])
        )
      );
    });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setRootCauseLoading(true);
    setRootCauseError(null);
    setRootCause(null);

    void fetch("/api/insights/root-cause", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok) {
          const message =
            isDataRow(payload) && typeof payload.error === "string"
              ? payload.error
              : "Unable to generate root-cause insights.";
          throw new Error(message);
        }
        if (!isRootCauseResponse(payload)) {
          throw new Error("The root-cause API returned an invalid response.");
        }
        return payload;
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setRootCause(payload);
        setRootCauseLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setRootCauseError(
          error instanceof Error
            ? error.message
            : "Unable to generate root-cause insights."
        );
        setRootCauseLoading(false);
      });

    return () => controller.abort();
  }, [rootCauseRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    setSummaryRows([]);
    setSummaryLoading(true);
    setSummaryError(null);

    void fetchRows(machine.summaryTable, 30, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setSummaryRows(rows);
        setSummaryLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSummaryError(
          error instanceof Error ? error.message : "Unable to load performance summary."
        );
        setSummaryLoading(false);
      });

    return () => controller.abort();
  }, [machine.summaryTable]);

  useEffect(() => {
    const controller = new AbortController();
    setAlertsLoading(true);
    setAlertsError(null);

    void fetchAllRows("alerts", controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setAlerts(rows.filter(isAlertRow));
        setAlertsLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAlerts([]);
        setAlertsError(
          error instanceof Error ? error.message : "Unable to load alert data."
        );
        setAlertsLoading(false);
      });

    return () => controller.abort();
  }, [alertsRefresh]);

  useEffect(() => {
    const controller = new AbortController();
    setHistory([]);
    setHistoryMachineId(selectedMachine);
    setHistoryLoading(true);
    setHistoryError(null);

    void fetchRows(machine.performanceTable, 5, controller.signal)
      .then((rows) => {
        if (controller.signal.aborted) return;
        setHistory(rows);
        setHistoryLoading(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setHistoryError(
          error instanceof Error ? error.message : "Unable to load condition history."
        );
        setHistoryLoading(false);
      });

    return () => controller.abort();
  }, [machine.performanceTable, selectedMachine]);

  const activeAlerts = useMemo(() => alerts.filter(isOpenAlert), [alerts]);
  const highRiskAlerts = useMemo(
    () =>
      activeAlerts.filter((alert) =>
        ["high risk", "critical"].includes(alert.alert_status.trim().toLowerCase())
      ),
    [activeAlerts]
  );
  const affectedMachines = useMemo(
    () => new Set(activeAlerts.map((alert) => alert.mesin)).size,
    [activeAlerts]
  );

  const assessedMachines = machines.flatMap((item) => {
    const itemSnapshot = snapshots[item.id];
    if (!itemSnapshot?.latest || isOff(itemSnapshot.latest.RUN_STATUS)) return [];
    const latestReading = itemSnapshot.performanceRows[0];
    if (!latestReading) return [];
    const score = scoreCondition(item.id, latestReading, itemSnapshot.typicalValues);
    return score ? [score.score] : [];
  });
  const plantHealthScore =
    assessedMachines.length > 0
      ? assessedMachines.reduce((total, score) => total + score, 0) / assessedMachines.length
      : null;
  const currentStatus = snapshot.latest?.RUN_STATUS;
  const selectedScore =
    !snapshot.loading && !snapshot.error && !isOff(currentStatus) && snapshot.performanceRows[0]
      ? scoreCondition(selectedMachine, snapshot.performanceRows[0], snapshot.typicalValues)
      : null;
  const currentHistory = historyMachineId === selectedMachine ? history : [];
  const historyColumns = currentHistory[0]
    ? Object.keys(currentHistory[0]).filter(
        (column) => !["Week", "Date", "Health Status", "Remark"].includes(column)
      )
    : [];

  const createAlert = async (item: RootCauseFinding, riskLevel: AlertRiskLevel) => {
    const key = alertSubmissionKey(item);
    setAlertSubmissions((current) => ({ ...current, [key]: { state: "saving" } }));

    try {
      const response = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          machineId: item.machineId,
          riskLevel,
          title: item.title,
          evidence: item.evidence,
          action: item.action,
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          isDataRow(payload) && typeof payload.error === "string"
            ? payload.error
            : "Could not create the alert.";
        throw new Error(message);
      }

      setAlertSubmissions((current) => ({
        ...current,
        [key]: { state: "created" },
      }));
      window.dispatchEvent(new Event("alerts:updated"));
      setAlertsRefresh((current) => current + 1);
    } catch (error) {
      setAlertSubmissions((current) => ({
        ...current,
        [key]: {
          state: "error",
          message: error instanceof Error ? error.message : "Could not create the alert.",
        },
      }));
    }
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <div className="rounded-2xl border border-[#dce7f7] bg-white p-6 shadow-[0_8px_24px_rgba(8,47,128,0.06)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#7890b2]">
                <Database className="h-4 w-4 text-[#1257c7]" />
                Condition intelligence
              </div>
              <h2 className="mt-3 text-xl font-semibold text-[#082f80]">Unseen trouble detection</h2>
              <p className="mt-1 max-w-2xl text-sm text-[#6c83a4]">
                Open trouble signals and risk alerts from the live alerts table.
              </p>
            </div>
            <span
              className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                alertsError
                  ? "bg-red-50 text-red-700"
                  : alertsLoading
                    ? "bg-[#f4f6fa] text-[#7890b2]"
                    : "bg-[#eaf8ef] text-[#25824b]"
              }`}
            >
              {alertsError ? "Data unavailable" : alertsLoading ? "Loading alerts" : "Database synced"}
            </span>
          </div>
          {alertsError && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              Could not load alerts: {alertsError}
            </p>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stat label="Open alerts" value={alertsLoading ? "…" : alertsError ? "—" : activeAlerts.length} />
            <Stat label="High-risk alerts" value={alertsLoading ? "…" : alertsError ? "—" : highRiskAlerts.length} />
            <Stat label="Machines affected" value={alertsLoading ? "…" : alertsError ? "—" : affectedMachines} />
          </div>
        </div>
        <div className="rounded-2xl border border-[#dce7f7] bg-[#082f80] p-6 text-white shadow-[0_8px_24px_rgba(8,47,128,0.12)]">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CircleGauge className="h-5 w-5 text-[#8bb5ff]" />
            Plant health score
          </div>
          <p className="mt-5 text-5xl font-semibold">
            {plantHealthScore === null ? "—" : plantHealthScore.toFixed(1)}
            {plantHealthScore !== null && <span className="text-xl text-[#9bb8e7]">%</span>}
          </p>
          <div className="mt-5 flex items-center gap-2 text-sm text-[#bcd2f4]">
            {plantHealthScore === null
              ? "No running machine has enough matching KPI baselines for an assessment"
              : `Mean health of ${assessedMachines.length} assessed machines`}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[#dce7f7] bg-white p-5 shadow-[0_8px_24px_rgba(8,47,128,0.06)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-[#082f80]">Machine condition</h3>
            <p className="mt-1 text-sm text-[#6c83a4]">
              Development heuristic (not validated): tag typical values are the baseline, warning starts at 10% deviation, alarm at 25%, and supported KPIs are equally weighted. KPIs without a comparable tag baseline are omitted.
            </p>
          </div>
          <Factory className="h-5 w-5 text-[#5c8ce8]" />
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {machines.map((item) => {
            const itemSnapshot = snapshots[item.id];
            const status = itemSnapshot?.latest?.RUN_STATUS;
            const offline = isOff(status);
            const latestPerformance = itemSnapshot?.performanceRows[0];
            const itemScore =
              !itemSnapshot?.loading && !itemSnapshot?.error && !offline && latestPerformance
                ? scoreCondition(item.id, latestPerformance, itemSnapshot.typicalValues)
                : null;
            const band = itemScore ? healthBand(itemScore.score) : null;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedMachine(item.id)}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  item.id === selectedMachine
                    ? "border-[#1257c7] bg-[#eef4ff]"
                    : "border-[#e7edf7] bg-[#fbfcff] hover:border-[#91b1ed]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      itemSnapshot?.error
                        ? "bg-red-500"
                        : offline
                          ? "bg-[#91b1ed]"
                          : "bg-[#1d68d4]"
                    }`}
                  />
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#7890b2]">
                    {itemSnapshot?.loading
                      ? "Loading"
                      : itemSnapshot?.error
                        ? "Unavailable"
                        : offline
                          ? "Idle"
                          : display(status || "Status unavailable")}
                  </span>
                </div>
                <p className="mt-4 text-sm font-semibold text-[#173e82]">{item.id}</p>
                <p className="mt-1 min-h-8 text-xs leading-4 text-[#7890b2]">{item.name}                </p>
                <p className={`mt-3 text-lg font-semibold ${band?.color ?? "text-[#082f80]"}`}>
                  {itemSnapshot?.loading ? "…" : itemSnapshot?.error ? "Unavailable" : offline ? "—" : itemScore ? `${itemScore.score.toFixed(1)}%` : "—"}
                </p>
                <p className="mt-1 text-[10px] text-[#7890b2]">
                  {itemSnapshot?.loading
                    ? "Loading latest reading"
                    : itemSnapshot?.error
                      ? "Production data unavailable"
                      : offline
                        ? "Idle · no current assessment"
                        : band
                          ? `${band.label} · ${itemScore?.assessedKpis}/${itemScore?.totalKpis} KPIs`
                          : itemSnapshot?.latest
                            ? "No comparable KPI baseline"
                            : "No current reading"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <aside className="flex h-[min(900px,max(420px,76vh))] max-h-[min(900px,max(420px,76vh))] flex-col overflow-hidden rounded-2xl border-2 border-[#1257c7] bg-white shadow-[0_16px_40px_rgba(18,87,199,0.14)]">
        <div className="shrink-0 border-b border-[#dce7f7] bg-[#f8faff] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1257c7] text-white">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-[#1257c7]">
                  Priority analysis
                </div>
                <h2 className="mt-1 text-xl font-bold text-[#082f80]">Root-cause insights</h2>
                <p className="mt-1 text-sm text-[#45648d]">
                  AI review across all five machines, based on production and performance data
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setRootCauseRefresh((refresh) => refresh + 1)}
              disabled={rootCauseLoading}
              aria-label="Refresh root-cause insights"
              className="flex shrink-0 items-center gap-2 rounded-lg border border-[#b9ccec] bg-white px-3 py-2 text-sm font-semibold text-[#1257c7] hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${rootCauseLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
          <p className="mt-4 max-w-5xl text-sm leading-6 text-[#365477]">
            Reviews the latest 10 production records, tag typical values, and latest 10 weekly
            performance records per machine. Screening thresholds are project heuristics, not
            validated plant alarm limits.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
          {rootCauseLoading && (
            <div className="rounded-xl border border-[#dce7f7] bg-[#f6f9fe] p-6 text-base text-[#365477]">
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 animate-spin text-[#1257c7]" />
                Reading machine data and generating recommendations…
              </div>
            </div>
          )}
          {rootCauseError && (
            <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-5">
              <p className="text-base font-bold text-red-900">Could not generate insights</p>
              <p className="mt-2 text-sm leading-6 text-red-800">{rootCauseError}</p>
              <button
                type="button"
                onClick={() => setRootCauseRefresh((refresh) => refresh + 1)}
                className="mt-4 rounded-lg border border-red-400 bg-white px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-100"
              >
                Try again
              </button>
            </div>
          )}
          {!rootCauseLoading && rootCause && (
            <>
              <div className="mb-5 rounded-lg border border-[#dce7f7] bg-[#f8faff] px-4 py-3 text-xs leading-5 text-[#45648d]">
                {rootCause.window}. Generated {formatDate(rootCause.generatedAt)}. {rootCause.thresholds}.
              </div>
              <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter root-cause risk level">
                {([
                  ["highRisk", "High risk", "border-red-300 bg-red-50 text-red-900"],
                  ["mediumRisk", "Medium risk", "border-amber-300 bg-amber-50 text-amber-900"],
                  ["lowRisk", "Low risk", "border-[#b9ccec] bg-[#eef4ff] text-[#0b459e]"],
                ] as const).map(([level, label, tone]) => {
                  const selected = rootCauseLevel === level;
                  const items = rootCause.insights[level];
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setRootCauseLevel(level)}
                      aria-pressed={selected}
                      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold transition-colors ${
                        selected ? `${tone} ring-2 ring-offset-1 ring-[#1257c7]` : "border-[#dce7f7] bg-white text-[#45648d] hover:bg-[#f6f9fe]"
                      }`}
                    >
                      {label}
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#173e82]">
                        {items.length}
                      </span>
                    </button>
                  );
                })}
              </div>
              <RootCauseGroup
                title={
                  rootCauseLevel === "highRisk"
                    ? "High risk"
                    : rootCauseLevel === "mediumRisk"
                      ? "Medium risk"
                      : "Low risk"
                }
                description={
                  rootCauseLevel === "highRisk"
                    ? "Large deviations requiring prompt human review"
                    : rootCauseLevel === "mediumRisk"
                      ? "Moderate deviations to investigate and monitor"
                      : "Small deviations to keep under routine observation"
                }
                tone={rootCauseLevel === "highRisk" ? "high" : rootCauseLevel === "mediumRisk" ? "medium" : "low"}
                items={rootCause.insights[rootCauseLevel]}
                riskLevel={
                  rootCauseLevel === "highRisk"
                    ? "high"
                    : rootCauseLevel === "mediumRisk"
                      ? "medium"
                      : "low"
                }
                submissions={alertSubmissions}
                onCreateAlert={createAlert}
              />
              <p className="mt-5 flex items-start gap-2 text-xs leading-5 text-[#45648d]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b57616]" />
                AI findings are screening suggestions, not confirmed diagnoses or instructions to
                operate equipment.
              </p>
            </>
          )}
        </div>
      </aside>

      <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-[#dce7f7] bg-white shadow-[0_8px_24px_rgba(8,47,128,0.06)]">
            <div className="flex items-center justify-between border-b border-[#edf2fa] p-5">
              <div>
                <h3 className="text-base font-semibold text-[#082f80]">
                  Condition history · {machine.id}
                </h3>
                <p className="mt-1 text-sm text-[#6c83a4]">
                  Latest five equipment performance readings
                </p>
              </div>
              <span className="flex items-center gap-2 rounded-lg border border-[#dce7f7] px-3 py-2 text-xs font-semibold text-[#45648d]">
                Last 5 readings <ChevronDown className="h-3.5 w-3.5" />
              </span>
            </div>
            {historyError && (
              <p role="alert" className="p-4 text-sm text-red-700">
                Could not load condition history: {historyError}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px]">
                <thead>
                  <tr className="bg-[#f8faff] text-left text-[10px] font-bold uppercase tracking-wider text-[#7890b2]">
                    <th className="px-5 py-3">Date</th>
                    {historyColumns.map((column) => (
                      <th key={column} className="px-5 py-3">{column}</th>
                    ))}
                    <th className="px-5 py-3">Estimated health</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2fa]">
                  {historyLoading ? (
                    <tr><td colSpan={historyColumns.length + 2} className="px-5 py-8 text-center text-sm text-[#7890b2]">Loading readings…</td></tr>
                  ) : historyError ? (
                    <tr><td colSpan={historyColumns.length + 2} className="px-5 py-8 text-center text-sm text-[#7890b2]">Readings unavailable.</td></tr>
                  ) : currentHistory.length === 0 ? (
                    <tr><td colSpan={historyColumns.length + 2} className="px-5 py-8 text-center text-sm text-[#7890b2]">No condition readings found.</td></tr>
                  ) : (
                    currentHistory.map((row, index) => {
                      const rowScore = scoreCondition(
                        selectedMachine,
                        row,
                        snapshot.typicalValues
                      );
                      const rowBand = rowScore ? healthBand(rowScore.score) : null;
                      return (
                        <tr key={`${display(row.Date)}-${index}`} className="text-sm text-[#45648d]">
                          <td className="whitespace-nowrap px-5 py-4 font-medium text-[#173e82]">{formatDate(row.Date)}</td>
                          {historyColumns.map((column) => (
                            <td key={column} className="px-5 py-4 font-mono">{display(row[column])}</td>
                          ))}
                          <td className="px-5 py-4">
                            {isOff(snapshot.latest?.RUN_STATUS) ? (
                              <span className="text-xs text-[#7890b2]">Idle · no current assessment</span>
                            ) : rowScore && rowBand ? (
                              <span className={`inline-flex items-center gap-1.5 rounded-full bg-[#f4f6fa] px-2 py-1 text-xs font-semibold ${rowBand.color}`}>
                                <CircleGauge className="h-3.5 w-3.5" />
                                {rowScore.score.toFixed(1)}% · {rowBand.label}
                              </span>
                            ) : (
                              <span className="text-xs text-[#7890b2]">No comparable KPI baseline</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-[#dce7f7] bg-white shadow-[0_8px_24px_rgba(8,47,128,0.06)]">
            <div className="border-b border-[#edf2fa] p-5">
              <h3 className="text-base font-semibold text-[#082f80]">Performance summary · {machine.id}</h3>
              <p className="mt-1 text-sm text-[#6c83a4]">
                Reliability and production impact from the monitoring window
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="bg-[#f8faff] text-left text-[10px] font-bold uppercase tracking-wider text-[#7890b2]">
                    <th className="px-5 py-3">KPI</th>
                    <th className="px-5 py-3">Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf2fa]">
                  {summaryLoading ? (
                    <tr><td colSpan={2} className="px-5 py-8 text-center text-sm text-[#7890b2]">Loading summary…</td></tr>
                  ) : summaryError ? (
                    <tr><td colSpan={2} role="alert" className="px-5 py-8 text-center text-sm text-red-700">Could not load summary: {summaryError}</td></tr>
                  ) : summaryRows.length === 0 ? (
                    <tr><td colSpan={2} className="px-5 py-8 text-center text-sm text-[#7890b2]">No summary data found.</td></tr>
                  ) : (
                    summaryRows.map((row, index) => (
                      <tr key={`${display(row.KPI)}-${index}`} className="text-sm">
                        <td className="px-5 py-3.5 font-medium text-[#173e82]">{display(row.KPI)}</td>
                        <td className="px-5 py-3.5 font-mono font-semibold text-[#082f80]">{display(row.Value)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-[#f6f9fe] p-4">
      <p className="text-xs text-[#7890b2]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-[#082f80]">{value}</p>
    </div>
  );
}

function RootCauseGroup({
  title,
  description,
  tone,
  items,
  riskLevel,
  submissions,
  onCreateAlert,
}: {
  title: string;
  description: string;
  tone: "high" | "medium" | "low";
  items: RootCauseFinding[];
  riskLevel: AlertRiskLevel;
  submissions: Record<string, AlertSubmission>;
  onCreateAlert: (item: RootCauseFinding, riskLevel: AlertRiskLevel) => void;
}) {
  const color =
    tone === "high"
      ? "border-red-200 bg-red-50 text-red-800"
      : tone === "medium"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-[#dce7f7] bg-[#eef4ff] text-[#0b459e]";

  return (
    <section className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-base font-bold">{title}</h4>
          <p className="mt-1 text-xs leading-5 opacity-90">{description}</p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#173e82]">
          {items.length}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 rounded-lg border border-[#dce7f7] bg-white p-3 text-sm leading-6 text-[#365477]">
          {tone === "high"
            ? "No high-risk deviations detected in the available data."
            : tone === "medium"
              ? "No medium-risk deviations detected in the available data."
              : "No low-risk deviations detected in the available data."}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {items.map((item) => {
            const submission = submissions[alertSubmissionKey(item)];
            return (
            <article
              key={alertSubmissionKey(item)}
              className="rounded-lg border border-[#dce7f7] bg-white p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-[#eaf1ff] px-2.5 py-1 text-xs font-bold text-[#0b459e]">
                  {item.machineId}
                </span>
                <h5 className="text-sm font-bold leading-5 text-[#082f80]">{item.title}</h5>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#365477]">{item.evidence}</p>
              <p className="mt-3 border-t border-[#dce7f7] pt-3 text-base font-semibold leading-7 text-[#173e82]">
                <span className="font-extrabold text-[#082f80]">Action: </span>
                {item.action}
              </p>
              <div className="mt-4 border-t border-[#edf2fa] pt-3">
                <button
                  type="button"
                  onClick={() => onCreateAlert(item, riskLevel)}
                  disabled={submission?.state === "saving" || submission?.state === "created"}
                  className="rounded-lg bg-[#1257c7] px-3.5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#0b459e] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submission?.state === "saving"
                    ? "Creating alert…"
                    : submission?.state === "created"
                      ? "Alert created"
                      : submission?.state === "error"
                        ? "Retry creating alert"
                        : "Create alert"}
                </button>
                {submission?.state === "created" && (
                  <p role="status" className="mt-2 text-xs font-medium text-[#27834f]">
                    Saved to Alerts · Owner: Unassigned · Status: Unsolved
                  </p>
                )}
                {submission?.state === "error" && (
                  <p role="alert" className="mt-2 text-xs leading-5 text-red-700">
                    {submission.message}
                  </p>
                )}
              </div>
            </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
