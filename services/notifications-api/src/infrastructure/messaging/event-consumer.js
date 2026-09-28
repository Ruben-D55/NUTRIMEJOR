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
      const queue = await channel.assertQueue("notifications-api.scheduling.v1", {
        durable: true,
        arguments: { "x-queue-type": "quorum" },
      });
      await channel.bindQueue(queue.queue, "nutrimejor.events", "scheduling.appointment.*.v1");
      await channel.prefetch(20);
      console.log(JSON.stringify({ service: config.serviceName, message: "notification consumer connected" }));
      await new Promise((resolve, reject) => {
        connection.once("close", resolve);
        connection.once("error", reject);
        channel.consume(queue.queue, async (message) => {
          if (!message) return;
          try {
            await repository.processEvent(JSON.parse(message.content.toString("utf8")));
            channel.ack(message);
          } catch (error) {
            console.error(JSON.stringify({ service: config.serviceName, message: "notification event rejected", error: error.message }));
            channel.nack(message, false, false);
          }
        }, { noAck: false }).catch(reject);
      });
    } catch (error) {
      console.error(JSON.stringify({ service: config.serviceName, message: "notification consumer unavailable; retrying", error: error.message }));
      try { await connection?.close(); } catch {}
      await wait(5000);
    }
  }
}
