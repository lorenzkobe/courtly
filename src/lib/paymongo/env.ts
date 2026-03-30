function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

export function getPaymongoSecretKey(): string {
  return readRequired("PAYMONGO_SECRET_KEY");
}

export function getPaymongoWebhookSecret(): string {
  return readRequired("PAYMONGO_WEBHOOK_SECRET");
}

export function getPaymongoApiBaseUrl(): string {
  return process.env.PAYMONGO_API_BASE_URL || "https://api.paymongo.com/v1";
}
