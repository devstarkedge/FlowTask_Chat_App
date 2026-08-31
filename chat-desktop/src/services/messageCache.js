import { openDB } from 'idb'
import logger from '../utils/logger'

const DB_NAME = 'chatapp-offline-cache'
const DB_VERSION = 1
const CHANNEL_STORE = 'channelMessages'
const MAX_MESSAGES_PER_CHANNEL = 1200

let dbPromise = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(CHANNEL_STORE)) {
          db.createObjectStore(CHANNEL_STORE, { keyPath: 'channelId' })
        }
      },
    })
  }
  return dbPromise
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return []
  const trimmed = messages.slice(-MAX_MESSAGES_PER_CHANNEL)
  return trimmed.filter((message) => !!message?._id)
}

/** IndexedDB only accepts string/number/Date/Array as keys. Guard against objects. */
function isValidKey(id) {
  return id !== null && id !== undefined &&
    typeof id === 'string' &&
    id !== '[object Object]' &&
    id.length > 0
}

export async function loadChannelMessagesFromCache(channelId) {
  if (!isValidKey(channelId)) return []
  try {
    const db = await getDb()
    const record = await db.get(CHANNEL_STORE, channelId)
    return sanitizeMessages(record?.messages || [])
  } catch (error) {
    logger.error('[MessageCache] Failed to load channel cache:', error)
    return []
  }
}

export async function saveChannelMessagesToCache(channelId, messages) {
  if (!isValidKey(channelId)) return
  try {
    const db = await getDb()
    await db.put(CHANNEL_STORE, {
      channelId,
      messages: sanitizeMessages(messages),
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    logger.error('[MessageCache] Failed to persist channel cache:', error)
  }
}

export async function clearMessageCache() {
  try {
    const db = await getDb()
    await db.clear(CHANNEL_STORE)
  } catch (error) {
    logger.error('[MessageCache] Failed to clear IndexedDB cache:', error)
  }
}
