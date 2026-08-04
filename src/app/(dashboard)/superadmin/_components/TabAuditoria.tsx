"use client";

import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScrollText, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

export function TabAuditoria() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = trpc.superadmin.getAuditLogs.useQuery({ page, pageSize: 15 });

  return (
    <Card className="border border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-purple-600" />
          Registro de Auditoría Global
        </CardTitle>
        <CardDescription>Acciones administrativas y cambios críticos en la plataforma.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 border-y border-border text-muted-foreground uppercase font-semibold">
              <tr>
                <th className="p-3">Fecha</th>
                <th className="p-3">Acción</th>
                <th className="p-3">Entidad</th>
                <th className="p-3">Usuario (Email)</th>
                <th className="p-3">Organización (Slug)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading && <tr><td colSpan={5} className="p-6 text-center">Cargando...</td></tr>}
              {data?.items?.length === 0 && <tr><td colSpan={5} className="p-6 text-center">No hay registros de auditoría.</td></tr>}
              {data?.items?.map((log: any) => (
                <tr key={log.id} className="hover:bg-muted/30">
                  <td className="p-3 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="p-3 font-semibold">{log.action}</td>
                  <td className="p-3 text-muted-foreground">{log.entityType}</td>
                  <td className="p-3">{log.user?.email || "Sistema"}</td>
                  <td className="p-3">{log.tenant?.slug || "Global"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.totalPages > 1 && (
          <div className="p-3 flex items-center justify-end gap-2 border-t">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground">Página {page} de {data.totalPages}</span>
            <Button size="sm" variant="outline" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
