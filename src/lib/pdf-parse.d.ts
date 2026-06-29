declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfResult {
    numpages: number
    numrender: number
    info: Record<string, unknown>
    metadata: Record<string, unknown>
    text: string
  }
  interface PdfOptions {
    pagerender?: (pageData: unknown) => Promise<string>
    max?: number
  }
  function pdfParse(data: Buffer | string, options?: PdfOptions): Promise<PdfResult>
  export default pdfParse
}
