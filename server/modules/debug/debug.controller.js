import asyncHandler from '../../middleware/asyncHandler.js'
import notificationService from '../notifications/notification.service.js'

// POST /api/chat/debug/notify
// Body: { recipientId: string, title?: string, body?: string }
export const sendDebugNotification = asyncHandler(async (req, res) => {
  const { recipientId, title, body } = req.body || {}
  if (!recipientId) {
    return res.status(400).json({ success: false, error: { message: 'recipientId is required' } })
  }

  const payload = {
    workspaceId: req.workspaceId || null,
    recipientId,
    senderId: req.user?._id || null,
    type: 'dm',
    title: title || 'Test notification',
    body: body || 'This is a debug notification',
  }

  const notif = await notificationService.create(payload)

  res.status(200).json({ success: true, data: { notification: notif } })
})

export default { sendDebugNotification }
