const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_RESUME_CHARS = 20_000;

export type PdfErrorCode =
  | "INVALID_TYPE"
  | "TOO_LARGE"
  | "PARSE_FAILED"
  | "PASSWORD_PROTECTED"
  | "EMPTY";

export class PdfExtractionError extends Error {
  code: PdfErrorCode;

  constructor(code: PdfErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

function normalizePdfText(value: string) {
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * iOS Safari (and some other mobile contexts) hand us PDFs with `file.type` set
 * to "" or "application/octet-stream" instead of "application/pdf" — especially
 * when the file was opened from Mail, shared from iCloud Drive, or saved via
 * "Save to Files". We fall back to the `.pdf` extension in those cases so the
 * upload works across platforms.
 */
function looksLikePdf(file: File) {
  if (file.type === "application/pdf") return true;
  if (file.type === "" || file.type === "application/octet-stream") {
    return file.name.toLowerCase().endsWith(".pdf");
  }
  return false;
}

export async function extractPdfText(file: File): Promise<{
  text: string;
  pages: number;
  truncated: boolean;
}> {
  if (typeof window === "undefined") {
    throw new PdfExtractionError("PARSE_FAILED", "PDF extraction is only available in the browser.");
  }

  if (!looksLikePdf(file)) {
    throw new PdfExtractionError("INVALID_TYPE", "Please upload a PDF file.");
  }

  if (file.size > MAX_PDF_BYTES) {
    throw new PdfExtractionError("TOO_LARGE", "PDF must be 10MB or smaller.");
  }

  try {
    // IMPORTANT: use the `legacy/` build, NOT the default build. The modern
    // pdfjs-dist v5 bundle uses JS features (e.g. numeric-separator adjacent
    // to identifiers) that iOS Safari's worker parser rejects with
    // "No identifiers allowed directly after numeric literal" → manifests to
    // users as a generic "Setting up fake worker failed" and the PDF never
    // loads. The legacy build is transpiled to be compatible with Safari.
    // See mozilla/pdf.js issues #19699, #20306.
    const [{ getDocument, GlobalWorkerOptions }, pdfWorkerModule] = await Promise.all([
      import("pdfjs-dist/legacy/build/pdf.mjs"),
      import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
    ]);
    GlobalWorkerOptions.workerSrc = pdfWorkerModule.default;

    const data = await file.arrayBuffer();
    const loadingTask = getDocument({ data });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const text = await page.getTextContent();
      pages.push(
        text.items
          .map((item) => (typeof item === "object" && "str" in item ? String(item.str) : ""))
          .join(" "),
      );
    }

    const normalized = normalizePdfText(pages.join("\n\n"));
    if (!normalized) {
      throw new PdfExtractionError(
        "EMPTY",
        "This PDF appears to be image-only or empty. Please upload a text-based PDF.",
      );
    }

    const truncated = normalized.length > MAX_RESUME_CHARS;
    const text = truncated ? normalized.slice(0, MAX_RESUME_CHARS) : normalized;

    return { text, pages: pdf.numPages, truncated };
  } catch (error) {
    if (error instanceof PdfExtractionError) throw error;
    if (error instanceof Error && error.name === "PasswordException") {
      throw new PdfExtractionError(
        "PASSWORD_PROTECTED",
        "This PDF is password-protected. Please remove the password and try again.",
      );
    }
    // Surface the underlying message so we can diagnose platform-specific
    // failures (iOS Safari worker issues, memory errors, corrupt PDFs, etc.)
    // instead of always showing the same generic string.
    const detail = error instanceof Error ? error.message : "Unknown error";
    console.error("[pdf] extraction failed:", error);
    throw new PdfExtractionError(
      "PARSE_FAILED",
      `Could not read this PDF (${detail}). Please try a different file.`,
    );
  }
}
