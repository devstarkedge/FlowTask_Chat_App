import { create } from "zustand";
import { canvasAPI } from "../services/api";

export const useCanvasStore = create((set) => ({
  canvases: {},
  activeCanvas: null,
  isLoading: false,

  fetchCanvas: async (channelId) => {},

  createCanvas: async (channelId, data) => {},

  updateCanvas: async (canvasId, data) => {},
}));