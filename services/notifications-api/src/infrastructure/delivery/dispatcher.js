const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function deliver(item) {
  if (item.recipient.startsWith("fail:")) throw new Error("Fallo simulado del proveedor.");
  console.log(JSON.stringify({
    message: "notification delivered",
    channel: item.channel,
    notificationId: item.id,
  }));
  return `local-${crypto.randomUUID()}`;
}

export async function startDispatcher(repository) {
  for (;;) {
    try {
      const items = await repository.pending();
      for (const item of items) {
        try {
          await repository.markDelivered(item, await deliver(item));
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
