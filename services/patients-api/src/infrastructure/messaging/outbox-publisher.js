import amqp from "amqplib";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function startOutboxPublisher(repository, config) {
  if (!config.rabbitmqUrl) return;
  for (;;) {
    let connection;
    try {
      connection = await amqp.connect(config.rabbitmqUrl);
      const channel = await connection.createConfirmChannel();
      await channel.assertExchange("nutrimejor.events", "topic", { durable: true });
      console.log(JSON.stringify({ service: config.serviceName, message: "outbox connected" }));

      while (connection.connection.stream.readable) {
        const messages = await repository.pending();
        for (const message of messages) {
          try {
            channel.publish(
              "nutrimejor.events",
              message.eventType,
              Buffer.from(message.payload),
              {
                persistent: true,
                contentType: "application/json",
                messageId: String(message.id),
                type: message.eventType,
              },
            );
            await channel.waitForConfirms();
            await repository.markPublished(message.id);
          } catch (error) {
            await repository.markFailed(message.id);
            throw error;
          }
        }
        await wait(messages.length ? 100 : 1000);
      }
    } catch (error) {
      console.error(JSON.stringify({
        service: config.serviceName,
        message: "outbox unavailable; retrying",
        error: error?.message || String(error),
      }));
      try { await connection?.close(); } catch {}
      await wait(5000);
    }
  }
}
