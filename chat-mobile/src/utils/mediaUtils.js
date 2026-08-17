import ENV from '../config/environment';

/**
 * Normalizes any media URL (relative, protocol-less, socket server relative)
 * into a fully qualified URL loadable by React Native Image/Video/Audio/Fetch.
 */
export const normalizeMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  let trimmed = url.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('content:') ||
    trimmed.startsWith('blob:')
  ) {
    return trimmed;
  }

  const apiBase = ENV.API_BASE_URL || 'https://chat-app-api-cyyl.onrender.com/api/chat';
  const cleanApiBase = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
  const domainBase = cleanApiBase.replace(/\/api\/chat\/?$/i, '');

  // 1. Rewrite any localhost / 127.0.0.1 / 10.0.2.2 / local IP or dev server URLs
  const localIpRegex = /^https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|0\.0\.0\.0|192\.168\.\d{1,3}\.\d{1,3}|172\.\d{1,3}\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?/i;
  if (localIpRegex.test(trimmed)) {
    trimmed = trimmed.replace(localIpRegex, domainBase);
  }

  // 2. Fix missing /api/chat prefix for /uploads and /files relative paths
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
    const relativePath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${cleanApiBase}${relativePath}`;
  }
  if (trimmed.startsWith('/messages/files/') || trimmed.startsWith('messages/files/')) {
    const relativePath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return `${cleanApiBase}${relativePath}`;
  }

  // 3. Upgrade http to https for production & remote hosts
  if (trimmed.startsWith('http://')) {
    if (trimmed.includes('onrender.com') || trimmed.includes('cloudinary.com') || trimmed.includes('amazonaws.com')) {
      trimmed = trimmed.replace('http://', 'https://');
    }
  }

  // 4. If full http/https URL, check if it contains /uploads/ without /api/chat
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    if (trimmed.includes('/uploads/') && !trimmed.includes('/api/chat/uploads/')) {
      trimmed = trimmed.replace('/uploads/', '/api/chat/uploads/');
    }
    return trimmed;
  }

  // 5. General relative paths
  const cleanUrl = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  if (cleanUrl.startsWith('/api/chat')) {
    return `${domainBase}${cleanUrl}`;
  }
  return `${cleanApiBase}${cleanUrl}`;
};

/**
 * Enhanced file kind detection logic based on mime type, file name, and URL.
 */
export function getFileKind(mime = '', name = '', url = '') {
  const cleanMime = (mime || '').toLowerCase();
  const cleanName = (name || '').toLowerCase();
  const cleanUrl = (url || '').toLowerCase();

  const nameExt = (cleanName.split('.').pop() || '').toLowerCase();
  // Strip query params or hash from url before extracting extension
  const urlPath = cleanUrl.split('?')[0].split('#')[0];
  const urlExt = (urlPath.split('.').pop() || '').toLowerCase();

  // Combine extensions to check
  const ext = /^(jpg|jpeg|png|gif|webp|svg|tiff|tif|bmp|ico|heic|heif|avif|dng|raw|mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp|mp3|m4a|wav|aac|ogg|flac|opus|wma|pdf|doc|docx|xls|xlsx|csv|ppt|pptx|zip|rar|tar|gz|7z|bz2|xz|js|ts|jsx|tsx|py|java|c|cpp|cs|go|rs|rb|php|swift|kt|sh|bash|json|xml|html|htm|css|yaml|yml|toml|ini|env|md|mdx|txt)$/.test(nameExt)
    ? nameExt
    : urlExt;

  const isAudioExt = /^(mp3|m4a|wav|aac|ogg|flac|opus|wma)$/.test(ext);
  const isVideoExt = /^(mp4|mov|avi|mkv|webm|flv|wmv|m4v|3gp)$/.test(ext);

  if (cleanMime.startsWith('image/') || /^(jpg|jpeg|png|gif|webp|svg|tiff|tif|bmp|ico|heic|heif|avif|dng|raw)$/.test(ext)) return 'image';
  if (isAudioExt || cleanMime.startsWith('audio/')) return 'audio';
  if (cleanMime.startsWith('video/') || isVideoExt) return 'video';
  if (cleanMime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (/^(doc|docx)$/.test(ext) || cleanMime.includes('word') || cleanMime.includes('msword')) return 'word';
  if (/^(xls|xlsx)$/.test(ext) || cleanMime.includes('excel') || cleanMime.includes('spreadsheet')) return 'spreadsheet';
  if (ext === 'csv') return 'csv';
  if (/^(ppt|pptx)$/.test(ext) || cleanMime.includes('presentation') || cleanMime.includes('powerpoint')) return 'presentation';
  if (/^(zip|rar|tar|gz|7z|bz2|xz)$/.test(ext) || cleanMime.includes('zip') || cleanMime.includes('rar') || cleanMime.includes('tar')) return 'archive';
  if (/^(js|ts|jsx|tsx|py|java|c|cpp|cs|go|rs|rb|php|swift|kt|sh|bash)$/.test(ext)) return 'code';
  if (/^(json|xml|html|htm|css|yaml|yml|toml|ini|env|md|mdx)$/.test(ext)) return 'code';
  if (cleanMime.startsWith('text/') || cleanMime.includes('json') || cleanMime.includes('xml')) return 'code';
  if (ext === 'txt') return 'text';

  // Fallback checks on URL path pattern (e.g., Cloudinary image/video URLs)
  if (cleanUrl.includes('/image/upload/') || cleanUrl.includes('/images/')) return 'image';
  if (cleanUrl.includes('/video/upload/') || cleanUrl.includes('/videos/')) return 'video';
  if (cleanUrl.includes('/raw/upload/') && cleanUrl.includes('.audio')) return 'audio';

  return 'file';
}

export function getCleanFileName(name, originalFileName) {
  const primaryName = originalFileName || name;
  if (!primaryName || typeof primaryName !== 'string') return 'Untitled file';

  let clean = primaryName.split('/').pop().split('\\').pop();

  // Remove UUID prefix: e.g., "38198f39-1bc9-42b7-84bc-2e790fdfcb1f_myfile.png" -> "myfile.png"
  const uuidPrefixRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}[_-]/;
  clean = clean.replace(uuidPrefixRegex, '');

  // Remove MongoDB ObjectId prefix
  const mongoIdPrefixRegex = /^[0-9a-fA-F]{24}[_-]/;
  clean = clean.replace(mongoIdPrefixRegex, '');

  // Remove generated prefixes
  const genPrefixRegex = /^(media|file|pending)_[0-9]+[_-]/i;
  clean = clean.replace(genPrefixRegex, '');

  const pendingRegex = /^pending_[0-9]+_[a-zA-Z0-9]+[_-]/i;
  clean = clean.replace(pendingRegex, '');

  return clean || 'Untitled file';
}

const ALLOWED_MEDIA_DOMAINS = [
  'res.cloudinary.com',
  'chat-app-api-cyyl.onrender.com',
  'localhost',
  '127.0.0.1',
  '10.0.2.2',
];

export function isValidMediaUrl(urlStr) {
  try {
    if (!urlStr || typeof urlStr !== 'string') return false;
    if (!urlStr.startsWith('http://') && !urlStr.startsWith('https://')) return false;

    const cleanUrlPath = urlStr.split('?')[0].split('#')[0];
    const ext = (cleanUrlPath.split('.').pop() || '').toLowerCase();
    const isSupportedExt = /^(jpg|jpeg|png|gif|webp|svg|heic|heif|mp4|mov|avi|mkv|webm|mp3|m4a|wav|pdf|doc|docx|xls|xlsx|csv|zip|rar|tar)$/.test(ext);
    if (!isSupportedExt && !urlStr.includes('/messages/files/')) return false;

    const hostname = urlStr.split('/')[2]?.split(':')[0];
    if (!hostname) return false;

    const isAllowedDomain = ALLOWED_MEDIA_DOMAINS.some(domain =>
      hostname === domain || hostname.endsWith('.' + domain)
    );
    return isAllowedDomain;
  } catch {
    return false;
  }
}

/**
 * Extracts and normalizes all attachments and media items from a message.
 */
export const getMessageAttachments = (msg) => {
  if (!msg) return [];

  const extractFileObject = (item) => {
    if (!item) return null;
    const file = (typeof item.fileId === 'object' && item.fileId) ? item.fileId : item;
    if (!file) return null;

    const rawUrl = file.url || file.secureUrl || file.secure_url || file.path || file.uri || file.location || file.fileUrl || file.downloadUrl;
    if (!rawUrl) return null;

    const url = normalizeMediaUrl(rawUrl);
    const rawThumb = file.thumbnailUrl || file.thumbUrl || file.previewUrl || file.secureUrl || file.secure_url || rawUrl;
    const thumbnailUrl = normalizeMediaUrl(rawThumb);
    
    const rawName = file.originalFileName || file.originalName || file.displayName || file.fileName || file.name || file.filename || '';
    const cleanName = getCleanFileName(rawName);

    return {
      id: file._id || item._id || String(Math.random()),
      _id: file._id || item._id || String(Math.random()),
      originalFileName: cleanName,
      fileName: cleanName,
      originalName: cleanName,
      name: cleanName,
      url,
      secureUrl: url,
      thumbnailUrl: thumbnailUrl || url,
      mimeType: file.mimeType || file.type || file.contentType || '',
      fileSize: file.fileSize || file.size || file.fileSizeBytes || 0,
      status: file.status || 'available',
    };
  };

  // 1. Check fileReferences
  const refs = msg.fileReferences || [];
  let list = [];
  if (refs.length > 0) {
    list = refs.map(extractFileObject).filter(Boolean);
  }

  // 2. Check attachments / files / media if no references found
  if (list.length === 0) {
    const rawAttachments = msg.attachments || msg.files || msg.media || [];
    if (Array.isArray(rawAttachments) && rawAttachments.length > 0) {
      list = rawAttachments.map(extractFileObject).filter(Boolean);
    }
  }

  // 3. Fallback: single media properties attached directly to message
  if (list.length === 0) {
    if (msg.contentType === 'gif' && msg.gifMeta) {
      return [];
    }

    const singleUrl = msg.imageUrl || msg.mediaUrl || msg.videoUrl || msg.audioUrl || msg.fileUrl || msg.audioMeta?.audioUrl || msg.videoMeta?.videoUrl;
    if (singleUrl) {
      const url = normalizeMediaUrl(singleUrl);
      const rawThumb = msg.thumbnailUrl || msg.videoMeta?.thumbnailUrl || singleUrl;
      const rawName = msg.originalFileName || msg.originalName || msg.displayName || msg.fileName || msg.name || '';
      const cleanName = getCleanFileName(rawName);
      list = [{
        id: msg._id || String(Math.random()),
        _id: msg._id || String(Math.random()),
        originalFileName: cleanName,
        fileName: cleanName,
        originalName: cleanName,
        name: cleanName,
        url,
        secureUrl: url,
        thumbnailUrl: normalizeMediaUrl(rawThumb),
        mimeType: msg.mimeType || msg.contentType || '',
        fileSize: msg.fileSize || 0,
        status: 'available',
      }];
    }
  }

  // 4. Fallback: extract images from htmlContent or markdown content
  if (list.length === 0) {
    const htmlContent = msg.htmlContent || '';
    if (htmlContent && typeof htmlContent === 'string') {
      const imgMatches = [...htmlContent.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
      if (imgMatches.length > 0) {
        list = imgMatches.map((m, idx) => {
          const src = m[1];
          const url = normalizeMediaUrl(src);
          return {
            id: `${msg._id || 'img'}-html-${idx}`,
            _id: `${msg._id || 'img'}-html-${idx}`,
            originalFileName: `Image_${idx + 1}.png`,
            fileName: `Image_${idx + 1}.png`,
            originalName: `Image_${idx + 1}.png`,
            name: `Image_${idx + 1}.png`,
            url,
            secureUrl: url,
            thumbnailUrl: url,
            mimeType: 'image/png',
            fileSize: 0,
            status: 'available',
          };
        });
      }
    }
  }

  if (list.length === 0) {
    const textContent = msg.content || '';
    if (textContent && typeof textContent === 'string') {
      const mdMatches = [...textContent.matchAll(/!\[.*?\]\((.*?)\)/gi)];
      if (mdMatches.length > 0) {
        list = mdMatches.map((m, idx) => {
          const src = m[1];
          const url = normalizeMediaUrl(src);
          return {
            id: `${msg._id || 'img'}-md-${idx}`,
            _id: `${msg._id || 'img'}-md-${idx}`,
            originalFileName: `Image_${idx + 1}.png`,
            fileName: `Image_${idx + 1}.png`,
            originalName: `Image_${idx + 1}.png`,
            name: `Image_${idx + 1}.png`,
            url,
            secureUrl: url,
            thumbnailUrl: url,
            mimeType: 'image/png',
            fileSize: 0,
            status: 'available',
          };
        });
      }
    }
  }

  // 5. Fallback: extract any validated, allowlisted URLs from text content
  const textContent = msg.content || '';
  if (list.length === 0 && textContent && typeof textContent === 'string') {
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const matches = [...textContent.matchAll(urlRegex)];
    const extractedList = [];

    for (const m of matches) {
      const rawUrl = m[1];
      if (isValidMediaUrl(rawUrl)) {
        const url = normalizeMediaUrl(rawUrl);
        // Avoid duplicates
        if (extractedList.some(item => item.url === url)) continue;

        const cleanUrlPath = url.split('?')[0].split('#')[0];
        const filename = cleanUrlPath.split('/').pop() || 'file';
        const cleanName = getCleanFileName(filename);
        const ext = (filename.split('.').pop() || '').toLowerCase();
        let mimeType = '';
        if (/^(jpg|jpeg|png|gif|webp|svg|tiff|tif|bmp|ico|heic|heif|avif)$/.test(ext)) {
          mimeType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        }

        extractedList.push({
          id: `${msg._id || 'url'}-ext-${extractedList.length}`,
          _id: `${msg._id || 'url'}-ext-${extractedList.length}`,
          originalFileName: cleanName,
          fileName: cleanName,
          originalName: cleanName,
          name: cleanName,
          url,
          secureUrl: url,
          thumbnailUrl: url,
          mimeType,
          fileSize: 0,
          status: 'available',
        });
      }
    }
    if (extractedList.length > 0) return extractedList;
  }

  return list;
};
