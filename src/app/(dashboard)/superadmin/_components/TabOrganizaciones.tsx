"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, Building2, CheckCircle, Ban, AlertTriangle, Eye } from "lucide-react";

export function TabOrganizaciones() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const utils = trpc.useUtils();
  const { data: tenants, isLoading } = trpc.superadmin.listTenants.useQuery({ search });
  const { data: plans } = trpc.superadmin.listPlans.useQuery();

  const createTenant = trpc.superadmin.createTenant.useMutation({
    onSuccess: () => {
      toast.success("Organización creada exitosamente");
      setIsDialogOpen(false);
      utils.superadmin.listTenants.invalidate();
    },
    onError: (err) => toast.error(err.message || "Error al crear organización"),
  });

  const updateStatus = trpc.superadmin.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Estado actualizado");
      utils.superadmin.listTenants.invalidate();
    },
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createTenant.mutate({
      name: formData.get("name") as string,
      slug: formData.get("slug") as string,
      ownerName: formData.get("ownerName") as string,
      ownerEmail: formData.get("ownerEmail") as string,
      ownerPassword: formData.get("ownerPassword") as string,
      planName: formData.get("planName") as string,
    });
  };

  const handleImpersonate = (tenantId: string) => {
    document.cookie = `serviflow_impersonate=${tenantId}; path=/; max-age=3600`;
    window.location.reload();
  };

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5 text-purple-600" />
            Organizaciones
          </CardTitle>
          <CardDescription>Gestión de tenants y cambio de estados.</CardDescription>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar organización…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Crear Organización</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Crear Nueva Organización</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="name">Nombre</Label>
                    <Input id="name" name="name" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="slug">Slug (opcional)</Label>
                    <Input id="slug" name="slug" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="ownerName">Nombre Dueño</Label>
                    <Input id="ownerName" name="ownerName" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="ownerEmail">Email Dueño</Label>
                    <Input id="ownerEmail" name="ownerEmail" type="email" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="ownerPassword">Contraseña</Label>
                    <Input id="ownerPassword" name="ownerPassword" type="password" required />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="planName">Plan</Label>
                    <Select name="planName" defaultValue="free">
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar plan" />
                      </SelectTrigger>
                      <SelectContent>
                        {plans?.map((plan) => (
                          <SelectItem key={plan.id} value={plan.name}>{plan.displayName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" disabled={createTenant.isPending} className="w-full">
                  {createTenant.isPending ? "Creando..." : "Crear Organización"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 border-y border-border text-muted-foreground uppercase font-semibold">
              <tr>
                <th className="p-3">Organización</th>
                <th className="p-3">Slug</th>
                <th className="p-3 text-center">Usuarios</th>
                <th className="p-3 text-center">Visitas</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && <tr><td colSpan={6} className="p-6 text-center">Cargando...</td></tr>}
              {tenants?.items?.length === 0 && <tr><td colSpan={6} className="p-6 text-center">No se encontraron organizaciones.</td></tr>}
              {tenants?.items?.map((tenant: any) => (
                <tr key={tenant.id} className="hover:bg-muted/30">
                  <td className="p-3 font-bold">{tenant.name}</td>
                  <td className="p-3 font-mono text-muted-foreground">{tenant.slug}</td>
                  <td className="p-3 text-center">{tenant._count.users}</td>
                  <td className="p-3 text-center">{tenant._count.visits}</td>
                  <td className="p-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                        tenant.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                        tenant.status === 'SUSPENDED' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {tenant.status}
                    </span>
                  </td>
                  <td className="p-3 text-right space-x-1 flex justify-end gap-2 items-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" title="Impersonar" onClick={() => handleImpersonate(tenant.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    {tenant.status !== 'ACTIVE' ? (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-700" onClick={() => updateStatus.mutate({ tenantId: tenant.id, status: 'ACTIVE' })}>
                        Activar
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700" onClick={() => updateStatus.mutate({ tenantId: tenant.id, status: 'SUSPENDED' })}>
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
  );
}
