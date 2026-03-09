import { WORKSPACE_LIMITS } from '../config/constants.js';

/**
 * requirePlan — middleware that checks if the workspace's plan is one of the allowed plans.
 *
 * @param  {...string} plans - Allowed plan names (e.g., 'pro', 'enterprise')
 * @returns {Function} Express middleware
 */
export const requirePlan = (...plans) => {
  if (plans.length === 0) {
    throw new Error('requirePlan() called with no plan names — this would block all requests. Provide at least one plan name.');
  }
  return (req, res, next) => {
    if (!req.workspace) {
      return res.status(400).json({
        success: false,
        message: 'Workspace context required.',
      });
    }

    const currentPlan = req.workspace.plan || 'free';
    if (!plans.includes(currentPlan)) {
      return res.status(403).json({
        success: false,
        message: `This feature requires one of: ${plans.join(', ')}. Current plan: ${currentPlan}`,
        code: 'PLAN_REQUIRED',
      });
    }

    next();
  };
};

/**
 * requireFeature — middleware that checks if the workspace's plan includes a specific feature.
 *
 * @param {string} featureName - Feature flag name (e.g., 'customEmoji', 'videoCall')
 * @returns {Function} Express middleware
 */
export const requireFeature = (featureName) => {
  return (req, res, next) => {
    if (!req.workspace) {
      return res.status(400).json({
        success: false,
        message: 'Workspace context required.',
      });
    }

    const currentPlan = req.workspace.plan || 'free';
    const planConfig = WORKSPACE_LIMITS[currentPlan];

    if (!planConfig || !planConfig.features?.[featureName]) {
      return res.status(403).json({
        success: false,
        message: `Feature "${featureName}" is not available on the ${currentPlan} plan. Please upgrade.`,
        code: 'FEATURE_UNAVAILABLE',
        requiredFeature: featureName,
      });
    }

    next();
  };
};
