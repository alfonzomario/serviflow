"use client";

import { ShieldCheck } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { TabOrganizaciones } from "./_components/TabOrganizaciones";
import { TabPlanes } from "./_components/TabPlanes";
import { TabConfigGlobal } from "./_components/TabConfigGlobal";
import { TabAuditoria } from "./_components/TabAuditoria";

export default function SuperAdminPage() {
  const { data: stats } = trpc.superadmin.getStats.useQuery();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-purple-500/15 border border-purple-500/25 shadow-lg shadow-purple-500/10">
          <ShieldCheck className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Superadmin Plataforma</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Administración global de organizaciones (Tenants), cuentas y estado del sistema ServiFlow.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 hover:border-[hsl(var(--primary)/0.3)] transition-all shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[hsl(var(--muted-foreground)/0.7)] mb-1">Organizaciones</p>
          <p className="text-3xl font-extrabold tracking-tight">{stats?.totalTenants ?? 0}</p>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            {stats?.activeTenants ?? 0} activas en la plataforma.
          </p>
        </div>

        <Card className="bg-card border border-border shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase">Usuarios Totales</CardDescription>
            <CardTitle className="text-2xl font-bold">{stats?.totalUsers ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Dueños, administradores y operadores.
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase">Visitas Procesadas</CardDescription>
            <CardTitle className="text-2xl font-bold">{stats?.totalVisits ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Total histórico de la plataforma.
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-sm">
          <CardHeader className="p-4 pb-2">
            <CardDescription className="text-xs font-semibold uppercase">Estado Sistema</CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600">100% Ok</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs text-muted-foreground">
            Servidores y base de datos activos.
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="organizaciones" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="organizaciones">Organizaciones</TabsTrigger>
          <TabsTrigger value="planes">Planes</TabsTrigger>
          <TabsTrigger value="config">Config Global</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
        </TabsList>

        <TabsContent value="organizaciones">
          <TabOrganizaciones />
        </TabsContent>
        
        <TabsContent value="planes">
          <TabPlanes />
        </TabsContent>
        
        <TabsContent value="config">
          <TabConfigGlobal />
        </TabsContent>
        
        <TabsContent value="auditoria">
          <TabAuditoria />
        </TabsContent>
      </Tabs>
    </div>
  );
}
