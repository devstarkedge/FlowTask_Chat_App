import axios from "axios";
import { GifProvider } from "./GifProvider.interface.js";

/**
 * KlipyProvider integrates with the Klipy Media API.
 * https://klipy.com/developers
 *
 * ⚠️  IMPORTANT: The endpoint paths, request parameters, and response schema
 * below are UNVERIFIED. They must be confirmed against the official Klipy API
 * documentation before this provider is used in production.
 *
 * TODO: Verify the following against https://klipy.com/developers:
 *   - Endpoint paths: /search, /featured, /categories (or equivalents)
 *   - Auth mechanism: query param `key`, Bearer token, or other
 *   - Request params: q, limit, offset/pos/cursor, etc.
 *   - Response schema: top-level key for results array, pagination cursor,
 *     per-item fields for id, title, gif URL, preview URL, dimensions
 */
export class KlipyProvider extends GifProvider {
  constructor() {
    super();

    if (!process.env.KLIPY_API_KEY) {
      throw new Error(
        "KLIPY_API_KEY environment variable is required but not set.",
      );
    }

    this.apiKey = process.env.KLIPY_API_KEY;
    // Override via KLIPY_BASE_URL env var if the base URL changes
    this.baseUrl =
      process.env.KLIPY_BASE_URL || "https://api.klipy.com/v2";
  }

  _logError(label, error) {
    console.error(`KlipyProvider ${label} error:`, {
      message: error.message,
      url: error.config?.url,
      params: error.config?.params,
      status: error.response?.status,
      headers: error.response?.headers,
      body: error.response?.data,
    });
  }

  /**
   * Maps a single raw Klipy item to the FlowTask gifMeta schema.
   *
   * ⚠️  Field paths below are UNVERIFIED — update once the actual response
   * schema is confirmed from the Klipy API docs / live response logs.
   */
  _mapItem(item) {
    const toHttps = (url) =>
      url ? url.replace(/^http:\/\//i, "https://") : null;

    // TODO: replace with verified field paths from Klipy API docs
    const gifUrl = toHttps(item.media_formats?.gif?.url ?? null);
    const previewUrl = toHttps(
      item.media_formats?.tinygif?.url ?? gifUrl,
    );

    return {
      id: item.id,
      provider: "klipy",
      providerId: item.id,
      title: item.title ?? "",
      gifUrl,
      previewUrl,
      // TODO: verify dims field path
      width: item.media_formats?.gif?.dims?.[0] ?? 0,
      height: item.media_formats?.gif?.dims?.[1] ?? 0,
    };
  }

  _formatResponse(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item) => this._mapItem(item));
  }

  async search(query, offset = 0, limit = 20) {
    try {
      // TODO: verify endpoint path and param names against Klipy API docs
      const response = await axios.get(`${this.baseUrl}/search`, {
        params: { key: this.apiKey, q: query, limit, pos: offset || undefined },
        headers: { Accept: "application/json" },
      });

      // TODO: verify top-level response keys (results, next, etc.)
      const items = response.data.results;
      return {
        data: this._formatResponse(items),
        pagination: {
          offset: response.data.next ?? offset,
          count: items?.length ?? 0,
          total_count: null, // not provided by Klipy — verify
        },
      };
    } catch (error) {
      this._logError("search", error);
      throw new Error("Failed to fetch GIFs from Klipy");
    }
  }

  async getTrending(offset = 0, limit = 20) {
    try {
      // TODO: verify endpoint path and param names against Klipy API docs
      const response = await axios.get(`${this.baseUrl}/featured`, {
        params: { key: this.apiKey, limit, pos: offset || undefined },
        headers: { Accept: "application/json" },
      });

      // TODO: verify top-level response keys
      const items = response.data.results;
      return {
        data: this._formatResponse(items),
        pagination: {
          offset: response.data.next ?? offset,
          count: items?.length ?? 0,
          total_count: null,
        },
      };
    } catch (error) {
      this._logError("getTrending", error);
      throw new Error("Failed to fetch trending GIFs from Klipy");
    }
  }

  async getCategories() {
    try {
      // TODO: verify endpoint path and param names against Klipy API docs
      const response = await axios.get(`${this.baseUrl}/categories`, {
        params: { key: this.apiKey },
        headers: { Accept: "application/json" },
      });

      // TODO: verify top-level response key and per-item field names
      const raw = response.data.tags;
      const toHttps = (url) =>
        url ? url.replace(/^http:\/\//i, "https://") : null;

      return {
        data: Array.isArray(raw)
          ? raw.map((cat) => ({
              id: cat.searchterm,
              label: cat.name,
              gifUrl: toHttps(cat.image ?? null),
            }))
          : [],
      };
    } catch (error) {
      this._logError("getCategories", error);
      throw new Error("Failed to fetch GIF categories from Klipy");
    }
  }
}
