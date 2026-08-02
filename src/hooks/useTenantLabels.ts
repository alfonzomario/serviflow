"use client"

import { trpc } from "@/lib/trpc"

/**
 * What this business calls the three things it schedules.
 *
 * A fumigator says abono / especial / tratamiento; a pool company says plan de
 * mantenimiento / trabajo puntual / trabajo. The screens read these instead of
 * hardcoding one rubro's vocabulary.
 */
export function useTenantLabels() {
  const tenant = trpc.tenant.current.useQuery()
  const settings = tenant.data?.settings

  return {
    isLoading: tenant.isLoading,
    /** The repeating commitment. */
    recurring: settings?.labelRecurringAgreement ?? "Abono",
    /** A one-off job outside the agreement. */
    oneOff: settings?.labelOneOffVisit ?? "Especial",
    /** A job that spans several visits. */
    multiVisit: settings?.labelMultiVisitJob ?? "Tratamiento",
  }
}
