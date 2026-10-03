const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function providerRequest(url, apiKey, payload) {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`El proveedor respondió ${response.status}.`);
  const result = await response.json().catch(() => ({}));
  return result.id || result.messageId || `provider-${crypto.randomUUID()}`;
}

async function deliver(item, config) {
  if (item.recipient.startsWith("fail:")) throw new Error("Fallo simulado del proveedor.");
  if (item.channel === "email") {
    if (!config.delivery.emailApiUrl) throw new Error("Proveedor de correo no configurado.");
    return providerRequest(config.delivery.emailApiUrl, config.delivery.emailApiKey, { from: config.delivery.emailFrom, to: item.recipient, subject: item.subject || item.title || "NUTRIMEJOR", text: item.body });
  }
  if (item.channel === "whatsapp") {
    if (!config.delivery.whatsappEnabled || !config.delivery.whatsappApiUrl) throw new Error("Canal WhatsApp todavía no habilitado.");
    return providerRequest(config.delivery.whatsappApiUrl, config.delivery.whatsappApiKey, { to: item.recipient, text: item.body });
  }
  if (item.channel === "sms") throw new Error("Proveedor SMS no configurado.");
  console.log(JSON.stringify({
    message: "notification delivered",
    channel: item.channel,
    notificationId: item.id,
  }));
  return `local-${crypto.randomUUID()}`;
}

export async function startDispatcher(repository, config) {
  for (;;) {
    try {
      const items = await repository.pending();
      for (const item of items) {
        try {
          await repository.markDelivered(item, await deliver(item, config));
        } catch (error) {
          await repository.markFailed(item, error);
        }
      }
      await wait(items.length ? 200 : 1000);
    } catch (error) {
      console.error(JSON.stringify({ message: "notification dispatcher retrying", error: error.message }));
      await wait(3000);
    }
  }
}
