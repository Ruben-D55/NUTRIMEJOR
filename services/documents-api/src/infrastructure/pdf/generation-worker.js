import { generatePdf } from "./pdf-generator.js";

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function startGenerationWorker(repository) {
  for (;;) {
    let item;
    try {
      item = await repository.claim();
      if (!item) {
        await wait(750);
        continue;
      }
      const outputPath = repository.storagePath(item);
      await generatePdf(item, item.template, outputPath);
      await repository.complete(item, outputPath);
    } catch (error) {
      console.error(JSON.stringify({ message: "document generation failed", error: error.message, documentId: item?.id }));
      if (item) await repository.fail(item, error);
      await wait(1000);
    }
  }
}
