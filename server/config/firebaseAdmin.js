import admin from 'firebase-admin'
import fs from 'fs'
import path from 'path'
import logger from '../utils/logger.js'
import env from './environment.js'

function parseServiceAccount(raw) {
  if (!raw) throw new Error('No service account provided')
  const trimmed = String(raw).trim()
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed)
    } catch (err) {
      // Try replacing escaped newlines and parse again
      const fixed = trimmed.replace(/\\n/g, '\n')
      return JSON.parse(fixed)
    }
  }

  // Treat value as a file path
  const filePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed)
  const content = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(content)
}

export function initializeFirebase({ throwOnError = false } = {}) {
  try {
    if (admin && admin.apps && admin.apps.length > 0) {
      logger.debug('Firebase Admin already initialized. Reusing existing app.')
      return admin
    }

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || env.FIREBASE_SERVICE_ACCOUNT || process.env.GOOGLE_APPLICATION_CREDENTIALS || env.GOOGLE_APPLICATION_CREDENTIALS || ''
    if (!raw) {
      logger.info('No Firebase service account configured (FIREBASE_SERVICE_ACCOUNT or GOOGLE_APPLICATION_CREDENTIALS)')
      return null
    }

    const serviceAccount = parseServiceAccount(raw)

    if (serviceAccount.private_key && typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n')
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })

    logger.info('Firebase Admin initialized')
    return admin
  } catch (err) {
    logger.error('Failed to initialize Firebase Admin', { error: err?.message })
    if (throwOnError) throw err
    return null
  }
}

export function getAdmin() {
  return admin
}

export function isInitialized() {
  return Boolean(admin && admin.apps && admin.apps.length > 0)
}

export default { initializeFirebase, getAdmin, isInitialized }
