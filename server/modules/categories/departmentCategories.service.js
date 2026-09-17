import Category from './Category.model.js';
import Department from './Department.model.js';

/** Keep the selected department grouping current without creating channels. */
export async function ensureDepartmentCategories(workspaceId, userId, categories) {
  // Custom and No Category remain personal choices. Importing departments
  // enables automatic addition of subsequent FlowTask departments.
  if (!categories.some((category) => category.type === 'department')) return false;

  const departments = await Department.find({ workspaceId }).sort({ name: 1 }).lean();
  const imported = new Set(categories
    .filter((category) => category.type === 'department')
    .map((category) => String(category.departmentId?._id || category.departmentId)));
  const names = new Set(categories.map((category) => category.name.toLowerCase()));
  let order = Math.max(-1, ...categories.map((category) => category.order || 0)) + 1;
  const operations = [];

  for (const department of departments) {
    if (imported.has(String(department._id))) continue;
    let name = department.name;
    let suffix = 1;
    while (names.has(name.toLowerCase())) {
      name = suffix === 1 ? `${department.name} (Department)` : `${department.name} (Department ${suffix})`;
      suffix += 1;
    }
    names.add(name.toLowerCase());
    operations.push({ updateOne: {
      filter: { workspaceId, createdBy: userId, type: 'department', departmentId: department._id },
      update: { $setOnInsert: {
        name, icon: department.icon || '📁', color: department.color || '',
        description: department.description || '', order: order++,
      } },
      upsert: true,
    } });
  }
  if (!operations.length) return false;

  try {
    await Category.bulkWrite(operations, { ordered: false });
  } catch (error) {
    // Concurrent refreshes can both attempt the same missing category. The
    // unique department index keeps one mapping; return the persisted result.
    const duplicateRace = error.code === 11000 || (error.writeErrors?.length > 0
      && error.writeErrors.every((entry) => entry.code === 11000));
    if (!duplicateRace) throw error;
  }
  return true;
}
