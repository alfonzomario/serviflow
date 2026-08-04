"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Package } from "lucide-react";

export function TabPlanes() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const utils = trpc.useUtils();
  const { data: plans, isLoading } = trpc.superadmin.listPlans.useQuery();

  const upsertPlan = trpc.superadmin.upsertPlan.useMutation({
    onSuccess: () => {
      toast.success("Plan guardado exitosamente");
      setIsDialogOpen(false);
      setEditingPlan(null);
      utils.superadmin.listPlans.invalidate();
    },
    onError: (err) => toast.error(err.message || "Error al guardar plan"),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    upsertPlan.mutate({
      name: formData.get("name") as string,
      displayName: formData.get("displayName") as string,
      monthlyPriceUsd: Number(formData.get("monthlyPriceUsd")),
      annualPriceUsd: Number(formData.get("annualPriceUsd") || 0),
      maxUsers: Number(formData.get("maxUsers")) || undefined,
      maxClients: Number(formData.get("maxClients")) || undefined,
      maxVisitsMonth: Number(formData.get("maxVisitsMonth")) || undefined,
      isActive: formData.get("isActive") === "on",
      sortOrder: Number(formData.get("sortOrder") || 0),
    });
  };

  const openEdit = (plan: any) => {
    setEditingPlan(plan);
    setIsDialogOpen(true);
  };

  const openCreate = () => {
    setEditingPlan(null);
    setIsDialogOpen(true);
  };

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-purple-600" />
            Planes de Suscripción
          </CardTitle>
          <CardDescription>Configuración de los planes disponibles para organizaciones.</CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingPlan(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={openCreate}>Crear Plan</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingPlan ? "Editar Plan" : "Crear Nuevo Plan"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Identificador (name)</Label>
                  <Input name="name" defaultValue={editingPlan?.name} readOnly={!!editingPlan} required />
                </div>
                <div className="space-y-1">
                  <Label>Nombre a mostrar</Label>
                  <Input name="displayName" defaultValue={editingPlan?.displayName} required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Precio Mensual (USD)</Label>
                  <Input type="number" step="0.01" name="monthlyPriceUsd" defaultValue={editingPlan?.monthlyPriceUsd ?? 0} required />
                </div>
                <div className="space-y-1">
                  <Label>Precio Anual (USD)</Label>
                  <Input type="number" step="0.01" name="annualPriceUsd" defaultValue={editingPlan?.annualPriceUsd ?? 0} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label>Max Usuarios</Label>
                  <Input type="number" name="maxUsers" defaultValue={editingPlan?.maxUsers} />
                </div>
                <div className="space-y-1">
                  <Label>Max Clientes</Label>
                  <Input type="number" name="maxClients" defaultValue={editingPlan?.maxClients} />
                </div>
                <div className="space-y-1">
                  <Label>Max Visitas/mes</Label>
                  <Input type="number" name="maxVisitsMonth" defaultValue={editingPlan?.maxVisitsMonth} />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="isActive" name="isActive" defaultChecked={editingPlan?.isActive ?? true} className="h-4 w-4" />
                  <Label htmlFor="isActive">Activo</Label>
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <Label className="whitespace-nowrap">Orden</Label>
                  <Input type="number" name="sortOrder" defaultValue={editingPlan?.sortOrder ?? 0} className="w-full" />
                </div>
              </div>
              <Button type="submit" disabled={upsertPlan.isPending} className="w-full">
                {upsertPlan.isPending ? "Guardando..." : "Guardar Plan"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 border-y border-border text-muted-foreground uppercase font-semibold">
              <tr>
                <th className="p-3">Plan</th>
                <th className="p-3 text-center">Mensual</th>
                <th className="p-3 text-center">Usuarios</th>
                <th className="p-3 text-center">Visitas</th>
                <th className="p-3 text-center">Activo</th>
                <th className="p-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && <tr><td colSpan={6} className="p-6 text-center">Cargando...</td></tr>}
              {plans?.map((plan: any) => (
                <tr key={plan.id} className="hover:bg-muted/30">
                  <td className="p-3">
                    <div className="font-bold">{plan.displayName}</div>
                    <div className="text-muted-foreground font-mono">{plan.name}</div>
                  </td>
                  <td className="p-3 text-center">${Number(plan.monthlyPriceUsd).toFixed(2)}</td>
                  <td className="p-3 text-center">{plan.maxUsers || 'Ilimitado'}</td>
                  <td className="p-3 text-center">{plan.maxVisitsMonth || 'Ilimitado'}</td>
                  <td className="p-3 text-center">{plan.isActive ? 'Sí' : 'No'}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openEdit(plan)}>
                      Editar
                    </Button>
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
