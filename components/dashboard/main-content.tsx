"use client";

import type { Section } from "@/app/page";
import { OverviewContent } from "./content/overview-content";
import { IncidentsContent } from "./content/incidents-content";
import { PerformanceContent } from "./content/performance-content";
import { ServicesContent } from "./content/services-content";
import { Bell, Calendar, RefreshCw, Plus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MainContentProps {
  activeSection: Section;
}

const sectionConfig: Record<Section, { title: string; subtitle: string }> = {
  overview: {
    title: "Production overview",
    subtitle: "Live line performance and plant readiness",
  },
  equipment: {
    title: "Equipment",
    subtitle: "Machine health across the production floor",
  },
  incidents: {
    title: "Incidents",
    subtitle: "Active production events and response status",
  },
  insights: {
    title: "Insights",
    subtitle: "Trends, throughput, and operational analysis",
  },
};

export function MainContent({ activeSection }: MainContentProps) {
  const config = sectionConfig[activeSection];

  const renderContent = () => {
    switch (activeSection) {
      case "overview":
        return <OverviewContent />;
      case "incidents":
        return <IncidentsContent />;
      case "equipment":
        return <ServicesContent />;
      case "insights":
        return <PerformanceContent />;
      default:
        return <OverviewContent />;
    }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* Header */}
      <header className="h-16 px-8 flex items-center justify-between border-b border-border bg-card shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-foreground tracking-tight">
            {config.title}
          </h1>
          <p className="text-sm text-muted-foreground">{config.subtitle}</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Time Range */}
          <Button variant="outline" size="sm" className="gap-2 bg-transparent">
            <Calendar className="w-4 h-4" />
            <span>Current shift</span>
          </Button>

          {/* Refresh */}
          <Button variant="outline" size="sm" className="gap-2 bg-transparent">
            <RefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </Button>

          {/* Alerts */}
          <button
            type="button"
            className="relative p-2 rounded-xl hover:bg-muted transition-colors"
            aria-label="Alerts"
          >
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full animate-pulse" />
          </button>

          {/* Primary Action */}
          <Button size="sm" className="gap-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground">
            <AlertCircle className="w-4 h-4" />
            <span>Log production event</span>
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div key={activeSection} className="animate-fade-in">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
