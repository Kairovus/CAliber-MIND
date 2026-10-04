"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import type { Section } from "@/app/page";
import {
  LayoutDashboard,
  AlertTriangle,
  Bell,
  Factory,
  Lightbulb,
  Search,
  Zap,
  Settings,
  CircleHelp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface AppSidebarProps {
  activeSection: Section;
  onSectionChange: (section: Section) => void;
}

type BadgeCounts = {
  alerts: number | null;
  insights: number | null;
};

interface NavItem {
  id: Section;
  label: string;
  icon: LucideIcon;
  badge?: number;
  badgeColor?: "red" | "yellow" | "green" | "blue";
}

const mainMenu: NavItem[] = [
  { id: "overview", label: "Dashboard", icon: LayoutDashboard },
  { id: "equipment", label: "Equipment", icon: Factory },
  { id: "alerts", label: "Alerts", badgeColor: "red", icon: Bell },
  { id: "insights", label: "Insights", badgeColor: "blue", icon: Lightbulb },
  { id: "incidents", label: "Incidents", icon: AlertTriangle, badgeColor: "red" },
];

export function AppSidebar({ activeSection, onSectionChange }: AppSidebarProps) {
  const [badgeCounts, setBadgeCounts] = useState<BadgeCounts>({
    alerts: null,
    insights: null,
  });

  const refreshBadges = useCallback(async () => {
    const [alertsResult, insightsResult] = await Promise.allSettled([
      fetch("/api/alerts", { cache: "no-store" }),
      fetch("/api/insights/root-cause", { cache: "no-store" }),
    ]);

    const parseCount = async (
      result: PromiseSettledResult<Response>,
      key: "count" | "total"
    ): Promise<number | null> => {
      if (result.status !== "fulfilled" || !result.value.ok) return null;
      try {
        const payload: unknown = await result.value.json();
        if (typeof payload !== "object" || payload === null) return null;
        const value =
          key === "count" && "count" in payload
            ? payload.count
            : key === "total" && "total" in payload
              ? payload.total
              : null;
        return typeof value === "number" &&
          Number.isSafeInteger(value) &&
          value >= 0
          ? value
          : null;
      } catch (error) {
        console.error("Could not read navigation badge count.", error);
      }
      return null;
    };

    const [alerts, insights] = await Promise.all([
      parseCount(alertsResult, "count"),
      parseCount(insightsResult, "total"),
    ]);

    setBadgeCounts((current) => ({
      alerts: alerts ?? current.alerts,
      insights: insights ?? current.insights,
    }));
  }, []);

  useEffect(() => {
    void refreshBadges();
    const interval = window.setInterval(() => void refreshBadges(), 60_000);
    window.addEventListener("alerts:updated", refreshBadges);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("alerts:updated", refreshBadges);
    };
  }, [refreshBadges]);

  const navItems = mainMenu.map((item) => ({
    ...item,
    badge:
      item.id === "alerts"
        ? badgeCounts.alerts ?? undefined
        : item.id === "insights"
          ? badgeCounts.insights ?? undefined
          : item.badge,
  }));

  return (
    <aside className="w-[218px] h-screen bg-[#082f80] border-r border-[#17499b] flex flex-col shrink-0">
      {/* Logo */}
      <div className="h-20 px-5 flex items-center gap-3 border-b border-white/10">
        <div className="w-9 h-9 rounded-xl bg-[#1257c7] flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="font-semibold text-white text-[15px] tracking-tight">
          MIND
        </span>
        <span className="ml-auto px-2 py-0.5 text-[10px] font-medium bg-[#d9f8ff]/15 text-[#b5efff] rounded-full">
          Live
        </span>
      </div>

      {/* Search */}
      <div className="px-4 py-4">
        <button
          type="button"
          className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 transition-colors"
        >
          <Search className="w-4 h-4 text-blue-100/70" />
          <span className="text-sm text-blue-100/70 flex-1 text-left">Search incidents...</span>
          <kbd className="text-[11px] text-blue-100/70 bg-background px-1.5 py-0.5 rounded-md border border-border font-mono">
            /
          </kbd>
        </button>
      </div>

      {/* Main Menu */}
      <div className="px-4 flex-1">
        <p className="px-2 mb-2 text-[11px] font-medium text-blue-100/70 uppercase tracking-wider">
          Production line
        </p>
        <nav className="space-y-0.5">
          {navItems.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              isActive={activeSection === item.id}
              onClick={() => onSectionChange(item.id)}
            />
          ))}
        </nav>
      </div>

      {/* System utilities and user profile */}
      <div className="px-4 py-4 border-t border-white/10 space-y-1">
        <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-blue-100/80 transition-colors hover:bg-white/10 hover:text-white"><Settings className="h-[18px] w-[18px]" /><span>Settings</span></button>
        <button type="button" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-blue-100/80 transition-colors hover:bg-white/10 hover:text-white"><CircleHelp className="h-[18px] w-[18px]" /><span>Support</span></button>
        <div className="mt-2 flex items-center gap-3 px-2 py-3 rounded-xl hover:bg-white/10 transition-colors cursor-pointer">
          <div className="w-9 h-9 rounded-full bg-[#1257c7] flex items-center justify-center">
            <span className="text-white text-sm font-medium">JD</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">John Doe</p>
            <p className="text-xs text-blue-100/70 truncate">SRE Lead</p>
          </div>
          <button
            type="button"
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            aria-label="Toggle theme"
          >
            <span className="w-2 h-2 rounded-full bg-success" aria-label="Online" />
          </button>
        </div>
      </div>
    </aside>
  );
}

interface NavButtonProps {
  item: NavItem;
  isActive: boolean;
  onClick: () => void;
}

function NavButton({ item, isActive, onClick }: NavButtonProps) {
  const Icon = item.icon;

  const badgeColorClass = {
    red: "bg-destructive/15 text-destructive",
    yellow: "bg-warning/20 text-warning",
    green: "bg-success/15 text-success",
    blue: "bg-[#dbeafe] text-[#082f80]",
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "bg-[#1257c7] text-white font-medium shadow-sm"
          : "text-blue-100/80 hover:bg-white/10 hover:text-white"
      )}
    >
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span className="flex-1 text-left">{item.label}</span>
      {item.badge !== undefined && item.badge !== null && item.badge > 0 && (
        <span
          className={cn(
            "text-xs font-medium px-2 py-0.5 rounded-full",
            isActive
              ? "bg-primary-foreground/20 text-primary-foreground"
              : item.badgeColor
                ? badgeColorClass[item.badgeColor]
                : "bg-muted text-blue-100/70"
          )}
        >
          {item.badge}
        </span>
      )}
    </button>
  );
}
