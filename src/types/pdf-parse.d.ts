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
