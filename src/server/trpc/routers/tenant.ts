import { router, tenantProcedure, ownerProcedure } from '../trpc';
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { INDUSTRY_PRESETS, getIndustryPreset } from '../../lib/industries';

export const tenantRouter = router({
  current: tenantProcedure.query(async ({ ctx }) => {
    const tenant = await ctx.db.tenant.findUnique({
      where: { id: ctx.tenantId },
      include: { settings: true, subscription: true },
    });
    if (!tenant) throw new TRPCError({ code: 'NOT_FOUND' });
    return tenant;
  }),

  /** Catalogue for the onboarding wizard. Static, so it needs no tenant. */
  industries: tenantProcedure.query(() =>
    INDUSTRY_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      description: preset.description,
      recurrenceUnit: preset.recurrenceUnit,
      recurrenceInterval: preset.recurrenceInterval,
      recurrenceAnchor: preset.recurrenceAnchor,
      oneOffSettlesPeriod: preset.oneOffSettlesPeriod,
      minDaysBetweenApplications: preset.minDaysBetweenApplications,
      serviceTypes: preset.serviceTypes,
      defaultDurationMinutes: preset.defaultDurationMinutes,
      workingHoursStart: preset.workingHoursStart,
      workingHoursEnd: preset.workingHoursEnd,
      labels: preset.labels,
    }))
  ),

  /**
   * Applies an industry preset and closes onboarding.
   *
   * Everything written here is a starting point: picking an industry locks
   * nothing, and every field stays editable from Settings afterwards.
   */
  completeOnboarding: ownerProcedure
    .input(
      z.object({
        industry: z.string().min(1),
        baseAddress: z.string().nullish(),
        recurrenceUnit: z.enum(['DAY', 'WEEK', 'MONTH']),
        recurrenceInterval: z.number().int().min(1).max(60),
        recurrenceAnchor: z.enum(['CALENDAR', 'LAST_VISIT']),
        oneOffSettlesPeriod: z.boolean(),
        minDaysBetweenApplications: z.number().int().min(0).max(365),
        serviceTypes: z.array(z.string()),
        workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/),
        workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/),
        labelRecurringAgreement: z.string().min(1).max(50),
        labelOneOffVisit: z.string().min(1).max(50),
        labelMultiVisitJob: z.string().min(1).max(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const preset = getIndustryPreset(input.industry);

      const settings = {
        recurrenceUnit: input.recurrenceUnit,
        recurrenceInterval: input.recurrenceInterval,
        recurrenceAnchor: input.recurrenceAnchor,
        oneOffSettlesPeriod: input.oneOffSettlesPeriod,
        minDaysBetweenApplications: input.minDaysBetweenApplications,
        baseAddress: input.baseAddress || null,
        workingHoursStart: input.workingHoursStart,
        workingHoursEnd: input.workingHoursEnd,
        customServiceTypes: input.serviceTypes,
        defaultDurationMinutes: preset.defaultDurationMinutes,
        labelRecurringAgreement: input.labelRecurringAgreement,
        labelOneOffVisit: input.labelOneOffVisit,
        labelMultiVisitJob: input.labelMultiVisitJob,
        onboardedAt: new Date(),
      };

      const [, tenantSettings] = await ctx.db.$transaction([
        ctx.db.tenant.update({
          where: { id: ctx.tenantId },
          data: { industry: input.industry },
        }),
        ctx.db.tenantSettings.upsert({
          where: { tenantId: ctx.tenantId },
          update: settings,
          create: { tenantId: ctx.tenantId, ...settings },
        }),
      ]);

      return tenantSettings;
    }),

  updateProfile: ownerProcedure
    .input(
      z.object({
        name: z.string().min(2).optional(),
        industry: z.string().nullish(),
        logoUrl: z.string().url().nullish(),
        timezone: z.string().optional(),
        country: z.string().length(2).optional(),
        currency: z.string().length(3).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.tenant.update({ where: { id: ctx.tenantId }, data: input });
    }),

  updateSettings: ownerProcedure
    .input(
      z.object({
        baseAddress: z.string().nullish(),
        baseLat: z.number().nullish(),
        baseLng: z.number().nullish(),
        adminEmail: z.string().email().nullish(),
        workingHoursStart: z
          .string()
          .regex(/^\d{2}:\d{2}$/, 'Formato esperado HH:MM')
          .optional(),
        workingHoursEnd: z
          .string()
          .regex(/^\d{2}:\d{2}$/, 'Formato esperado HH:MM')
          .optional(),
        recurrenceUnit: z.enum(['DAY', 'WEEK', 'MONTH']).optional(),
        recurrenceInterval: z.number().int().min(1).max(60).optional(),
        recurrenceAnchor: z.enum(['CALENDAR', 'LAST_VISIT']).optional(),
        oneOffSettlesPeriod: z.boolean().optional(),
        minDaysBetweenApplications: z.number().int().min(0).max(365).optional(),
        labelRecurringAgreement: z.string().min(1).max(50).optional(),
        labelOneOffVisit: z.string().min(1).max(50).optional(),
        labelMultiVisitJob: z.string().min(1).max(50).optional(),
        defaultDurationMinutes: z.number().int().min(5).max(600).optional(),
        calendarEventDuration: z.number().int().min(5).max(600).optional(),
        calendarEventTitlePrefix: z.string().nullish(),
        googleCalendarId: z.string().nullish(),
        visitArchiveYears: z.number().int().min(1).max(10).optional(),
        customServiceTypes: z.array(z.string()).optional(),
        brandPrimaryColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, 'Formato esperado #RRGGBB')
          .nullish(),
        brandSecondaryColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/, 'Formato esperado #RRGGBB')
          .nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        update: input,
        create: { tenantId: ctx.tenantId, ...input },
      });
    }),

  /** Service types offered, merging the custom list with what clients already use. */
  serviceTypes: tenantProcedure.query(async ({ ctx }) => {
    const [settings, clients] = await Promise.all([
      ctx.db.tenantSettings.findUnique({
        where: { tenantId: ctx.tenantId },
        select: { customServiceTypes: true },
      }),
      ctx.db.client.findMany({
        where: { tenantId: ctx.tenantId, deletedAt: null },
        select: { serviceTypes: true },
      }),
    ]);

    const custom = Array.isArray(settings?.customServiceTypes)
      ? (settings.customServiceTypes as unknown[]).filter(
          (value): value is string => typeof value === 'string'
        )
      : [];

    const fromClients = clients.flatMap((client) => client.serviceTypes);
    return Array.from(new Set([...custom, ...fromClients])).sort();
  }),
});
