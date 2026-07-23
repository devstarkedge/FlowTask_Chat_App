import Department from "./Department.model.js";
import flowtaskService from "../flowtask/flowtask.service.js";
import logger from "../../utils/logger.js";

function isDuplicateKeyRace(error) {
  if (error?.code === 11000) return true;
  return Array.isArray(error?.writeErrors)
    && error.writeErrors.length > 0
    && error.writeErrors.every((writeError) => writeError?.code === 11000);
}

/**
 * Synchronizes FlowTask's active department directory into ChatApp.
 * 
 * @param {string} workspaceId - The workspace to sync departments for.
 */
export const syncDepartments = async (workspaceId) => {
  if (!workspaceId) {
    throw new Error("workspaceId is required for syncing departments.");
  }

  try {
    const result = await flowtaskService.getPublicDepartments();
    const externalDepartments = Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
        ? result.data
        : [];

    const normalizedDepartments = externalDepartments
      .map((department) => {
        const normalized = {
          externalId: String(department?._id || department?.id || '').trim(),
          name: String(department?.name || 'Unnamed Department').trim(),
        };

        // The public FlowTask endpoint currently returns only id + name. Keep
        // richer values already cached in ChatApp instead of blanking them.
        for (const field of ['description', 'color', 'icon']) {
          if (department?.[field] !== undefined) normalized[field] = department[field] || '';
        }
        return normalized;
      })
      .filter((department) => department.externalId);

    if (normalizedDepartments.length > 0) {
      const syncTime = new Date();
      const bulkOps = normalizedDepartments.map((department) => ({
        updateOne: {
          filter: { externalId: department.externalId, workspaceId },
          update: {
            $set: {
              name: department.name,
              provider: 'flowtask',
              lastSyncTime: syncTime,
              ...Object.fromEntries(
                ['description', 'color', 'icon']
                  .filter((field) => Object.hasOwn(department, field))
                  .map((field) => [field, department[field]]),
              ),
            },
          },
          upsert: true,
        },
      }));

      try {
        await Department.bulkWrite(bulkOps, { ordered: false });
      } catch (error) {
        if (!isDuplicateKeyRace(error)) throw error;
        logger.info('Concurrent FlowTask department sync reused existing records', {
          workspaceId: workspaceId.toString(),
        });
      }
    }

    const departments = await Department.find({ workspaceId }).sort({ name: 1 }).lean();

    logger.info('FlowTask department sync completed', {
      workspaceId: workspaceId.toString(),
      received: externalDepartments.length,
      upserted: normalizedDepartments.length,
      available: departments.length,
    });
    return {
      success: true,
      count: normalizedDepartments.length,
      data: departments,
      message: normalizedDepartments.length === 0
        ? 'No FlowTask departments are available for this user.'
        : undefined,
    };

  } catch (error) {
    const cachedDepartments = await Department.find({ workspaceId }).sort({ name: 1 }).lean();
    const logContext = {
      error: error.message,
      status: error.response?.status,
      workspaceId: workspaceId.toString(),
    };

    if (cachedDepartments.length > 0) {
      logger.warn('FlowTask department refresh failed; serving cached departments', logContext);
      return {
        success: true,
        count: 0,
        data: cachedDepartments,
        stale: true,
        warning: error.message,
      };
    }

    logger.error('Failed to synchronize FlowTask departments', logContext);
    return { success: false, error: error.message, status: error.response?.status };
  }
};
