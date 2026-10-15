import { ForbiddenError } from '../../middleware/errorHandler.js';

export function assertCloudinaryDeliveryUrl(value, cloudName) {
  let url;
  try {url = new URL(value);} catch {throw new ForbiddenError('Invalid file URL');}
  const path = url.pathname;
  const resource = encodeURIComponent(cloudName || '');
  if (!cloudName || url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !(
    (url.hostname === 'res.cloudinary.com' && path.startsWith(`/${resource}/`)) ||
    (url.hostname === 'api.cloudinary.com' && path.startsWith(`/v1_1/${resource}/`))
  )) throw new ForbiddenError('Invalid file delivery origin');
  return url;
}
