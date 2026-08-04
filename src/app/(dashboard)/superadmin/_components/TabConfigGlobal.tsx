"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";

export function TabConfigGlobal() {
  const { data: config, isLoading } = trpc.superadmin.getPlatformConfig.useQuery();
  const updateConfig = trpc.superadmin.updatePlatformConfig.useMutation({
    onSuccess: () => toast.success("Configuración global actualizada"),
    onError: (err) => toast.error(err.message || "Error al actualizar configuración"),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data: Record<string, any> = {};
    formData.forEach((value, key) => {
      if (value) {
        if (key === "smtpPort") data[key] = Number(value);
        else data[key] = value;
      }
    });
    updateConfig.mutate(data);
  };

  if (isLoading) return <div className="p-4 text-center">Cargando configuración...</div>;

  return (
    <Card className="border border-border shadow-sm max-w-4xl">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Settings className="h-5 w-5 text-purple-600" />
          Configuración Global de la Plataforma
        </CardTitle>
        <CardDescription>Ajustes generales, integraciones y llaves API.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-4">
            <h3 className="font-semibold text-sm border-b pb-2">Modo de Registro</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Registro de Nuevos Tenants</Label>
                <Select name="registrationMode" defaultValue={config?.registrationMode || "open"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Abierto (Cualquiera puede registrarse)</SelectItem>
                    <SelectItem value="invite_only">Solo con Invitación</SelectItem>
                    <SelectItem value="closed">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm border-b pb-2">Configuración SMTP Global</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Servidor SMTP (Host)</Label>
                <Input name="smtpHost" defaultValue={config?.smtpHost || ""} placeholder="smtp.ejemplo.com" />
              </div>
              <div className="space-y-2">
                <Label>Puerto SMTP</Label>
                <Input type="number" name="smtpPort" defaultValue={config?.smtpPort || ""} placeholder="587" />
              </div>
              <div className="space-y-2">
                <Label>Usuario SMTP</Label>
                <Input name="smtpUser" defaultValue={config?.smtpUser || ""} />
              </div>
              <div className="space-y-2">
                <Label>Contraseña SMTP (Actualizar)</Label>
                <Input type="password" name="smtpPassEncrypted" placeholder="Dejar en blanco para no cambiar" />
              </div>
              <div className="space-y-2">
                <Label>Remitente (From)</Label>
                <Input name="smtpFromEmail" defaultValue={config?.smtpFromEmail || ""} placeholder="noreply@serviflow.app" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-sm border-b pb-2">API WhatsApp Global</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>URL de la API (Ej: Evolution API)</Label>
                <Input name="waApiUrl" defaultValue={config?.waApiUrl || ""} placeholder="https://api.whatsapp.example.com" />
              </div>
              <div className="space-y-2">
                <Label>API Key / Token (Actualizar)</Label>
                <Input type="password" name="waApiKeyEncrypted" placeholder="Dejar en blanco para no cambiar" />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={updateConfig.isPending}>
            {updateConfig.isPending ? "Guardando..." : "Guardar Configuración Global"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
