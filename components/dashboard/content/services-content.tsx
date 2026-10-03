"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Gauge,
  MessageSquare,
  Send,
  Settings2,
  Thermometer,
  Waves,
  Zap,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const machines = [
  { id: "BL-5702", name: "Product Blower", table: "production-rca5-bl-5702", columnPrefix: "BL5702" },
  { id: "HE-3301", name: "Feed/Effluent Heat Exchanger", table: "production-rca4-he-3301", columnPrefix: "HE3301" },
  { id: "PM-4405B", name: "Cooling Water Pump", table: "production-rca3-pm-4405b", columnPrefix: "PM4405B" },
  { id: "KO-3201", name: "Cracked Gas Compressor", table: "production-rca2-ko-3201", columnPrefix: "KO3201" },
  { id: "PU-2101B", name: "Feed Charge Pump", table: "production-rca1-pu-2101b", columnPrefix: "PU2101B" },
];

const signals = [
  { title: "Feed rate", unit: "T/H", suffix: "FEED", icon: Waves, color: "#1257c7" },
  { title: "Discharge pressure", unit: "BAR", suffix: "DISP", icon: Gauge, color: "#09a7d5" },
  { title: "Vibration", unit: "MM/S", suffix: "VIB", icon: Activity, color: "#5c8ce8" },
  { title: "Bearing / process temp", unit: "DEG C", suffix: "TEMP", icon: Thermometer, color: "#e8a235" },
  { title: "Motor ampere", unit: "A", suffix: "AMP", icon: Zap, color: "#1257c7" },
  { title: "Plant production rate", unit: "T/H", suffix: "PLANT_RATE", icon: Activity, color: "#0b8fc2" },
];

type ProductionRecord = {
  Timestamp: string;
  RUN_STATUS?: string | null;
  [column: string]: string | number | null | undefined;
};

type ProductionState = {
  machineId: string;
  loading: boolean;
  records: ProductionRecord[];
  error: string | null;
};

type MachineAlert = {
  mesin: string;
  penyebab?: string | null;
  recommended_action?: string | null;
  time_stamp?: string | null;
};

type AlertsState = {
  machineId: string;
  loading: boolean;
  alerts: MachineAlert[];
  error: string | null;
};

function isProductionRecord(value: unknown): value is ProductionRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    "Timestamp" in value &&
    typeof value.Timestamp === "string"
  );
}

function isMachineAlert(value: unknown): value is MachineAlert {
  return (
    typeof value === "object" &&
    value !== null &&
    "mesin" in value &&
    typeof value.mesin === "string"
  );
}

