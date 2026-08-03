'use client';

import { CreditCard, Check, Zap, Users, Calendar, Sparkles, Building } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

export default function FacturacionPage() {
  const utils = trpc.useUtils();

  const { data: plans } = trpc.subscription.getPlans.useQuery();
  const { data: currentData, isLoading } = trpc.subscription.getCurrent.useQuery();

  const changePlan = trpc.subscription.changePlan.useMutation({
    onSuccess: () => {
      toast.success('Plan actualizado con éxito');
      utils.subscription.getCurrent.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || 'No se pudo actualizar el plan');
    },
  });

  const usage = currentData?.usage;
  const currentPlan = currentData?.planName || 'free';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 shadow-lg shadow-indigo-500/10">
          <CreditCard className="h-6 w-6 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Facturación y Planes</h1>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            Administrá tu suscripción, cuotas de uso y funciones adicionales de ServiFlow.
          </p>
        </div>
      </div>

      {/* Usage Meters */}
      <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-bold">Consumo del Período Actual</h2>
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">Límites de tu plan activo y consumo registrado.</p>
        </div>
        <div className="px-5 pb-5 grid gap-6 sm:grid-cols-3">
          {/* Clientes */}
          {(() => {
            const pct = Math.min(100, ((usage?.clientsCount || 0) / (usage?.maxClients || 50)) * 100)
            const barColor = pct >= 85 ? 'from-red-500 to-rose-400' : pct >= 60 ? 'from-amber-500 to-orange-400' : 'from-indigo-600 to-blue-500'
            return (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-indigo-400" /> Clientes</span>
                  <span className="tabular-nums">{usage?.clientsCount || 0} / {usage?.maxClients || 50}</span>
                </div>
                <div className="h-2.5 w-full bg-[hsl(var(--border))] rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700 ease-out`}
                    style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] text-right">{pct.toFixed(0)}% usado</p>
              </div>
            )
          })()}

          {/* Visitas */}
          {(() => {
            const pct = Math.min(100, ((usage?.visitsThisMonth || 0) / (usage?.maxVisitsMonth || 100)) * 100)
            const barColor = pct >= 85 ? 'from-red-500 to-rose-400' : pct >= 60 ? 'from-amber-500 to-orange-400' : 'from-indigo-600 to-blue-500'
            return (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-indigo-400" /> Visitas del Mes</span>
                  <span className="tabular-nums">{usage?.visitsThisMonth || 0} / {usage?.maxVisitsMonth || 100}</span>
                </div>
                <div className="h-2.5 w-full bg-[hsl(var(--border))] rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700 ease-out`}
                    style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] text-right">{pct.toFixed(0)}% usado</p>
              </div>
            )
          })()}

          {/* Miembros */}
          {(() => {
            const pct = Math.min(100, ((usage?.usersCount || 0) / (usage?.maxUsers || 2)) * 100)
            const barColor = pct >= 85 ? 'from-red-500 to-rose-400' : pct >= 60 ? 'from-amber-500 to-orange-400' : 'from-indigo-600 to-blue-500'
            return (
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="flex items-center gap-1.5"><Building className="h-4 w-4 text-indigo-400" /> Miembros de Equipo</span>
                  <span className="tabular-nums">{usage?.usersCount || 0} / {usage?.maxUsers || 2}</span>
                </div>
                <div className="h-2.5 w-full bg-[hsl(var(--border))] rounded-full overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${barColor} rounded-full transition-all duration-700 ease-out`}
                    style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] text-right">{pct.toFixed(0)}% usado</p>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Plans Comparison */}
      <div className="grid gap-6 md:grid-cols-3">
        {plans?.map((plan) => {
          const isCurrent = currentPlan === plan.name;
          const isFree = plan.name === 'free';
          const isPro = plan.name === 'pro';

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-2xl border transition-all duration-200 ${
                isCurrent
                  ? 'border-indigo-500/50 ring-1 ring-indigo-500/30 bg-gradient-to-b from-indigo-500/10 to-transparent shadow-lg shadow-indigo-500/10'
                  : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-[hsl(var(--primary)/0.3)]'
              }`}
            >
              {isPro && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2
                  bg-gradient-to-r from-indigo-600 to-blue-600 text-white
                  text-[10px] font-bold uppercase tracking-wider px-4 py-1 rounded-full
                  shadow-md shadow-indigo-500/30">
                  Más Popular
                </span>
              )}

              <div className="p-5 pb-2">
                <h3 className="text-xl font-bold">{plan.displayName}</h3>
                <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
                  {isFree && 'Para emprendedores y pruebas de concepto.'}
                  {isPro && 'Para empresas en crecimiento con equipo.'}
                  {plan.name === 'business' && 'Para grandes empresas y operativas avanzadas.'}
                </p>
                <div className="pt-4">
                  <span className="text-4xl font-extrabold tracking-tight">
                    ${Number(plan.monthlyPriceArs).toLocaleString()}
                  </span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))] font-medium ml-1"> ARS / mes</span>
                </div>
              </div>

              <div className="px-5 py-3 space-y-2.5 text-xs">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Hasta {plan.maxClients} clientes registrados</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Hasta {plan.maxVisitsMonth} visitas por mes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>Hasta {plan.maxUsers} miembros de equipo</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className={`h-4 w-4 shrink-0 ${plan.aiEnabled ? 'text-emerald-400' : 'text-[hsl(var(--muted-foreground)/0.4)]'}`} />
                  <span className={plan.aiEnabled ? 'font-semibold text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground)/0.4)] line-through'}>
                    Asesor IA e Insights incluidos
                  </span>
                </div>
              </div>

              <div className="p-5 pt-4">
                <Button
                  disabled={isCurrent || changePlan.isPending}
                  onClick={() => changePlan.mutate({ planName: plan.name as any })}
                  className={`w-full font-bold rounded-xl ${
                    isCurrent
                      ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] cursor-default'
                      : isPro
                      ? 'bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:shadow-lg hover:shadow-indigo-500/30 border-none'
                      : 'bg-[hsl(var(--primary))] text-white'
                  }`}
                >
                  {isCurrent ? 'Plan Actual' : `Cambiar a ${plan.displayName}`}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
