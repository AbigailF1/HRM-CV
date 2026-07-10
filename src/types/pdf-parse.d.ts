declare module "pdf-parse" {
  export type PdfParseResult = {
    text: string;
    numpages?: number;
    info?: unknown;
    metadata?: unknown;
  };

  const pdfParse: (buffer: Buffer) => Promise<PdfParseResult>;
  export default pdfParse;
}

declare module "pdf-parse/lib/pdf-parse.js" {
  import pdfParse from "pdf-parse";

  export default pdfParse;
}
