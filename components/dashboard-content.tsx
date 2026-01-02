"use client"

import { TodayView } from "@/components/today-view"
import { TaskView } from "@/components/task-view"
import { CalendarView } from "@/components/calendar-view"
import { LinkedinView } from "@/components/linkedin-view"
import { CrmView } from "@/components/crm-view"
import { VaultView } from "@/components/vault-view"
import { SettingsView } from "@/components/settings-view"
import { Header } from "@/components/header"
import { FileText } from "lucide-react"

export function DashboardContent({ activeTab }: { activeTab: string }) {
  return (
    <div className="flex flex-col min-h-full w-full">
      <Header />
      <div className="flex-1 p-4 md:p-6 lg:p-8 max-w-[1400px] mx-auto w-full">
        {activeTab === "Home" && <TodayView />}
        {activeTab === "Tasks" && <TaskView />}
        {activeTab === "Calendar" && <CalendarView />}
        {activeTab === "LinkedIn" && <LinkedinView />}
        {activeTab === "Relationships" && <CrmView />}
        {activeTab === "Vault" && <VaultView />}
        {activeTab === "Settings" && <SettingsView />}

        {/* Placeholder for other views */}
        {activeTab !== "Home" &&
          activeTab !== "Tasks" &&
          activeTab !== "Calendar" &&
          activeTab !== "LinkedIn" &&
          activeTab !== "Relationships" &&
          activeTab !== "Vault" &&
          activeTab !== "Settings" && (
            <div className="flex flex-col items-center justify-center h-full text-center py-24">
              <div className="size-20 rounded-full bg-muted flex items-center justify-center mb-6">
                <FileText size={40} className="text-muted-foreground/30" />
              </div>
              <h2 className="text-xl font-bold tracking-tight">{activeTab} View</h2>
              <p className="text-muted-foreground italic max-w-xs mt-2">
                This module is currently in the development pipeline for your command center.
              </p>
            </div>
          )}
      </div>
    </div>
  )
}