function numericValue(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatReading(value: number | null): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const prompts = ["Is vibration within the normal range?", "What should I inspect next?", "Summarize this machine's health"];

const greeting = "I’m monitoring the equipment. Ask me about its signals, alerts, or recommended operator checks.";

export function ServicesContent() {
  const [selectedMachine, setSelectedMachine] = useState(machines[0]);
  const [productionState, setProductionState] = useState<ProductionState>({
    machineId: machines[0].id,
    loading: true,
    records: [],
    error: null,
  });
  const [alertsState, setAlertsState] = useState<AlertsState>({
    machineId: machines[0].id,
    loading: true,
    alerts: [],
    error: null,
  });
  const [message, setMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  const machineContext = useMemo(() => `${selectedMachine.name} ${selectedMachine.id}`, [selectedMachine]);
  const currentProduction =
    productionState.machineId === selectedMachine.id ? productionState : null;
  const productionRecords = currentProduction?.records ?? [];
  const productionLoading = currentProduction?.loading ?? true;
  const productionError = currentProduction?.error ?? null;
  const latestRecord = productionRecords.at(-1);
  const currentAlerts =
    alertsState.machineId === selectedMachine.id ? alertsState : null;
  const relatedAlerts = currentAlerts?.alerts ?? [];
  const alertsLoading = currentAlerts?.loading ?? true;
  const alertsError = currentAlerts?.error ?? null;
  const runStatus =
    typeof latestRecord?.RUN_STATUS === "string"
      ? latestRecord.RUN_STATUS
      : productionLoading
        ? "Loading status…"
        : productionError
          ? "Status unavailable"
          : "No status data";

  useEffect(() => {
    const controller = new AbortController();
    setProductionState({
      machineId: selectedMachine.id,
      loading: true,
      records: [],
      error: null,
    });

    async function loadProductionData() {
      try {
        const response = await fetch(
          `/api/tables/${selectedMachine.table}?limit=500`,
          { cache: "no-store", signal: controller.signal }
        );
        const payload: unknown = await response.json();

        if (!response.ok) {
          const errorMessage =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "Gagal mengambil data produksi.";
          throw new Error(errorMessage);
        }

        const rows =
          typeof payload === "object" &&
          payload !== null &&
          "data" in payload &&
          Array.isArray(payload.data)
            ? payload.data.filter(isProductionRecord)
            : [];
        rows.sort(
          (left, right) =>
            new Date(left.Timestamp).getTime() -
            new Date(right.Timestamp).getTime()
        );
        setProductionState({
          machineId: selectedMachine.id,
          loading: false,
          records: rows,
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setProductionState({
          machineId: selectedMachine.id,
          loading: false,
          records: [],
          error:
            error instanceof Error
              ? error.message
              : "Terjadi kesalahan saat mengambil data produksi.",
        });
      }
    }

    void loadProductionData();
    return () => controller.abort();
  }, [selectedMachine]);

  useEffect(() => {
    const controller = new AbortController();
    setAlertsState({
      machineId: selectedMachine.id,
      loading: true,
      alerts: [],
      error: null,
    });

    async function loadAlerts() {
      try {
        const response = await fetch("/api/tables/alerts?limit=30", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload: unknown = await response.json();

        if (!response.ok) {
          const errorMessage =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "string"
              ? payload.error
              : "Gagal mengambil data alert.";
          throw new Error(errorMessage);
        }

        const rows =
          typeof payload === "object" &&
          payload !== null &&
          "data" in payload &&
          Array.isArray(payload.data)
            ? payload.data.filter(isMachineAlert)
            : [];
        const normalizedId = selectedMachine.id.toLocaleLowerCase();
        const normalizedName = selectedMachine.name.toLocaleLowerCase();
        const matchingAlerts = rows.filter((alert) => {
          const machineName = alert.mesin.trim().toLocaleLowerCase();
          return (
            machineName.includes(normalizedId) ||
            machineName.includes(normalizedName)
          );
        });

        setAlertsState({
          machineId: selectedMachine.id,
          loading: false,
          alerts: matchingAlerts,
          error: null,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setAlertsState({
          machineId: selectedMachine.id,
          loading: false,
          alerts: [],
          error:
            error instanceof Error
              ? error.message
              : "Terjadi kesalahan saat mengambil data alert.",
        });
      }
    }

    void loadAlerts();
    return () => controller.abort();
  }, [selectedMachine]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    sendMessage(
      { text: trimmed },
      { body: { machineId: selectedMachine.id, machineName: selectedMachine.name } }
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    send(message);
    setMessage("");
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3"><h2 className="text-2xl font-semibold tracking-tight text-[#082f80]">{selectedMachine.name}</h2><span className="text-sm font-mono text-[#7890b2]">{selectedMachine.id}</span></div>
          <div className="mt-2 flex items-center gap-2 text-sm text-[#0b8fc2]"><Activity className="h-4 w-4" />{runStatus}<span className="text-[#7890b2]">· {latestRecord ? `Last reading ${formatTimestamp(latestRecord.Timestamp)}` : "Production data"}</span></div>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-xl border border-[#dce7f7] bg-white px-3 py-2 text-sm font-medium text-[#173e82] shadow-sm"><Settings2 className="h-4 w-4" />Equipment settings</button>
      </section>

      <section aria-label="Equipment navigation" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {machines.map((machine) => <button key={machine.id} type="button" onClick={() => setSelectedMachine(machine)} className={`min-h-[72px] rounded-xl border px-4 py-3 text-left transition ${machine.id === selectedMachine.id ? "border-[#1257c7] bg-[#eef4ff] shadow-[0_6px_18px_rgba(18,87,199,0.12)]" : "border-[#dce7f7] bg-white hover:border-[#91b1ed]"}`}><div className="flex items-start justify-between gap-2"><span className="text-xs font-mono text-[#7890b2]">{machine.id}</span><span className="h-2.5 w-2.5 rounded-full bg-[#91b1ed]" /></div><p className="mt-2 line-clamp-2 text-sm font-semibold text-[#173e82]">{machine.name}</p></button>)}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section
            aria-live="polite"
            className={`flex items-center gap-3 rounded-2xl border px-5 py-4 ${
              alertsError
                ? "border-red-200 bg-red-50"
                : alertsLoading || relatedAlerts.length > 0
                  ? "border-[#f2d7a5] bg-[#fffaf0]"
                  : "border-[#bce8ce] bg-[#effaf3]"
            }`}
          >
            {alertsError ? (
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
            ) : alertsLoading || relatedAlerts.length > 0 ? (
              <AlertTriangle className="h-5 w-5 shrink-0 text-[#d99018]" />
            ) : (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-[#25824b]" />
            )}
            <div>
              <p
                className={`text-sm font-semibold ${
                  alertsError
                    ? "text-red-700"
                    : alertsLoading || relatedAlerts.length > 0
                      ? "text-[#7d5818]"
                      : "text-[#17683a]"
                }`}
              >
                {alertsLoading
                  ? `Checking alerts for ${selectedMachine.name}…`
                  : alertsError
                    ? `Unable to load alerts for ${selectedMachine.name}`
                    : relatedAlerts.length === 0
                      ? `No alert related to ${selectedMachine.name}`
                      : `${relatedAlerts.length} alert${relatedAlerts.length === 1 ? "" : "s"} related to ${selectedMachine.name}`}
              </p>
              <p
                className={`mt-0.5 text-xs ${
                  alertsError
                    ? "text-red-600"
                    : alertsLoading || relatedAlerts.length > 0
                      ? "text-[#9a7430]"
                      : "text-[#43825c]"
                }`}
              >
                {alertsError
                  ? alertsError
                  : alertsLoading
                    ? "Loading alert records…"
                    : relatedAlerts.length > 0
                      ? relatedAlerts[0].penyebab ||
                        relatedAlerts[0].recommended_action ||
                        "Review this machine's alert records."
                      : "No active alert records found in the alerts table."}
              </p>
            </div>
            {!alertsLoading && !alertsError && relatedAlerts.length > 0 && (
              <ChevronRight className="ml-auto h-4 w-4 text-[#b9852d]" />
            )}
          </section>

          {productionError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              Tidak bisa memuat data produksi {selectedMachine.id}: {productionError}
            </div>
          )}
          <section aria-label={`Production signals for ${selectedMachine.id}`} className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {signals.map((signal) => {
              const Icon = signal.icon;
              const column =
                signal.suffix === "PLANT_RATE"
                  ? signal.suffix
                  : `${selectedMachine.columnPrefix}_${signal.suffix}`;
              const latestValue = numericValue(latestRecord?.[column]);
              const chartData = productionRecords
                .map((record) => ({
                  time: formatTimestamp(record.Timestamp),
                  value: numericValue(record[column]),
                }))
                .filter((point) => point.value !== null);

              return (
                <article
                  key={`${selectedMachine.id}-${signal.suffix}`}
                  className="rounded-2xl border border-[#dce7f7] bg-white p-4 shadow-[0_8px_24px_rgba(8,47,128,0.06)]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-[#eef4ff] p-2" style={{ color: signal.color }}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-[#173e82]">{signal.title}</h3>
                        <p className="text-[10px] font-mono text-[#8aa0bd]">{column}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[#7890b2]">
                      {signal.unit}
                    </span>
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold text-[#082f80]">
                      {productionLoading ? "…" : formatReading(latestValue)}
                    </span>
                    <span className="text-xs text-[#7890b2]">
                      {latestRecord ? formatTimestamp(latestRecord.Timestamp) : "latest"}
                    </span>
                  </div>
                  <div className="mt-3 h-20">
                    {chartData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                          <CartesianGrid stroke="#edf2fa" vertical={false} />
                          <XAxis dataKey="time" hide />
                          <YAxis domain={["auto", "auto"]} hide />
                          <Tooltip
                            contentStyle={{
                              border: "1px solid #dce7f7",
                              borderRadius: 10,
                              fontSize: 11,
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            name={signal.title}
                            stroke={signal.color}
                            strokeWidth={2.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center rounded-lg bg-[#f8faff] text-xs text-[#7890b2]">
                        {productionLoading
                          ? "Memuat data…"
                          : productionError
                            ? "Data tidak tersedia"
                            : "Belum ada data untuk sinyal ini"}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-[#8aa0bd]">
                    <span>{chartData.length} readings</span>
                    <span>{selectedMachine.id}</span>
                  </div>
                </article>
              );
            })}
          </section>
        </div>

        <aside className="flex min-h-[560px] flex-col rounded-2xl border border-[#dce7f7] bg-white shadow-[0_8px_24px_rgba(8,47,128,0.06)]">
          <div className="flex items-center gap-3 border-b border-[#edf2fa] p-5">
            <div className="rounded-xl bg-[#1257c7] p-2.5 text-white"><Bot className="h-5 w-5" /></div>
            <div>
              <h2 className="font-semibold text-[#082f80]">Equipment AI</h2>
              <p className="text-xs text-[#7890b2]">Context: {machineContext}</p>
            </div>
            {isLoading && (
              <div className="ml-auto flex items-center gap-1.5 text-[10px] text-[#1257c7]">
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-[#1257c7]" style={{ animationDelay: '0ms' }} />
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-[#1257c7]" style={{ animationDelay: '150ms' }} />
                <span className="inline-block h-2 w-2 animate-bounce rounded-full bg-[#1257c7]" style={{ animationDelay: '300ms' }} />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                ⚠ AI error: {error.message}. Please try again.
              </div>
            )}
            <div className="max-w-[92%] rounded-xl bg-[#f3f7fd] px-3 py-2.5 text-sm leading-5 whitespace-pre-wrap text-[#31527f]">
              {greeting}
            </div>
            {messages.map((item) => {
              const text = item.parts
                .map((part) => (part.type === "text" ? part.text : ""))
                .join("");
              if (!text) return null;
              return (
                <div
                  key={item.id}
                  className={`max-w-[92%] rounded-xl px-3 py-2.5 text-sm leading-5 whitespace-pre-wrap ${item.role === "user"
                      ? "ml-auto bg-[#1257c7] text-white"
                      : "bg-[#f3f7fd] text-[#31527f]"
                    }`}
                >
                  {text}
                </div>
              );
            })}
            {status === "submitted" && (
              <div className="max-w-[92%] rounded-xl bg-[#f3f7fd] px-3 py-2.5 text-sm text-[#7890b2] italic">
                Thinking...
              </div>
            )}
            <div className="pt-2">
              <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-[#7890b2]">
                <MessageSquare className="h-3 w-3" />Suggested questions
              </p>
              <div className="space-y-2">
                {prompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => send(prompt)}
                    disabled={isLoading}
                    className="w-full rounded-lg border border-[#e3ebf7] px-3 py-2 text-left text-xs text-[#31527f] hover:border-[#91b1ed] hover:bg-[#f8faff] disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-[#edf2fa] p-4">
            <div className="flex items-center gap-2 rounded-xl border border-[#dce7f7] bg-[#f8faff] p-2">
              <input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask about this machine..."
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-[#173e82] outline-none placeholder:text-[#9aadc5]"
                aria-label="Ask Equipment AI"
                disabled={isLoading}
              />
              <button
                type="submit"
                aria-label="Send message"
                disabled={isLoading || !message.trim()}
                className="rounded-lg bg-[#1257c7] p-2 text-white hover:bg-[#0b449e] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </aside>
      </div>
    </div>
  );
}