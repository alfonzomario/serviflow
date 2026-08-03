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
        <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700">
          <CreditCard className="h-7 w-7" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Facturación y Planes</h1>
          <p className="text-muted-foreground">
            Administrá tu suscripción, cuotas de uso y funciones adicionales de ServiFlow.
          </p>
        </div>
      </div>

      {/* Usage Meters */}
      <Card className="border border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Consumo del Período Actual</CardTitle>
          <CardDescription>Límites de tu plan activo y consumo registrado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-3">
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-indigo-600" /> Clientes</span>
              <span>{usage?.clientsCount || 0} / {usage?.maxClients || 50}</span>
            </div>
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((usage?.clientsCount || 0) / (usage?.maxClients || 50)) * 100)}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4 text-indigo-600" /> Visitas del Mes</span>
              <span>{usage?.visitsThisMonth || 0} / {usage?.maxVisitsMonth || 100}</span>
            </div>
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((usage?.visitsThisMonth || 0) / (usage?.maxVisitsMonth || 100)) * 100)}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5"><Building className="h-4 w-4 text-indigo-600" /> Miembros de Equipo</span>
              <span>{usage?.usersCount || 0} / {usage?.maxUsers || 2}</span>
            </div>
            <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-600 rounded-full transition-all"
                style={{ width: `${Math.min(100, ((usage?.usersCount || 0) / (usage?.maxUsers || 2)) * 100)}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plans Comparison */}
      <div className="grid gap-6 md:grid-cols-3">
        {plans?.map((plan) => {
          const isCurrent = currentPlan === plan.name;
          const isFree = plan.name === 'free';
          const isPro = plan.name === 'pro';

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col justify-between border shadow-sm transition-all ${
                isCurrent
                  ? 'border-indigo-600 ring-2 ring-indigo-600/20 bg-indigo-50/20'
                  : 'border-border bg-card'
              }`}
            >
              {isPro && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full">
                  Más Popular
                </span>
              )}

              <CardHeader>
                <CardTitle className="text-xl font-bold">{plan.displayName}</CardTitle>
                <CardDescription>
                  {isFree && 'Para emprendedores y pruebas de concepto.'}
                  {isPro && 'Para empresas en crecimiento con equipo.'}
                  {plan.name === 'business' && 'Para grandes empresas y operativas avanzadas.'}
                </CardDescription>
                <div className="pt-4">
                  <span className="text-3xl font-extrabold text-foreground">
                    ${Number(plan.monthlyPriceArs).toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground font-medium"> ARS / mes</span>
                </div>
              </CardHeader>

              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Hasta {plan.maxClients} clientes registrados</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Hasta {plan.maxVisitsMonth} visitas por mes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span>Hasta {plan.maxUsers} miembros de equipo</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className={`h-4 w-4 shrink-0 ${plan.aiEnabled ? 'text-emerald-600' : 'text-muted-foreground opacity-40'}`} />
                  <span className={plan.aiEnabled ? 'font-semibold text-foreground' : 'text-muted-foreground line-through'}>
                    Asesor IA e Insights incluidos
                  </span>
                </div>
              </CardContent>

              <CardFooter className="pt-4">
                <Button
                  disabled={isCurrent || changePlan.isPending}
                  onClick={() => changePlan.mutate({ planName: plan.name as any })}
                  className={`w-full font-bold ${
                    isCurrent
                      ? 'bg-secondary text-secondary-foreground cursor-default'
                      : isPro
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                      : 'bg-primary text-primary-foreground'
                  }`}
                >
                  {isCurrent ? 'Plan Actual' : `Cambiar a ${plan.displayName}`}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
