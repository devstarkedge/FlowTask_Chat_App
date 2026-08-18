import * as FileSystem from 'expo-file-system/legacy';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export function parseCsv(text) {
  return text.split('\n').filter(Boolean).map((line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1];
      if (ch === '"' && next === '"') {
        current += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    }
    result.push(current.trim());
    return result;
  });
}

export function sanitizeDocxHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/\s+on\w+="[^"]*"/gi, '')
    .replace(/\s+on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

export async function readLocalFileAsArrayBuffer(localPath) {
  const base64 = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function readLocalFileAsText(localPath) {
  return FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function loadTextContent(localPath) {
  return readLocalFileAsText(localPath);
}

export async function loadCsvRows(localPath) {
  const text = await readLocalFileAsText(localPath);
  return parseCsv(text);
}

export async function loadXlsxSheets(localPath) {
  const buffer = await readLocalFileAsArrayBuffer(localPath);
  const workbook = XLSX.read(buffer, { type: 'array' });
  return workbook.SheetNames.map((name) => ({
    name,
    data: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }),
  }));
}

export async function loadDocxHtml(localPath) {
  const buffer = await readLocalFileAsArrayBuffer(localPath);
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return sanitizeDocxHtml(result.value);
}

export function prettyPrintJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
