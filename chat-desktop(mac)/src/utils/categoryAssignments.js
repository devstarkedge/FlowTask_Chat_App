function idOf(value) {
  if (value == null) return null;
  if (typeof value === 'object') return idOf(value._id ?? value.id);
  const id = String(value);
  return id && id !== '[object Object]' ? id : null;
}

export function getCustomCategoryOwners(categories, preferredCategoryId = null) {
  const items = Array.isArray(categories) ? categories : [];
  const preferredId = idOf(preferredCategoryId);
  const preferred = preferredId
    ? items.find((category) => idOf(category?._id) === preferredId)
    : null;
  const ordered = preferred
    ? [preferred, ...items.filter((category) => category !== preferred)]
    : items;
  const owners = new Map();

  ordered.forEach((category) => {
    if (category?.type !== 'custom') return;
    const categoryId = idOf(category._id);
    if (!categoryId) return;
    (category.channelIds || []).forEach((channelId) => {
      const id = idOf(channelId);
      if (id && !owners.has(id)) owners.set(id, categoryId);
    });
  });

  return owners;
}

export function normalizeCategoryAssignments(categories, preferredCategoryId = null) {
  const items = Array.isArray(categories) ? categories : [];
  const owners = getCustomCategoryOwners(items, preferredCategoryId);

  return items.map((category) => {
    if (category?.type !== 'custom') return category;
    const categoryId = idOf(category._id);
    const seen = new Set();
    const channelIds = (category.channelIds || []).filter((channelId) => {
      const id = idOf(channelId);
      if (!id || seen.has(id) || owners.get(id) !== categoryId) return false;
      seen.add(id);
      return true;
    });
    return channelIds.length === (category.channelIds || []).length
      ? category
      : { ...category, channelIds };
  });
}

export function moveChannelsToCategory(categories, targetCategoryId, channelIds, serverCategory = null) {
  const targetId = idOf(targetCategoryId);
  const movedIds = new Set((channelIds || []).map(idOf).filter(Boolean));
  let foundTarget = false;

  const moved = (Array.isArray(categories) ? categories : []).map((category) => {
    if (category?.type !== 'custom') return category;
    const categoryId = idOf(category._id);
    if (categoryId === targetId) {
      foundTarget = true;
      if (serverCategory) return serverCategory;
      const existingIds = new Set((category.channelIds || []).map(idOf).filter(Boolean));
      movedIds.forEach((id) => existingIds.add(id));
      return { ...category, channelIds: [...existingIds] };
    }
    return {
      ...category,
      channelIds: (category.channelIds || []).filter((channelId) => !movedIds.has(idOf(channelId))),
    };
  });

  if (!foundTarget && serverCategory) moved.push(serverCategory);
  return normalizeCategoryAssignments(moved, targetId);
}

export { idOf as categoryAssignmentId };
