import { db } from '../db';
import { decrypt } from '../lib/encryption';

export const generateAiText = async (tenantId: string, prompt: string, model: string = 'gpt-4o-mini') => {
  const settings = await db.tenantSettings.findUnique({
    where: { tenantId },
  });

  let encryptedKey = settings?.aiOwnKeyEncrypted;
  let provider = settings?.aiOwnProvider;

  if (!encryptedKey || !provider) {
    const platformConfig = await db.platformConfig.findFirst();
    encryptedKey = platformConfig?.globalAiKeyEncrypted || undefined;
    provider = platformConfig?.globalAiProvider || undefined;
  }

  if (!encryptedKey) {
    throw new Error('No AI API key available. Please configure AI settings.');
  }

  const apiKey = decrypt(encryptedKey);

  if (!apiKey) {
    throw new Error('Failed to decrypt AI API key.');
  }

  // Simulate API call
  const responseText = "Simulated AI response for: " + prompt.substring(0, 20);
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = 20;
  const cost = 0.001;

  await db.aiUsageLog.create({
    data: {
      tenantId,
      provider: provider || 'openai',
      model,
      inputTokens,
      outputTokens,
      estimatedCostUsd: cost,
      endpoint: '/v1/chat/completions',
    },
  });

  return responseText;
};
