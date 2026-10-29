// Type stubs for parser libraries that ship without TypeScript types.
declare module "pdf-parse/lib/pdf-parse.js" {
  const pdfParse: (data: Buffer) => Promise<{ text: string; numpages: number }>;
  export default pdfParse;
}

declare module "word-extractor" {
  export default class WordExtractor {
    extract(source: Buffer | string): Promise<{ getBody(): string }>;
  }
}
