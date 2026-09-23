import { BadRequestException, UnsupportedMediaTypeException } from '@nestjs/common';
import { basename, extname } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';

const PLAIN_TEXT = new Set(['.txt', '.md', '.markdown']);

export interface UploadedText {
  title: string;
  content: string;
}

/** Turns an uploaded .pdf / .txt / .md file into document fields. */
export async function extractUploadedText(file: {
  originalname: string;
  buffer: Buffer;
}): Promise<UploadedText> {
  const name = decodeFilename(file.originalname);
  const extension = extname(name).toLowerCase();
  const title = basename(name, extension).trim() || 'Untitled';

  let content: string;
  if (PLAIN_TEXT.has(extension)) {
    content = file.buffer.toString('utf8');
  } else if (extension === '.pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
    content = (await extractText(pdf, { mergePages: true })).text;
  } else {
    throw new UnsupportedMediaTypeException('Upload a .pdf, .txt or .md file');
  }

  if (content.trim() === '') {
    throw new BadRequestException('No text found in the file (scanned PDFs need OCR first)');
  }
  return { title, content };
}

/** Multipart parsers decode filenames as latin1; recover UTF-8 names such as "Отчёт.pdf". */
function decodeFilename(name: string): string {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('�') ? name : utf8;
}
