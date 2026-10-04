"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  Factory,
  Filter,
  RefreshCw,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RiskIncident = {
  id: string;
  title: string;
  tag: string;
  plant: string;
  equipmentType: string;
  discipline: string;
  component: string;
  mechanism: string;
  status: string;
  impact: string;
  preRisk: string;
  riskScore: number | null;
  occurredAt: string;
  rcaDueDate: string;
  pic: string;
  downtimeHours: number | null;
  actualLoss: string;
  potentialLoss: number | null;
  totalLoss: string;
  mtoNumber: string;
  arNumber: string;
};

type RiskIncidentRow = Record<string, unknown>;

const PAGE_SIZE = 30;

function toText(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isRiskIncidentRow(value: unknown): value is RiskIncidentRow {
  return typeof value === "object" && value !== null;
}

function mapIncident(row: RiskIncidentRow, index: number): RiskIncident {
  return {
    id: toText(row["Serial No"]) || toText(row["MTO No."]) || `record-${index}`,
    title: toText(row["Risk Case Title"]) || "Untitled risk case",
    tag: toText(row["Tag Number"]),
    plant: toText(row.Plant),
    equipmentType: toText(row["Eq. Type"]) || toText(row["Eq. Class"]),
    discipline: toText(row.Discipline),
    component: toText(row.Component),
    mechanism: toText(row["F Mechanism"]),
    status: toText(row["Overall Status"]) || "Status unavailable",
    impact: toText(row["Highest Impact"]),
    preRisk: toText(row["Pre-Risk"]),
    riskScore: toNumber(row["Risk Score"]),
    occurredAt: toText(row["Date of Occur."]),
    rcaDueDate: toText(row["RCA Due Date"]),
    pic: toText(row["PIC (RCA)"]),
    downtimeHours: toNumber(row["Downtime (hrs)"]),
    actualLoss: toText(row["Act. Loss (k US$)"]),
    potentialLoss: toNumber(row["Pot. Loss (k US$)"]),
    totalLoss: toText(row["Total Loss (k US$)"]),
    mtoNumber: toText(row["MTO No."]),
    arNumber: toText(row["AR No."]),
  };
}

function isClosedStatus(status: string): boolean {
  return /(solved|resolved|closed|complete|completed|cancelled)/i.test(status);
}

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function formatNumber(value: number | null, maximumFractionDigits = 1): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits }).format(value);
}

function displayValue(value: string): string {
  return value.trim() || "—";
}

