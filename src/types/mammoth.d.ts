declare module "mammoth" {
  export type ExtractRawTextResult = {
    value: string;
    messages: unknown[];
  };

  export const extractRawText: (input: { buffer: Buffer }) => Promise<ExtractRawTextResult>;
}
