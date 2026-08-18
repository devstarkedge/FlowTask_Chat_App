/**
 * File preview detection — aligned with Web App FilePreviewRenderer.jsx
 */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/svg+xml', 'image/webp'];
export const VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export const AUDIO_TYPES = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/flac', 'audio/aac'];
export const TEXT_CODE_TYPES = [
  'text/plain', 'text/csv', 'text/markdown', 'text/html', 'text/css',
  'text/javascript', 'application/javascript', 'text/typescript',
  'text/x-python', 'text/x-java-source', 'text/x-c', 'text/x-scss',
  'text/x-sql', 'text/yaml', 'application/x-yaml', 'text/x-env',
  'application/json', 'application/xml',
];
export const TEXT_EXTS = [
  'txt', 'md', 'json', 'xml', 'js', 'jsx', 'ts', 'tsx', 'py', 'java',
  'c', 'cpp', 'css', 'scss', 'html', 'sql', 'yaml', 'yml', 'env', 'csv', 'log',
];

export const LANGUAGE_LABELS = {
  js: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  java: 'Java',
  c: 'C',
  cpp: 'C++',
  json: 'JSON',
  xml: 'XML',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sql: 'SQL',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  txt: 'Plain Text',
  csv: 'CSV',
  env: 'Environment',
  log: 'Log',
};

export function getFileExtension(name = '') {
  const ext = (name.split('.').pop() || '').toLowerCase();
  return ext !== name.toLowerCase() ? ext : '';
}

export function getFileDisplayName(file) {
  return file?.originalName || file?.originalFileName || file?.fileName || file?.name || 'File';
}

export function getLanguageLabelFromExt(ext) {
  return LANGUAGE_LABELS[ext] || (ext ? ext.toUpperCase() : 'Text');
}

export function getFilePreviewInfo(file) {
  if (!file) {
    return {
      kind: 'none',
      ext: '',
      mime: '',
      isImage: false,
      isSvg: false,
      isVideo: false,
      isAudio: false,
      isPdf: false,
      isText: false,
      isCsv: false,
      isJson: false,
      isXlsx: false,
      isDocx: false,
      isArchive: false,
      isPresentation: false,
      isSupported: false,
      canCopyText: false,
    };
  }

  const mime = (file.mimeType || file.type || file.contentType || '').toLowerCase();
  const ext = getFileExtension(getFileDisplayName(file));
  const isSvg = mime === 'image/svg+xml' || ext === 'svg';
  const isImage = IMAGE_TYPES.some((type) => mime === type || mime.startsWith(type.split('/')[0])) ||
    ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'tiff', 'tif', 'bmp', 'ico', 'heic', 'heif', 'avif'].includes(ext);
  const isVideo = VIDEO_TYPES.some((type) => mime === type || mime.startsWith('video/')) ||
    ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v', '3gp', 'flv', 'wmv'].includes(ext);
  const isAudio = AUDIO_TYPES.some((type) => mime === type || mime.startsWith('audio/')) ||
    ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'opus', 'wma'].includes(ext);
  const isPdf = mime === 'application/pdf' || ext === 'pdf';
  const isCsv = mime === 'text/csv' || ext === 'csv';
  const isJson = mime === 'application/json' || ext === 'json';
  const isArchive = ['zip', 'rar', 'tar', 'gz', '7z', 'bz2', 'xz'].includes(ext) ||
    mime.includes('zip') || mime.includes('rar') || mime.includes('tar') || mime.includes('compressed');
  const isPresentation = ['ppt', 'pptx'].includes(ext) ||
    mime.includes('presentation') || mime.includes('powerpoint');
  const isText = !isSvg && (
    TEXT_CODE_TYPES.some((type) => mime === type || mime.startsWith('text/')) ||
    TEXT_EXTS.includes(ext)
  );
  const isXlsx = [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ].includes(mime) || ['xls', 'xlsx'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet');
  const isDocx = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ].includes(mime) || ['doc', 'docx'].includes(ext) || mime.includes('word') || mime.includes('msword');

  let kind = 'file';
  if (isImage) kind = 'image';
  else if (isVideo) kind = 'video';
  else if (isAudio) kind = 'audio';
  else if (isPdf) kind = 'pdf';
  else if (isXlsx) kind = 'spreadsheet';
  else if (isDocx) kind = 'word';
  else if (isCsv) kind = 'csv';
  else if (isPresentation) kind = 'presentation';
  else if (isArchive) kind = 'archive';
  else if (isText) kind = 'code';

  const isSupported = isImage || isVideo || isAudio || isPdf || isText || isCsv || isXlsx || isDocx;

  return {
    kind,
    ext,
    mime,
    isImage,
    isSvg,
    isVideo,
    isAudio,
    isPdf,
    isText,
    isCsv,
    isJson,
    isXlsx,
    isDocx,
    isArchive,
    isPresentation,
    isSupported,
    canCopyText: isText || isCsv,
  };
}

export function formatPreviewError(error) {
  if (!error) return 'Failed to load preview';
  const message = typeof error === 'string' ? error : error.message || 'Failed to load preview';
  if (message.includes('HTTP 502') || message.includes('status 502')) {
    return 'The server encountered an error while fetching the file. Try downloading or retrying.';
  }
  if (message.includes('401') || message.includes('403')) {
    return 'Access denied. Please check your permissions.';
  }
  if (message.includes('404')) {
    return 'File not found. It may have been deleted.';
  }
  return message;
}
