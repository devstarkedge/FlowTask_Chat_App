/**
 * CanvasEditor — Re-export shim.
 *
 * Points to CanvasPage (the slim root orchestrator) which replaces
 * the old EnterpriseCanvasEditor monolith.  All consumers import
 * CanvasEditor and get the refactored version transparently.
 *
 * Migration safety: all props are identical to EnterpriseCanvasEditor.
 */
export { default } from "./editor/CanvasPage";