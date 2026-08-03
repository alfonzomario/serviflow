'use client';

import { useState } from 'react';
import { ShieldCheck, Building2, Users, Calendar, Search, CheckCircle, Ban, AlertTriangle } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function SuperAdminPage() {
  const [search, setSearch] = useState('');
  const utils = trpc.useUtils();

  const { data: stats } = trpc.superadmin.getStats.useQuery();
  const { data: tenants, isLoading } = trpc.superadmin.listTenants.useQuery({ search });

  const updateStatus = trpc.superadmin.updateStatus.useMutation({
    onSuccess: () => {
      toast.success('Estado de la organización actualizado');
      utils.superadmin.listTenants.invalidate();
      utils.superadmin.getStats.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || 'No se pudo actualizar el estado');
    },
  });

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
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 hover:border-[hsl(var(--primary)/0.3)] transition-all">
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

      {/* Tenants Table */}
      <Card className="border border-border shadow-sm">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-purple-600" />
              Organizaciones Registradas
            </CardTitle>
            <CardDescription>Gestión de tenants y cambio de estados de suscripción.</CardDescription>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar organización…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/50 border-y border-border text-muted-foreground uppercase font-semibold">
                <tr>
                  <th className="p-3">Organización</th>
                  <th className="p-3">Slug</th>
                  <th className="p-3">Rubro</th>
                  <th className="p-3 text-center">Usuarios</th>
                  <th className="p-3 text-center">Clientes</th>
                  <th className="p-3 text-center">Visitas</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      Cargando organizaciones…
                    </td>
                  </tr>
                )}

                {tenants?.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      No se encontraron organizaciones.
                    </td>
                  </tr>
                )}

                {tenants?.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-bold text-foreground">{tenant.name}</td>
                    <td className="p-3 text-muted-foreground font-mono">{tenant.slug}</td>
                    <td className="p-3 capitalize">{tenant.industry || 'Personalizado'}</td>
                    <td className="p-3 text-center font-medium">{tenant._count.users}</td>
                    <td className="p-3 text-center font-medium">{tenant._count.clients}</td>
                    <td className="p-3 text-center font-medium">{tenant._count.visits}</td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                          tenant.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : tenant.status === 'SUSPENDED'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {tenant.status === 'ACTIVE' && <CheckCircle className="h-3 w-3" />}
                        {tenant.status === 'SUSPENDED' && <AlertTriangle className="h-3 w-3" />}
                        {tenant.status === 'CANCELLED' && <Ban className="h-3 w-3" />}
                        {tenant.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-1">
                      {tenant.status !== 'ACTIVE' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus.mutate({ tenantId: tenant.id, status: 'ACTIVE' })}
                          className="h-7 px-2 text-[11px] text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                        >
                          Activar
                        </Button>
                      )}
                      {tenant.status === 'ACTIVE' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => updateStatus.mutate({ tenantId: tenant.id, status: 'SUSPENDED' })}
                          className="h-7 px-2 text-[11px] text-amber-700 border-amber-300 hover:bg-amber-50"
                        >
                          Suspender
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
