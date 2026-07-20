import axios from "axios";
import Department from "./Department.model.js";
import logger from "../../utils/logger.js";

/**
 * Synchronizes departments from the external API (e.g. ProofHub/Trello replica)
 * into the local Department collection.
 * 
 * @param {string} workspaceId - The workspace to sync departments for.
 */
export const syncDepartments = async (workspaceId) => {
  if (!workspaceId) {
    throw new Error("workspaceId is required for syncing departments.");
  }

  const apiUrl = process.env.EXTERNAL_DEPARTMENTS_API_URL;
  if (!apiUrl) {
    logger.warn("EXTERNAL_DEPARTMENTS_API_URL is not configured. Skipping department sync.");
    return { success: false, message: "Sync URL not configured" };
  }

  try {
    const response = await axios.get(apiUrl);
    
    // Assume response data is either an array of departments or { data: [...] }
    let externalDepartments = [];
    if (Array.isArray(response.data)) {
      externalDepartments = response.data;
    } else if (response.data && Array.isArray(response.data.data)) {
      externalDepartments = response.data.data;
    } else {
      throw new Error("Invalid response format from external API");
    }

    if (externalDepartments.length === 0) {
      return { success: true, count: 0, message: "No departments found to sync." };
    }

    const bulkOps = externalDepartments.map(extDept => {
      return {
        updateOne: {
          filter: { externalId: extDept._id?.toString() || extDept.id?.toString(), workspaceId },
          update: {
            $set: {
              name: extDept.name || 'Unnamed Department',
              description: extDept.description || '',
              // Just use some defaults if none provided by API
              provider: extDept.provider || 'proofhub',
              color: extDept.color || '',
              icon: extDept.icon || '',
              lastSyncTime: new Date()
            }
          },
          upsert: true
        }
      };
    });

    const result = await Department.bulkWrite(bulkOps);
    
    logger.info(`Department sync completed. Upserted ${bulkOps.length} departments.`);
    return { success: true, count: bulkOps.length, result };

  } catch (error) {
    logger.error("Failed to sync departments:", error.message);
    return { success: false, error: error.message };
  }
};
