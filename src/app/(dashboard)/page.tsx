"use client"

import { KPICard } from "@/components/dashboard/KPICard"
import { DollarSign, Clock, CheckCircle2, Users } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { StatusBadge, VisitStatus } from "@/components/shared/StatusBadge"

export default function DashboardPage() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
        <p className="text-muted-foreground mt-2">
          Welcome back! Here's what's happening with your business today.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KPICard
          title="Revenue this month"
          value="$12,450"
          icon={DollarSign}
          trend={{ value: "12%", direction: "up" }}
          variant="primary"
        />
        <KPICard
          title="Pending Visits"
          value="24"
          icon={Clock}
          trend={{ value: "4%", direction: "down" }}
          variant="warning"
        />
        <KPICard
          title="Completed Visits"
          value="156"
          icon={CheckCircle2}
          trend={{ value: "8%", direction: "up" }}
          variant="success"
        />
        <KPICard
          title="Active Clients"
          value="892"
          icon={Users}
          trend={{ value: "1.2%", direction: "up" }}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        {/* Chart placeholder */}
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
            <CardDescription>Monthly revenue across all services</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-end gap-2 pt-4">
              {/* CSS-only placeholder bars */}
              {[40, 60, 45, 80, 50, 90, 75].map((height, i) => (
                <div key={i} className="w-full bg-primary/20 rounded-t-md relative group hover:bg-primary/30 transition-colors" style={{ height: `${height}%` }}>
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-foreground text-background text-xs px-2 py-1 rounded">
                    ${height * 100}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-4 text-xs text-muted-foreground">
              <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span>
            </div>
          </CardContent>
        </Card>

        {/* Upcoming visits */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Upcoming Visits</CardTitle>
            <CardDescription>Your schedule for the next 48 hours</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {[
                { id: 1, client: "Acme Corp", time: "Today, 10:00 AM", status: VisitStatus.CONFIRMED },
                { id: 2, client: "Stark Industries", time: "Today, 02:00 PM", status: VisitStatus.PENDING_CONFIRM },
                { id: 3, client: "Wayne Enterprises", time: "Tomorrow, 09:00 AM", status: VisitStatus.CONFIRMED },
                { id: 4, client: "LexCorp", time: "Tomorrow, 11:30 AM", status: VisitStatus.CONFIRMED },
              ].map((visit) => (
                <div key={visit.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{visit.client}</p>
                    <p className="text-sm text-muted-foreground">{visit.time}</p>
                  </div>
                  <StatusBadge status={visit.status} size="sm" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
