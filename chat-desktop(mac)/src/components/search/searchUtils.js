function asId(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  return (value._id || value.id || null)?.toString?.() || null
}

export function stripMarkup(value = '') {
  return value
    .toString()
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildScopedSearchQuery(channelId, query, authorId = null) {
  const tokens = []
  if (channelId) tokens.push(`in:${channelId}`)
  if (authorId) tokens.push(`from:${authorId}`)
  if (query?.trim()) tokens.push(query.trim())
  return tokens.join(' ').trim()
}

export function getScopeLabel(channel) {
  if (!channel) return ''
  const name = channel.name || channel.slug || 'Conversation'
  return channel.type === 'dm' ? `in:${name}` : `in:#${name}`
}

export function getScopeTargetLabel(channel) {
  return channel?.type === 'dm' ? 'conversation' : 'channel'
}

export function normalizeSearchMessage(message, fallbackChannel = null) {
  const author = message.authorId && typeof message.authorId === 'object'
    ? message.authorId
    : null
  const senderSnapshot = message.senderSnapshot && typeof message.senderSnapshot === 'object'
    ? message.senderSnapshot
    : null
  const channelRef = message.channelId && typeof message.channelId === 'object'
    ? message.channelId
    : null

  const id = message.id || asId(message._id) || asId(message.messageId)
  const channelId = asId(message.channelId) || fallbackChannel?._id || null

  if (!id || !channelId) return null

  return {
    id,
    type: 'message',
    channelId,
    channelType: message.channelType || channelRef?.type || fallbackChannel?.type || 'channel',
    channelName:
      message.channelName
      || channelRef?.name
      || fallbackChannel?.name
      || fallbackChannel?.slug
      || 'Conversation',
    senderId: asId(message.senderId || message.authorId),
    senderName:
      message.senderName
      || author?.name
      || senderSnapshot?.name
      || 'Someone',
    senderAvatar: message.senderAvatar || senderSnapshot?.avatar || author?.avatar || null,
    snippet: message.snippet || stripMarkup(message.content || message.htmlContent || message.activityMeta?.taskTitle || ''),
    createdAt: message.createdAt || message.updatedAt || null,
    reasonLabel: message.reasonLabel || null,
  }
}

export function normalizeSearchMessages(messages = [], fallbackChannel = null) {
  return messages
    .map((message) => normalizeSearchMessage(message, fallbackChannel))
    .filter(Boolean)
}

export function normalizeRecentMessages(messages = [], channel = null, limit = 12) {
  return [...messages]
    .slice(-limit)
    .reverse()
    .map((message) => normalizeSearchMessage({
      ...message,
      id: message._id,
      reasonLabel: 'Recent message',
    }, channel))
    .filter(Boolean)
}

function normalizeSearchText(value = '') {
  return (value ?? '')
    .toString()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getEntityPriorityScore(item, query) {
  const cleanTerm = (query || '').replace(/^[#@]+/, '').trim();
  const q = normalizeSearchText(cleanTerm);
  if (!q) return 0;

  const rawQuery = (query || '').trim();
  const isExplicitChannel = rawQuery.startsWith('#');
  const isExplicitUser = rawQuery.startsWith('@');
  const type = item.type || (item.channelType === 'dm' ? 'dm' : 'channel');

  if (type === 'channel') {
    const normName = normalizeSearchText(item.name || '');
    const normSlug = normalizeSearchText(item.slug || '');
    const normDesc = normalizeSearchText(item.description || '');
    const normTopic = normalizeSearchText(item.topic || '');
    const nameTokens = normName.split(' ').filter(Boolean);
    const slugTokens = normSlug.split(' ').filter(Boolean);

    let score = 0;
    // 1. Exact channel name match
    if (normName === q || normSlug === q) {
      score = 100000;
    }
    // 2. Partial channel name match
    else if (normName.startsWith(q) || normSlug.startsWith(q)) {
      score = 85000 - Math.min((normName.length - q.length) * 10, 500);
    } else if (nameTokens.some((t) => t.startsWith(q)) || slugTokens.some((t) => t.startsWith(q))) {
      score = 80000;
    } else if (normName.includes(q) || normSlug.includes(q)) {
      score = 75000;
    }
    // 3. Other relevant channel results
    else if (normDesc.includes(q) || normTopic.includes(q)) {
      score = 50000;
    } else if (nameTokens.some((t) => t.includes(q)) || slugTokens.some((t) => t.includes(q))) {
      score = 45000;
    } else {
      return 0;
    }

    if (isExplicitChannel) score += 10000;
    if (isExplicitUser) score -= 20000;
    return score;
  }

  if (type === 'user') {
    const normName = normalizeSearchText(item.name || '');
    const normEmail = normalizeSearchText(item.email || '');
    const emailPrefix = normEmail.split('@')[0] || '';
    const nameTokens = normName.split(' ').filter(Boolean);

    let score = 0;
    // 1. Exact person name match
    if (normName === q || emailPrefix === q || nameTokens.some((t) => t === q)) {
      score = 100000;
    }
    // 2. Partial person name match
    else if (normName.startsWith(q) || emailPrefix.startsWith(q)) {
      score = 85000 - Math.min((normName.length - q.length) * 10, 500);
    } else if (nameTokens.some((t) => t.startsWith(q))) {
      score = 80000;
    } else if (normName.includes(q) || normEmail.includes(q)) {
      score = 75000;
    } else {
      return 0;
    }

    if (isExplicitUser) score += 10000;
    if (isExplicitChannel) score -= 20000;
    return score;
  }

  if (type === 'dm') {
    const normName = normalizeSearchText(item.name || '');
    const nameTokens = normName.split(' ').filter(Boolean);

    let score = 0;
    // 1. Exact person / DM conversation name match
    if (normName === q || nameTokens.some((t) => t === q)) {
      score = 90000;
    }
    // 2. Partial person / DM name match
    else if (normName.startsWith(q)) {
      score = 75000 - Math.min((normName.length - q.length) * 10, 500);
    } else if (nameTokens.some((t) => t.startsWith(q))) {
      score = 72000;
    } else if (normName.includes(q)) {
      score = 65000;
    } else {
      return 0;
    }

    if (isExplicitUser) score += 10000;
    if (isExplicitChannel) score -= 20000;
    return score;
  }

  if (type === 'project') {
    const normName = normalizeSearchText(item.name || '');
    const normDesc = normalizeSearchText(item.description || '');
    let score = 0;
    if (normName === q) score = 45000;
    else if (normName.startsWith(q)) score = 43000;
    else if (normName.includes(q)) score = 41000;
    else if (normDesc.includes(q)) score = 40000;
    else return 0;
    return score;
  }

  if (type === 'file' || type === 'link' || type === 'page') {
    const name = normalizeSearchText(item.name || item.title || item.label || '');
    let score = 0;
    if (name === q) score = 25000;
    else if (name.startsWith(q)) score = 23000;
    else if (name.includes(q)) score = 21000;
    else return 0;
    return score;
  }

  if (type === 'message') {
    return 1000;
  }

  return 0;
}

export function prioritizeGlobalResults(results, query) {
  if (!query?.trim()) return results;
  const q = normalizeSearchText(query.replace(/^[#@]+/, '').trim());
  if (!q) return results;

  const topMatches = Array.isArray(results.topMatches) ? [...results.topMatches] : [];
  const users = Array.isArray(results.users) ? [...results.users] : [];
  const channels = Array.isArray(results.channels) ? [...results.channels] : [];
  const dms = Array.isArray(results.dms) ? [...results.dms] : [];
  const messages = Array.isArray(results.messages) ? [...results.messages] : [];
  const files = Array.isArray(results.files) ? [...results.files] : [];
  const links = Array.isArray(results.links) ? [...results.links] : [];
  const pages = Array.isArray(results.pages) ? [...results.pages] : [];

  const candidates = [...topMatches, ...users, ...channels, ...dms];
  const seen = new Set();
  const dedupedCandidates = candidates.filter((item) => {
    const id = item.id || item._id;
    const key = `${item.type || 'item'}:${id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const rankedCandidates = dedupedCandidates
    .filter((item) => getEntityPriorityScore(item, query) > 0)
    .sort((a, b) => {
      const scoreA = getEntityPriorityScore(a, query);
      const scoreB = getEntityPriorityScore(b, query);
      if (scoreB !== scoreA) return scoreB - scoreA;
      const timeB = new Date(b.lastMessageAt || b.createdAt || 0).getTime();
      const timeA = new Date(a.lastMessageAt || a.createdAt || 0).getTime();
      return timeB - timeA;
    });

  const finalTopMatches = [];
  const topKeys = new Set();
  const seenPersonIds = new Set();
  const seenPersonNames = new Set();

  for (const item of rankedCandidates) {
    if (finalTopMatches.length >= 5) break;
    const score = getEntityPriorityScore(item, query);
    if (score >= 40000) {
      // Deduplicate person between user and 1-on-1 dm
      if (item.type === 'user') {
        const userId = (item.id || item._id)?.toString();
        const normName = normalizeSearchText(item.name || '');
        if ((userId && seenPersonIds.has(userId)) || (normName && seenPersonNames.has(normName))) {
          continue;
        }
        if (userId) seenPersonIds.add(userId);
        if (normName) seenPersonNames.add(normName);
      } else if (item.type === 'dm') {
        const recipId = item.dmRecipientId?.toString();
        const normName = normalizeSearchText(item.name || '');
        if ((recipId && seenPersonIds.has(recipId)) || (normName && seenPersonNames.has(normName))) {
          continue;
        }
        if (recipId) seenPersonIds.add(recipId);
        if (normName) seenPersonNames.add(normName);
      }

      finalTopMatches.push(item);
      topKeys.add(`${item.type}:${item.id || item._id}`);
    }
  }

  for (const item of messages) {
    if (finalTopMatches.length >= 5) break;
    const key = `message:${item.id || item._id}`;
    if (!topKeys.has(key)) {
      finalTopMatches.push(item);
      topKeys.add(key);
    }
  }

  if (finalTopMatches.length === 0) {
    for (const item of topMatches) {
      if (finalTopMatches.length >= 5) break;
      if (item.type === 'message' || getEntityPriorityScore(item, query) > 0) {
        finalTopMatches.push(item);
      }
    }
  }

  const filteredUsers = users.filter((u) => getEntityPriorityScore(u, query) > 0);
  const filteredChannels = channels.filter((c) => getEntityPriorityScore(c, query) > 0);
  const filteredDms = dms.filter((d) => getEntityPriorityScore(d, query) > 0);

  return {
    ...results,
    topMatches: finalTopMatches,
    users: filteredUsers,
    channels: filteredChannels,
    dms: filteredDms,
    messages,
    files,
    links,
    pages,
  };
}
