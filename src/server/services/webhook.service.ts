import { db } from '../db';
import crypto from 'crypto';

export const dispatchWebhook = async (tenantId: string, eventType: string, payload: any) => {
  try {
    const settings = await db.tenantSettings.findUnique({
      where: { tenantId },
    });

    if (!settings || !settings.webhookUrl || !settings.webhookEvents) {
      return;
    }

    const events = settings.webhookEvents as string[];
    if (!events.includes(eventType)) {
      return;
    }

    const body = JSON.stringify({
      event: eventType,
      data: payload,
      timestamp: new Date().toISOString(),
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (settings.webhookSecret) {
      const signature = crypto.createHmac('sha256', settings.webhookSecret).update(body).digest('hex');
      headers['x-serviflow-signature'] = signature;
    }

    // Fire and forget
    fetch(settings.webhookUrl, {
      method: 'POST',
      headers,
      body,
    }).catch((err) => {
      console.error(`Webhook dispatch failed for tenant ${tenantId}, event ${eventType}:`, err);
    });

  } catch (error) {
    console.error(`Failed to retrieve webhook settings for tenant ${tenantId}:`, error);
  }
};
