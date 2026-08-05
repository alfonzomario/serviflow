import { z } from 'zod';
import { router, ownerProcedure } from '../trpc';
import { encrypt, decrypt, encryptIfPresent, decryptIfPresent } from '../../lib/encryption';
import { syncVisitToGoogle, cleanLegacyGoogleEvents } from '../../services/google-calendar.service';
import crypto from 'crypto';

export const integrationsRouter = router({
  getGoogleCalendarStatus: ownerProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    const envClientId = process.env.GOOGLE_CLIENT_ID || null;
    const envClientSecret = process.env.GOOGLE_CLIENT_SECRET || null;

    const clientId = settings?.googleClientId || envClientId;
    const hasSecret = Boolean(settings?.googleClientSecretEncrypted || envClientSecret);

    return {
      connected: !!settings?.googleRefreshToken,
      calendarId: settings?.googleCalendarId || null,
      enabled: settings?.googleCalendarEnabled || false,
      hasCredentials: Boolean(clientId && hasSecret),
      googleClientId: clientId || null,
      hasClientSecret: hasSecret,
      icalFeedToken: settings?.icalFeedToken || null,
      icalFeedUrl: settings?.icalFeedToken ? `/api/ical/${settings.icalFeedToken}` : null,
    };
  }),

  syncAllVisitsToGoogle: ownerProcedure.mutation(async ({ ctx }) => {
    // Reset calendarEventId so old gray iCal events are cleanly replaced with fresh Electric Blue events
    await ctx.db.visit.updateMany({
      where: {
        tenantId: ctx.tenantId,
        status: { not: 'CANCELLED' },
        scheduledAt: { not: null },
      },
      data: { calendarEventId: null },
    });

    const visits = await ctx.db.visit.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { not: 'CANCELLED' },
        scheduledAt: { not: null },
      },
      select: { id: true },
    });

    // Process visits in background with 150ms delay between calls to comply with Google API rate limits (5 req/sec)
    (async () => {
      // First, automatically delete old gray legacy events (titled "— Servicio") from primary Google Calendar
      await cleanLegacyGoogleEvents(ctx.tenantId).catch(console.error);

      for (const v of visits) {
        await syncVisitToGoogle(v.id, ctx.tenantId).catch(console.error);
        await new Promise((r) => setTimeout(r, 150));
      }
    })().catch(console.error);

    return { count: visits.length };
  }),

  updateGoogleCredentials: ownerProcedure
    .input(
      z.object({
        clientId: z.string().nullish(),
        clientSecret: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const trimmedClientId = input.clientId ? input.clientId.trim() : null;
      const trimmedSecret = input.clientSecret ? input.clientSecret.trim() : undefined;
      const encryptedSecret = trimmedSecret ? encryptIfPresent(trimmedSecret) : undefined;

      await ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          googleClientId: trimmedClientId,
          ...(encryptedSecret && { googleClientSecretEncrypted: encryptedSecret }),
        },
        update: {
          googleClientId: trimmedClientId,
          ...(encryptedSecret && { googleClientSecretEncrypted: encryptedSecret }),
        },
      });
    }),

  disconnectGoogleCalendar: ownerProcedure.mutation(async ({ ctx }) => {
    await ctx.db.tenantSettings.upsert({
      where: { tenantId: ctx.tenantId },
      create: {
        tenantId: ctx.tenantId,
        googleRefreshToken: null,
        googleAccessToken: null,
        googleTokenExpiresAt: null,
        googleCalendarId: null,
        googleCalendarEnabled: false,
      },
      update: {
        googleRefreshToken: null,
        googleAccessToken: null,
        googleTokenExpiresAt: null,
        googleCalendarId: null,
        googleCalendarEnabled: false,
      },
    });
  }),

  getIcalFeedUrl: ownerProcedure.query(async ({ ctx }) => {
    let settings = await ctx.db.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });

    if (!settings?.icalFeedToken) {
      const newToken = crypto.randomUUID().replace(/-/g, '');
      settings = await ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          icalFeedToken: newToken,
        },
        update: {
          icalFeedToken: newToken,
        },
      });
    }

    return {
      token: settings.icalFeedToken,
      url: `/api/calendar/ical?token=${settings.icalFeedToken}`,
    };
  }),

  regenerateIcalToken: ownerProcedure.mutation(async ({ ctx }) => {
    const newToken = crypto.randomUUID().replace(/-/g, '');
    await ctx.db.tenantSettings.upsert({
      where: { tenantId: ctx.tenantId },
      create: {
        tenantId: ctx.tenantId,
        icalFeedToken: newToken,
      },
      update: {
        icalFeedToken: newToken,
      },
    });

    return { token: newToken, url: `/api/calendar/ical?token=${newToken}` };
  }),

  getWhatsAppConfig: ownerProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    return {
      configured: !!settings?.waOwnApiUrl,
      apiUrl: settings?.waOwnApiUrl || null,
      hasApiKey: !!settings?.waOwnApiKeyEncrypted,
    };
  }),

  updateWhatsAppConfig: ownerProcedure
    .input(
      z.object({
        apiUrl: z.string().nullish(),
        apiKey: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const encryptedKey = input.apiKey ? encryptIfPresent(input.apiKey) : undefined;
      await ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          waOwnApiUrl: input.apiUrl || null,
          ...(encryptedKey && { waOwnApiKeyEncrypted: encryptedKey }),
        },
        update: {
          waOwnApiUrl: input.apiUrl || null,
          ...(encryptedKey && { waOwnApiKeyEncrypted: encryptedKey }),
        },
      });
    }),

  getSmtpConfig: ownerProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    return {
      configured: !!settings?.smtpOwnHost,
      host: settings?.smtpOwnHost || null,
      port: settings?.smtpOwnPort || null,
      user: settings?.smtpOwnUser || null,
      fromEmail: settings?.smtpOwnFromEmail || null,
      hasPassword: !!settings?.smtpOwnPassEncrypted,
    };
  }),

  updateSmtpConfig: ownerProcedure
    .input(
      z.object({
        host: z.string().nullish(),
        port: z.number().nullish(),
        user: z.string().nullish(),
        password: z.string().nullish(),
        fromEmail: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const encryptedPass = input.password ? encryptIfPresent(input.password) : undefined;
      await ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          smtpOwnHost: input.host || null,
          smtpOwnPort: input.port || null,
          smtpOwnUser: input.user || null,
          smtpOwnFromEmail: input.fromEmail || null,
          ...(encryptedPass && { smtpOwnPassEncrypted: encryptedPass }),
        },
        update: {
          smtpOwnHost: input.host || null,
          smtpOwnPort: input.port || null,
          smtpOwnUser: input.user || null,
          smtpOwnFromEmail: input.fromEmail || null,
          ...(encryptedPass && { smtpOwnPassEncrypted: encryptedPass }),
        },
      });
    }),

  getWebhookConfig: ownerProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    return {
      url: settings?.webhookUrl || null,
      events: settings?.webhookEvents || [],
      hasSecret: !!settings?.webhookSecret,
    };
  }),

  updateWebhookConfig: ownerProcedure
    .input(
      z.object({
        url: z.string().nullish(),
        events: z.array(z.string()).default([]),
        regenerateSecret: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      let secret: string | undefined = undefined;
      if (input.regenerateSecret) {
        secret = crypto.randomBytes(32).toString('hex');
      }

      await ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          webhookUrl: input.url || null,
          webhookEvents: input.events,
          ...(secret && { webhookSecret: secret }),
        },
        update: {
          webhookUrl: input.url || null,
          webhookEvents: input.events,
          ...(secret && { webhookSecret: secret }),
        },
      });
    }),

  getAiConfig: ownerProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    return {
      provider: settings?.aiOwnProvider || 'openai',
      hasApiKey: !!settings?.aiOwnKeyEncrypted,
      usingPlatformKey: !settings?.aiOwnKeyEncrypted,
    };
  }),

  updateAiConfig: ownerProcedure
    .input(
      z.object({
        provider: z.string(),
        apiKey: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const encryptedKey = input.apiKey ? encryptIfPresent(input.apiKey) : undefined;
      await ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          aiOwnProvider: input.provider,
          ...(encryptedKey && { aiOwnKeyEncrypted: encryptedKey }),
        },
        update: {
          aiOwnProvider: input.provider,
          ...(encryptedKey && { aiOwnKeyEncrypted: encryptedKey }),
        },
      });
    }),
});
