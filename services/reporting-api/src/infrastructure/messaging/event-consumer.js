import amqp from "amqplib";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function startEventConsumer(repository, config) {
  if (!config.rabbitmqUrl) return;
  for (;;) {
    let connection;
    try {
      connection = await amqp.connect(config.rabbitmqUrl);
      const channel = await connection.createChannel();
      await channel.assertExchange("nutrimejor.events", "topic", { durable: true });
      const queue = await channel.assertQueue("reporting-api.projections.v1", {
        durable: true,
        arguments: { "x-queue-type": "quorum" },
      });
      await channel.bindQueue(queue.queue, "nutrimejor.events", "#");
      await channel.prefetch(20);
      console.log(JSON.stringify({ service: config.serviceName, message: "reporting consumer connected" }));
      await new Promise((resolve, reject) => {
        connection.once("close", resolve);
        connection.once("error", reject);
        channel.consume(queue.queue, async (message) => {
          if (!message) return;
          try {
            const event = JSON.parse(message.content.toString("utf8"));
            await repository.processEvent(event, message.properties.messageId || null);
            channel.ack(message);
          } catch (error) {
            console.error(JSON.stringify({
              service: config.serviceName,
              message: "reporting event rejected",
              error: error?.message || String(error),
            }));
            channel.nack(message, false, false);
          }
        }, { noAck: false }).catch(reject);
      });
    } catch (error) {
      console.error(JSON.stringify({
        service: config.serviceName,
        message: "reporting consumer unavailable; retrying",
        error: error?.message || String(error),
      }));
      try { await connection?.close(); } catch {}
      await wait(5000);
    }
  }
}
