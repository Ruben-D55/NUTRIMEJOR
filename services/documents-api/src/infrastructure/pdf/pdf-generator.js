import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import PDFDocument from "pdfkit";

function drawHeader(doc, request, template) {
  const color = template?.definition?.primaryColor || "#1F7A5A";
  doc.rect(0, 0, doc.page.width, 86).fill(color);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(20)
    .text(template?.definition?.organizationName || "NUTRIMEJOR", 48, 28);
  doc.font("Helvetica").fontSize(10).text(request.documentType.replaceAll("_", " ").toUpperCase(), 48, 56);
  doc.fillColor("#1F2937").moveDown(3);
}

function ensureSpace(doc, height = 60) {
  if (doc.y + height > doc.page.height - 70) doc.addPage();
}

export async function generatePdf(request, template, outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, info: { Title: request.title } });
  const stream = createWriteStream(outputPath);
  doc.pipe(stream);
  doc.on("pageAdded", () => drawHeader(doc, request, template));
  drawHeader(doc, request, template);
  doc.font("Helvetica-Bold").fontSize(18).text(request.title);
  doc.moveDown(0.4).font("Helvetica").fontSize(10).fillColor("#4B5563")
    .text(`Paciente: ${request.payload.patientDisplayName}`)
    .text(`Fecha de emisión: ${new Date(request.payload.issuedAt).toLocaleDateString("es-BO")}`);
  doc.moveDown(1.2).fillColor("#1F2937");

  for (const section of request.payload.sections) {
    doc.x = 48;
    ensureSpace(doc);
    if (section.type === "heading") {
      doc.moveDown(0.7).font("Helvetica-Bold").fontSize(14).fillColor("#1F7A5A").text(section.text);
      doc.moveDown(0.35).fillColor("#1F2937");
    } else if (section.type === "paragraph") {
      doc.font("Helvetica").fontSize(10.5).fillColor("#1F2937")
        .text(section.text, { lineGap: 3, align: "justify" }).moveDown(0.7);
    } else if (section.type === "key_value") {
      for (const item of section.items) {
        ensureSpace(doc, 24);
        const y = doc.y;
        doc.font("Helvetica-Bold").fontSize(9.5).fillColor("#374151").text(item.label, 48, y, { width: 150 });
        doc.font("Helvetica").fillColor("#111827").text(item.value, 204, y, { width: 340 });
        doc.y = Math.max(doc.y, y + 18);
      }
      doc.moveDown(0.5);
    } else if (section.type === "table") {
      const width = 500 / section.columns.length;
      const drawRow = (values, header = false) => {
        ensureSpace(doc, 30);
        const y = doc.y;
        if (header) doc.rect(48, y - 3, 500, 22).fill("#E8F3EE");
        values.forEach((value, index) => {
          doc.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
            .fillColor("#1F2937").text(String(value), 52 + width * index, y, { width: width - 8 });
        });
        doc.y = y + 24;
      };
      drawRow(section.columns, true);
      section.rows.forEach((row) => drawRow(row));
      doc.x = 48;
      doc.moveDown(0.5);
    }
  }
  const footer = template?.definition?.footer || "Documento generado por NUTRIMEJOR";
  const pages = doc.bufferedPageRange?.();
  if (pages) {
    for (let index = pages.start; index < pages.start + pages.count; index += 1) {
      doc.switchToPage(index);
      const bottomMargin = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font("Helvetica").fontSize(8).fillColor("#6B7280")
        .text(`${footer}  |  Página ${index + 1}`, 48, doc.page.height - 28, {
          width: 500,
          align: "center",
          lineBreak: false,
        });
      doc.page.margins.bottom = bottomMargin;
    }
  }
  doc.end();
  await new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}
