export function sortCategoriesByOrder(categories = []) {
  if (!Array.isArray(categories)) return [];
  return [...categories].sort((a, b) => (a?.order ?? 999) - (b?.order ?? 999));
}

export function getChannelsForDepartmentCategory(category, channels = []) {
  if (category?.type !== 'department' || !Array.isArray(channels)) return [];

  const departmentId = String(
    category.departmentId?.externalId
      || category.departmentId?._id
      || category.departmentId
      || '',
  );
  if (!departmentId || departmentId === 'undefined' || departmentId === 'null') return [];

  return channels.filter((channel) => {
    if (channel.type === 'dm' || channel.type === 'self' || channel.isArchived) return false;

    const flowTaskDepartmentId = String(
      channel.flowTaskRef?.entityId?._id || channel.flowTaskRef?.entityId || '',
    );
    const isDepartmentChannel = channel.flowTaskRef?.entityType === 'department'
      && flowTaskDepartmentId === departmentId;
    const channelDepartmentId = String(
      channel.departmentRef?.departmentId?._id || channel.departmentRef?.departmentId || '',
    );
    const isProjectInDepartment = channel.departmentRef?.departmentId
      && channelDepartmentId === departmentId;

    return isDepartmentChannel || isProjectInDepartment;
  });
}

export function getHomeVisibleCategories(categories = [], channels = []) {
  return sortCategoriesByOrder(categories).filter((category) => (
    category.type !== 'department'
      || getChannelsForDepartmentCategory(category, channels).length > 0
  ));
}

export function findCategoryForDept(dept, categoriesList = []) {
  if (!dept || !Array.isArray(categoriesList)) return null;
  const deptId = String(dept._id || '');
  const extId = String(dept.externalId || '');
  const deptName = (dept.name || '').trim().toLowerCase();

  return (
    categoriesList.find((cat) => {
      const catDeptId = String(cat?.departmentId?._id || cat?.departmentId || '');
      const catExtId = String(cat?.departmentId?.externalId || '');
      const catName = (cat?.name || '').trim().toLowerCase();

      if (deptId && (catDeptId === deptId || catExtId === deptId)) return true;
      if (extId && (catDeptId === extId || catExtId === extId)) return true;
      if (deptName && catName === deptName) return true;
      return false;
    }) || null
  );
}

export function sortDepartmentsByCategoryOrder(departments = [], categories = []) {
  if (!Array.isArray(departments) || departments.length === 0) return [];
  const sortedCategories = sortCategoriesByOrder(categories);

  return [...departments].sort((a, b) => {
    const catA = findCategoryForDept(a, sortedCategories);
    const catB = findCategoryForDept(b, sortedCategories);

    const idxA = catA ? sortedCategories.indexOf(catA) : 9999;
    const idxB = catB ? sortedCategories.indexOf(catB) : 9999;

    if (idxA !== idxB) return idxA - idxB;
    return (a?.name || '').localeCompare(b?.name || '');
  });
}

export function buildCategoryOrdersFromDepts(reorderedDepts = [], categories = []) {
  const categoryOrders = [];
  const matchedCategoryIds = new Set();

  reorderedDepts.forEach((dept) => {
    const cat = findCategoryForDept(dept, categories);
    if (cat && !matchedCategoryIds.has(String(cat._id))) {
      categoryOrders.push({ id: cat._id, order: categoryOrders.length });
      matchedCategoryIds.add(String(cat._id));
    }
  });

  let nextOrder = categoryOrders.length;
  sortCategoriesByOrder(categories).forEach((cat) => {
    if (!matchedCategoryIds.has(String(cat._id))) {
      categoryOrders.push({ id: cat._id, order: nextOrder++ });
    }
  });

  return categoryOrders;
}

export function buildCategoryOrdersFromList(reorderedCategories = []) {
  if (!Array.isArray(reorderedCategories)) return [];
  return reorderedCategories.map((cat, index) => ({
    id: cat._id,
    order: index,
  }));
}
