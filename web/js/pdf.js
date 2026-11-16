// Минимальный генератор PDF: обложка встраивается как JPEG (DCTDecode),
// вокруг страницы могут быть добавлены поля 3 мм и метки обрезки. Без внешних библиотек.

function cropMarks(bleed, width, height) {
  if (!bleed) return "";
  const gap = 2;
  const len = 7;
  const x0 = bleed;
  const x1 = bleed + width;
  const y0 = bleed;
  const y1 = bleed + height;
  const lines = [
    [x0 - gap - len, y0, x0 - gap, y0], [x0, y0 - gap - len, x0, y0 - gap],
    [x1 + gap, y0, x1 + gap + len, y0], [x1, y0 - gap - len, x1, y0 - gap],
    [x0 - gap - len, y1, x0 - gap, y1], [x0, y1 + gap, x0, y1 + gap + len],
    [x1 + gap, y1, x1 + gap + len, y1], [x1, y1 + gap, x1, y1 + gap + len],
  ];
  return lines.map(([ax, ay, bx, by]) =>
    `${ax.toFixed(2)} ${ay.toFixed(2)} m ${bx.toFixed(2)} ${by.toFixed(2)} l S`).join("\n");
}

export async function canvasToPdf({ canvas, quality = 0.92, bleed = true, dpi = 300 }) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error("Не удалось создать JPEG"))), "image/jpeg", quality);
  });
  const jpeg = new Uint8Array(await blob.arrayBuffer());
  const trimWidth = (canvas.width / dpi) * 72;
  const trimHeight = (canvas.height / dpi) * 72;
  const bleedPt = bleed ? (3 / 25.4) * 72 : 0;
  const mediaWidth = trimWidth + bleedPt * 2;
  const mediaHeight = trimHeight + bleedPt * 2;

  const content = [
    "q",
    `${bleedPt.toFixed(2)} 0 0 ${trimHeight.toFixed(2)} ${bleedPt.toFixed(2)} ${bleedPt.toFixed(2)} cm`,
    "/Im0 Do",
    "Q",
    bleed ? "0.5 w\n0 0 0 RG" : "",
    cropMarks(bleedPt, trimWidth, trimHeight),
  ].filter(Boolean).join("\n");

  const encoder = new TextEncoder();
  const chunks = [];
  let length = 0;
  const offsets = [];
  const push = (value) => {
    const bytes = typeof value === "string" ? encoder.encode(value) : value;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObject = (number) => {
    offsets[number] = length;
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");

  beginObject(1);
  push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");

  beginObject(2);
  push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");

  beginObject(3);
  push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${mediaWidth.toFixed(2)} ${mediaHeight.toFixed(2)}] ` +
    `/Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );

  beginObject(4);
  push(
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`,
  );
  push(jpeg);
  push("\nendstream\nendobj\n");

  const contentBytes = encoder.encode(content);
  beginObject(5);
  push(`5 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`);
  push(contentBytes);
  push("\nendstream\nendobj\n");

  const xrefOffset = length;
  push("xref\n0 6\n0000000000 65535 f \n");
  for (let number = 1; number <= 5; number += 1) {
    push(`${String(offsets[number]).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  return new Blob(chunks, { type: "application/pdf" });
}
