"use client";

import { useState } from "react";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { MainContent } from "@/components/dashboard/main-content";
export type Section = "overview" | "equipment" | "alerts" | "incidents" | "insights";

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState<Section>("overview");

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left Sidebar */}
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      {/* Main Content */}
      <MainContent activeSection={activeSection} />

    </div>
  );
}
