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
  { id: "BL-5702", name: "Product Blower", status: "Running", tone: "bg-[#0b8fc2]" },
  { id: "HE-3301", name: "Feed/Effluent Heat Exchanger", status: "Running", tone: "bg-[#0b8fc2]" },
  { id: "PM-4405B", name: "Cooling Water Pump", status: "Attention", tone: "bg-[#e8a235]" },
  { id: "KO-3201", name: "Cracked Gas Compressor", status: "Running", tone: "bg-[#0b8fc2]" },
  { id: "PU-2101B", name: "Feed Charge Pump", status: "Standby", tone: "bg-[#91b1ed]" },
];

const signals = [
  { title: "Feed rate", unit: "T/H", tag: "BL5702F.PV", min: 5, max: 72, value: "8.50", icon: Waves, color: "#1257c7" },
  { title: "Discharge pressure", unit: "BAR", tag: "BL5702P.PV", min: 20, max: 100, value: "61.4", icon: Gauge, color: "#09a7d5" },
  { title: "Vibration", unit: "MM/S", tag: "BL5702V.PV", min: 20, max: 100, value: "42.8", icon: Activity, color: "#5c8ce8" },
  { title: "Bearing / process temp", unit: "DEG C", tag: "BL5702T.PV", min: 150, max: 750, value: "384", icon: Thermometer, color: "#e8a235" },
  { title: "Motor ampere", unit: "A", tag: "BL5702I.PV", min: 300, max: 1500, value: "842", icon: Zap, color: "#1257c7" },
  { title: "OPP production rate", unit: "T/H", tag: "PLTRMT.PV", min: 4, max: 24.7, value: "18.6", icon: Activity, color: "#0b8fc2" },
];

const chartData = [
  { time: "08:00", value: 54 },
  { time: "10:00", value: 58 },
  { time: "12:00", value: 57 },
  { time: "14:00", value: 63 },
  { time: "16:00", value: 61 },
  { time: "18:00", value: 66 },
  { time: "20:00", value: 64 },
];

const prompts = ["Is vibration within the normal range?", "What should I inspect next?", "Summarize this machine's health"];

const greeting = "I’m monitoring the equipment. Ask me about its signals, alerts, or recommended operator checks.";

export function ServicesContent() {
  const [selectedMachine, setSelectedMachine] = useState(machines[0]);
  const [message, setMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const isLoading = status === "submitted" || status === "streaming";

  const machineContext = useMemo(() => `${selectedMachine.name} ${selectedMachine.id}`, [selectedMachine]);

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
          <div className="mt-2 flex items-center gap-2 text-sm text-[#0b8fc2]"><CheckCircle2 className="h-4 w-4" />{selectedMachine.status} <span className="text-[#7890b2]">· Last updated 2 min ago</span></div>
        </div>
        <button type="button" className="flex items-center gap-2 rounded-xl border border-[#dce7f7] bg-white px-3 py-2 text-sm font-medium text-[#173e82] shadow-sm"><Settings2 className="h-4 w-4" />Equipment settings</button>
      </section>

      <section aria-label="Equipment navigation" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {machines.map((machine) => <button key={machine.id} type="button" onClick={() => setSelectedMachine(machine)} className={`min-h-[72px] rounded-xl border px-4 py-3 text-left transition ${machine.id === selectedMachine.id ? "border-[#1257c7] bg-[#eef4ff] shadow-[0_6px_18px_rgba(18,87,199,0.12)]" : "border-[#dce7f7] bg-white hover:border-[#91b1ed]"}`}><div className="flex items-start justify-between gap-2"><span className="text-xs font-mono text-[#7890b2]">{machine.id}</span><span className={`h-2.5 w-2.5 rounded-full ${machine.tone}`} /></div><p className="mt-2 line-clamp-2 text-sm font-semibold text-[#173e82]">{machine.name}</p></button>)}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <section className="flex items-center gap-3 rounded-2xl border border-[#f2d7a5] bg-[#fffaf0] px-5 py-4"><AlertTriangle className="h-5 w-5 shrink-0 text-[#d99018]" /><div><p className="text-sm font-semibold text-[#7d5818]">1 alert related to {selectedMachine.id}</p><p className="mt-0.5 text-xs text-[#9a7430]">Bearing temperature is trending 6% above its shift baseline.</p></div><ChevronRight className="ml-auto h-4 w-4 text-[#b9852d]" /></section>

          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {signals.map((signal, index) => { const Icon = signal.icon; return <article key={signal.tag} className="rounded-2xl border border-[#dce7f7] bg-white p-4 shadow-[0_8px_24px_rgba(8,47,128,0.06)]"><div className="flex items-start justify-between"><div className="flex items-center gap-2"><span className="rounded-lg bg-[#eef4ff] p-2" style={{ color: signal.color }}><Icon className="h-4 w-4" /></span><div><h3 className="text-sm font-semibold text-[#173e82]">{signal.title}</h3><p className="text-[10px] font-mono text-[#8aa0bd]">{signal.tag}</p></div></div><span className="text-[10px] font-semibold uppercase tracking-wide text-[#7890b2]">{signal.unit}</span></div><div className="mt-3 flex items-baseline gap-2"><span className="text-2xl font-semibold text-[#082f80]">{signal.value}</span><span className="text-xs text-[#7890b2]">live</span></div><div className="mt-3 h-20"><ResponsiveContainer width="100%" height="100%"><LineChart data={chartData.map((point, pointIndex) => ({ ...point, value: point.value + ((index * 3 + pointIndex) % 5) - 2 }))}><CartesianGrid stroke="#edf2fa" vertical={false} /><XAxis dataKey="time" hide /><YAxis domain={[signal.min, signal.max]} hide /><Tooltip contentStyle={{ border: "1px solid #dce7f7", borderRadius: 10, fontSize: 11 }} /><Line type="monotone" dataKey="value" stroke={signal.color} strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div><div className="mt-2 flex justify-between text-[10px] text-[#8aa0bd]"><span>Range {signal.min}</span><span>Typical span {signal.max}</span></div></article> })}
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