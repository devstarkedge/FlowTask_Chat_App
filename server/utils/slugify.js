import { CHANNEL_NAME } from '../config/constants.js';

/**
 * Deterministic channel slug generator per FlowTask integration spec §4.2.
 *
 * Rules:
 *  1. Lowercase
 *  2. Replace spaces/underscores with hyphens
 *  3. Strip non-alphanumeric (except hyphens)
 *  4. Collapse consecutive hyphens
 *  5. Trim leading/trailing hyphens
 *  6. Truncate to 80 characters
 *  7. On collision, append -{last4chars_of_entityId}
 */

/**
 * Convert a raw string to a URL-safe slug segment.
 * @param {string} input
 * @returns {string}
 */
export function slugify(input) {
  if (!input || typeof input !== 'string') return '';

  return input
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, '-')           // spaces/underscores → hyphens
    .replace(/[^a-z0-9-]/g, '')        // strip non-alphanumeric (keep hyphens)
    .replace(/-{2,}/g, '-')            // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '');          // trim leading/trailing hyphens
}

/**
 * Generate a project channel slug.
 * Pattern: flowtask-{department_slug}-{project_slug}
 *
 * @param {string} departmentName
 * @param {string} projectName
 * @param {string} [boardId] - Used as collision suffix (last 4 chars)
 * @returns {string}
 */
export function projectChannelSlug(departmentName, projectName, boardId = '') {
  const deptSlug = slugify(departmentName);
  const projSlug = slugify(projectName);

  let slug = `${CHANNEL_NAME.PREFIX}${deptSlug}-${projSlug}`;

  if (slug.length > CHANNEL_NAME.MAX_LENGTH) {
    slug = slug.substring(0, CHANNEL_NAME.MAX_LENGTH);
    // Clean up trailing hyphen from truncation
    slug = slug.replace(/-+$/, '');
  }

  return slug;
}

/**
 * Append a collision suffix derived from the entity ID.
 * @param {string} slug
 * @param {string} entityId
 * @returns {string}
 */
export function appendCollisionSuffix(slug, entityId) {
  const suffix = `-${entityId.slice(-4)}`;
  const maxBase = CHANNEL_NAME.MAX_LENGTH - suffix.length;
  const base = slug.substring(0, maxBase).replace(/-+$/, '');
  return `${base}${suffix}`;
}

/**
 * Generate a department channel slug.
 * Pattern: flowtask-dept-{department_slug}
 * @param {string} departmentName
 * @returns {string}
 */
export function departmentChannelSlug(departmentName) {
  const slug = `${CHANNEL_NAME.DEPT_PREFIX}${slugify(departmentName)}`;
  return slug.substring(0, CHANNEL_NAME.MAX_LENGTH);
}

/**
 * Generate a team channel slug.
 * Pattern: flowtask-team-{team_slug}
 * @param {string} teamName
 * @returns {string}
 */
export function teamChannelSlug(teamName) {
  const slug = `${CHANNEL_NAME.TEAM_PREFIX}${slugify(teamName)}`;
  return slug.substring(0, CHANNEL_NAME.MAX_LENGTH);
}
