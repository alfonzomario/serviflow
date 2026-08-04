import { z } from 'zod';
import { router, ownerProcedure } from '../trpc';
import { encrypt, decrypt, encryptIfPresent, decryptIfPresent } from '../../lib/encryption';
import crypto from 'crypto';

export const integrationsRouter = router({
  getGoogleCalendarStatus: ownerProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    return {
      connected: !!settings?.googleRefreshToken,
      calendarId: settings?.googleCalendarId || null,
      enabled: settings?.googleCalendarEnabled || false,
      icalFeedToken: settings?.icalFeedToken || null,
      icalFeedUrl: settings?.icalFeedToken ? `/api/ical/${settings.icalFeedToken}` : null,
    };
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
      url: `/api/ical/${settings.icalFeedToken}`,
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
    return {
      url: `/api/ical/${newToken}`,
    };
  }),

  getWhatsAppConfig: ownerProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    return {
      configured: !!settings?.waOwnApiUrl && !!settings?.waOwnApiKeyEncrypted,
      apiUrl: settings?.waOwnApiUrl || null,
      hasApiKey: !!settings?.waOwnApiKeyEncrypted,
    };
  }),

  updateWhatsAppConfig: ownerProcedure
    .input(
      z.object({
        apiUrl: z.string().url().nullable().or(z.literal('')),
        apiKey: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: any = {
        waOwnApiUrl: input.apiUrl || null,
      };
      
      if (input.apiKey !== undefined) {
        updateData.waOwnApiKeyEncrypted = encryptIfPresent(input.apiKey) || null;
      }

      await ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          ...updateData,
        },
        update: updateData,
      });
    }),

  getSmtpConfig: ownerProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    return {
      configured: !!settings?.smtpOwnHost && !!settings?.smtpOwnUser && !!settings?.smtpOwnPassEncrypted,
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
        host: z.string().nullable().or(z.literal('')),
        port: z.number().nullable().or(z.string().transform(v => parseInt(v, 10)).pipe(z.number())),
        user: z.string().nullable().or(z.literal('')),
        password: z.string().optional(),
        fromEmail: z.string().nullable().or(z.literal('')),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: any = {
        smtpOwnHost: input.host || null,
        smtpOwnPort: input.port || null,
        smtpOwnUser: input.user || null,
        smtpOwnFromEmail: input.fromEmail || null,
      };

      if (input.password !== undefined) {
        updateData.smtpOwnPassEncrypted = encryptIfPresent(input.password) || null;
      }

      await ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          ...updateData,
        },
        update: updateData,
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
        url: z.string().url().nullable().or(z.literal('')),
        events: z.array(z.string()),
        regenerateSecret: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: any = {
        webhookUrl: input.url || null,
        webhookEvents: input.events,
      };

      if (input.regenerateSecret) {
        updateData.webhookSecret = crypto.randomBytes(32).toString('hex');
      }

      await ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          ...updateData,
          ...(input.regenerateSecret ? {} : { webhookSecret: crypto.randomBytes(32).toString('hex') }),
        },
        update: updateData,
      });
    }),

  getAiConfig: ownerProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
    });
    
    // Check global platform AI key vs own key
    const hasOwnKey = !!settings?.aiOwnKeyEncrypted;
    
    return {
      provider: settings?.aiOwnProvider || 'openai',
      hasApiKey: hasOwnKey,
      usingPlatformKey: !hasOwnKey,
    };
  }),

  updateAiConfig: ownerProcedure
    .input(
      z.object({
        provider: z.enum(['openai', 'anthropic', 'gemini', 'deepseek']),
        apiKey: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: any = {
        aiOwnProvider: input.provider,
      };

      if (input.apiKey !== undefined) {
        updateData.aiOwnKeyEncrypted = encryptIfPresent(input.apiKey) || null;
      }

      await ctx.db.tenantSettings.upsert({
        where: { tenantId: ctx.tenantId },
        create: {
          tenantId: ctx.tenantId,
          ...updateData,
        },
        update: updateData,
      });
    }),
});