export function IncidentsContent() {
  const [incidents, setIncidents] = useState<RiskIncident[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [machineFilter, setMachineFilter] = useState("All equipment");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadIncidents = useCallback(async (nextOffset: number, signal?: AbortSignal) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/tables/equipment-risk-incidents?limit=${PAGE_SIZE}&offset=${nextOffset}`,
        { cache: "no-store", signal }
      );
      const payload: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Could not load risk incident records.";
        throw new Error(message);
      }

      const rows =
        typeof payload === "object" &&
        payload !== null &&
        "data" in payload &&
        Array.isArray(payload.data)
          ? payload.data.filter(isRiskIncidentRow)
          : [];
      const loaded = rows.map(mapIncident);

      setIncidents(loaded);
      setSelectedId((currentId) =>
        loaded.some((incident) => incident.id === currentId)
          ? currentId
          : loaded[0]?.id ?? null
      );
      setOffset(nextOffset);
      setHasMore(
        typeof payload === "object" &&
          payload !== null &&
          "pagination" in payload &&
          typeof payload.pagination === "object" &&
          payload.pagination !== null &&
          "hasMore" in payload.pagination &&
          payload.pagination.hasMore === true
      );
    } catch (cause) {
      if (signal?.aborted) return;
      setIncidents([]);
      setSelectedId(null);
      setHasMore(false);
      setError(
        cause instanceof Error
          ? cause.message
          : "An unexpected error occurred while loading incidents."
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadIncidents(0, controller.signal);
    return () => controller.abort();
  }, [loadIncidents]);

  const equipmentOptions = useMemo(
    () => [
      "All equipment",
      ...Array.from(new Set(incidents.map((incident) => incident.tag).filter(Boolean))),
    ],
    [incidents]
  );

  const filteredIncidents = useMemo(
    () =>
      incidents.filter((incident) => {
        const matchesEquipment =
          machineFilter === "All equipment" || incident.tag === machineFilter;
        const matchesStatus =
          statusFilter === "all" ||
          (statusFilter === "closed"
            ? isClosedStatus(incident.status)
            : !isClosedStatus(incident.status));
        const searchable = [
          incident.id,
          incident.title,
          incident.tag,
          incident.plant,
          incident.equipmentType,
          incident.discipline,
          incident.component,
          incident.mechanism,
        ]
          .join(" ")
          .toLowerCase();

        return matchesEquipment && matchesStatus && searchable.includes(search.trim().toLowerCase());
      }),
    [incidents, machineFilter, search, statusFilter]
  );

  const selectedIncident =
    filteredIncidents.find((incident) => incident.id === selectedId) ??
    filteredIncidents[0] ??
    null;
  const openCount = incidents.filter(
    (incident) => !isClosedStatus(incident.status)
  ).length;
  const scoredCount = incidents.filter(
    (incident) => incident.riskScore !== null
  ).length;

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5c8ce8]">
            Risk &amp; corrective action
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#082f80]">
            Incident register
          </h2>
          <p className="mt-1 text-sm text-[#6c83a4]">
            RCA and CAPA/PAA cases loaded from the equipment risk database.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadIncidents(offset)}
          disabled={loading}
          className="gap-2 border-[#dce7f7] bg-white text-[#173e82]"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Cases on page" value={incidents.length} icon={<Database className="h-4 w-4" />} />
        <SummaryCard label="Open cases" value={openCount} icon={<Clock3 className="h-4 w-4" />} />
        <SummaryCard label="Cases with risk score" value={scoredCount} icon={<AlertTriangle className="h-4 w-4" />} />
      </section>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>Could not load incident records: {error}</span>
          <button
            type="button"
            onClick={() => void loadIncidents(offset)}
            className="font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(320px,0.8fr)_minmax(0,1.5fr)]">
        <div className="flex h-[min(60vh,640px)] min-h-[320px] flex-col overflow-hidden rounded-2xl border border-[#dce7f7] bg-white p-4 shadow-[0_8px_24px_rgba(8,47,128,0.06)]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7890b2]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search cases, equipment, or discipline…"
              aria-label="Search incidents"
              className="border-[#dce7f7] bg-[#fbfcff] pl-9"
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2" aria-label="Filter incident status">
            {(["all", "open", "closed"] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${
                  statusFilter === status
                    ? "bg-[#1257c7] text-white"
                    : "bg-[#eef4ff] text-[#6c83a4] hover:bg-[#e2ecff]"
                }`}
              >
                {status === "closed" ? "Closed" : status}
              </button>
            ))}
          </div>
          <label
            htmlFor="incident-equipment-filter"
            className="mb-1 mt-4 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7890b2]"
          >
            Equipment
          </label>
          <select
            id="incident-equipment-filter"
            value={machineFilter}
            onChange={(event) => setMachineFilter(event.target.value)}
            className="rounded-lg border border-[#dce7f7] bg-[#fbfcff] px-3 py-2 text-sm text-[#173e82] outline-none focus:ring-2 focus:ring-[#91b1ed]"
          >
            {equipmentOptions.map((equipment) => (
              <option key={equipment} value={equipment}>
                {equipment}
              </option>
            ))}
          </select>

          <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-1">
            {loading && incidents.length === 0 ? (
              <p className="rounded-xl bg-[#f8faff] p-5 text-center text-sm text-[#7890b2]">
                Loading incident records…
              </p>
            ) : filteredIncidents.length === 0 ? (
              <p className="rounded-xl bg-[#f8faff] p-5 text-center text-sm text-[#7890b2]">
                {error ? "Incident records are unavailable." : "No cases match these filters."}
              </p>
            ) : (
              filteredIncidents.map((incident) => (
                <button
                  key={incident.id}
                  type="button"
                  onClick={() => setSelectedId(incident.id)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    selectedIncident?.id === incident.id
                      ? "border-[#5c8ce8] bg-[#f2f6ff] shadow-sm"
                      : "border-[#e7edf7] bg-white hover:border-[#91b1ed]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="line-clamp-2 text-sm font-semibold text-[#173e82]">
                      {incident.title}
                    </span>
                    <span className="shrink-0 rounded-full bg-[#eef4ff] px-2 py-1 text-[10px] font-bold text-[#1257c7]">
                      {incident.riskScore === null ? "No score" : `Risk ${incident.riskScore}`}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#7890b2]">
                    {displayValue(incident.tag)} · {displayValue(incident.plant)}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-[10px] text-[#8aa0bd]">
                      {incident.id}
                    </span>
                    <StatusBadge status={incident.status} />
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[#edf2fa] pt-3 text-xs text-[#7890b2]">
            <span>
              {incidents.length > 0
                ? `${offset + 1}–${offset + incidents.length}`
                : "0"}{" "}
              records
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void loadIncidents(Math.max(0, offset - PAGE_SIZE))}
                disabled={loading || offset === 0}
                className="rounded-md border border-[#dce7f7] px-2.5 py-1.5 font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => void loadIncidents(offset + PAGE_SIZE)}
                disabled={loading || !hasMore}
                className="rounded-md border border-[#dce7f7] px-2.5 py-1.5 font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <div className="h-[min(60vh,640px)] min-h-[320px] min-w-0 overflow-y-auto overscroll-contain rounded-2xl border border-[#dce7f7] bg-white p-5 shadow-[0_8px_24px_rgba(8,47,128,0.06)] sm:p-6">
          {selectedIncident ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#edf2fa] pb-5">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <StatusBadge status={selectedIncident.status} />
                    {selectedIncident.riskScore !== null && (
                      <span className="rounded-full bg-[#fff5e6] px-2.5 py-1 text-xs font-bold text-[#a76111]">
                        Risk score {selectedIncident.riskScore}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-[#1257c7]">
                    {displayValue(selectedIncident.tag)} · {displayValue(selectedIncident.plant)}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-[#082f80]">
                    {selectedIncident.title}
                  </h3>
                  <p className="mt-1 font-mono text-xs text-[#7890b2]">
                    {selectedIncident.id}
                    {selectedIncident.mtoNumber ? ` · MTO ${selectedIncident.mtoNumber}` : ""}
                    {selectedIncident.arNumber ? ` · AR ${selectedIncident.arNumber}` : ""}
                  </p>
                </div>
                <div className="rounded-xl bg-[#f5f8fe] px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#7890b2]">
                    Occurred
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#173e82]">
                    <CalendarClock className="h-4 w-4 text-[#5c8ce8]" />
                    {formatDate(selectedIncident.occurredAt)}
                  </p>
                </div>
              </div>

              <section className="grid gap-3 py-5 sm:grid-cols-2 lg:grid-cols-4">
                <Detail label="Discipline" value={selectedIncident.discipline} icon={<Factory className="h-4 w-4" />} />
                <Detail label="Equipment type" value={selectedIncident.equipmentType} />
                <Detail label="RCA owner" value={selectedIncident.pic} />
                <Detail label="RCA due" value={formatDate(selectedIncident.rcaDueDate)} />
                <Detail label="Component" value={selectedIncident.component} />
                <Detail label="Failure mechanism" value={selectedIncident.mechanism} />
                <Detail label="Downtime" value={selectedIncident.downtimeHours === null ? "—" : `${formatNumber(selectedIncident.downtimeHours)} h`} />
                <Detail label="Highest impact" value={selectedIncident.impact} />
              </section>

              <section className="grid gap-3 border-t border-[#edf2fa] pt-5 sm:grid-cols-3">
                <LossCard label="Actual loss" value={selectedIncident.actualLoss} />
                <LossCard
                  label="Potential loss"
                  value={
                    selectedIncident.potentialLoss === null
                      ? "—"
                      : `${formatNumber(selectedIncident.potentialLoss)} k US$`
                  }
                />
                <LossCard label="Total loss" value={selectedIncident.totalLoss} />
              </section>

              <section className="mt-5 rounded-xl border border-[#e7edf7] bg-[#f8faff] p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-[#7890b2]">
                  {isClosedStatus(selectedIncident.status) ? (
                    <CheckCircle2 className="h-4 w-4 text-[#21845b]" />
                  ) : (
                    <Filter className="h-4 w-4 text-[#1257c7]" />
                  )}
                  Pre-risk assessment
                </div>
                <p className="mt-2 text-sm leading-6 text-[#45648d]">
                  {displayValue(selectedIncident.preRisk)}
                </p>
              </section>
            </>
          ) : (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center text-center">
              <div className="rounded-2xl bg-[#eef4ff] p-3 text-[#1257c7]">
                <Database className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-[#173e82]">
                {loading ? "Loading incident records" : "No incident selected"}
              </h3>
              <p className="mt-1 max-w-sm text-sm text-[#7890b2]">
                {error
                  ? "Check the incident table access and try refreshing."
                  : "Select a risk case from the list to view its RCA and impact details."}
              </p>
            </div>
          )}
        </div>
      </section>
      <p className="text-xs text-[#8aa0bd]">
        Showing {incidents.length} database records on this page
        {hasMore ? " · more records available" : ""}.
      </p>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[#dce7f7] bg-white p-4 shadow-[0_8px_24px_rgba(8,47,128,0.04)]">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#7890b2]">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold text-[#082f80]">{value}</p>
    </div>
  );
}

function Detail({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-[#f8faff] p-3">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[#7890b2]">
        {icon}
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-medium text-[#173e82]">
        {displayValue(value)}
      </p>
    </div>
  );
}

function LossCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#edf2fa] p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[#7890b2]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[#173e82]">
        {displayValue(value)}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const closed = isClosedStatus(status);
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
        closed
          ? "bg-[#e8f8f1] text-[#21845b]"
          : "bg-[#fff5e6] text-[#a76111]"
      }`}
    >
      {status}
    </span>
  );
}
