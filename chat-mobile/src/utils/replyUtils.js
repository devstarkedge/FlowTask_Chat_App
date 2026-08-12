/**
 * Resolve a display name for a chat message author.
 */
export function resolveMessageSenderName(message, members = []) {
  if (!message) return null;

  const snap = String(message.senderSnapshot?.name || "").trim();
  if (snap && !isGenericName(snap)) return snap;

  if (typeof message.authorId === "object" && message.authorId) {
    const fromAuthor = String(message.authorId.name || "").trim();
    if (fromAuthor && !isGenericName(fromAuthor)) return fromAuthor;
    const email = String(message.authorId.email || "").trim();
    if (email) return email.split("@")[0];
  }

  const authorId =
    message.authorId?._id ||
    message.authorId ||
    message.senderSnapshot?._id ||
    message.replyTo?.authorId ||
    message.replyTo?.senderId ||
    null;

  if (authorId && Array.isArray(members) && members.length > 0) {
    const member = members.find((m) => String(m._id) === String(authorId));
    const memberName = String(member?.name || "").trim();
    if (memberName && !isGenericName(memberName)) return memberName;
    const memberEmail = String(member?.email || "").trim();
    if (memberEmail) return memberEmail.split("@")[0];
  }

  const replyName = String(message.replyTo?.senderName || message.senderName || "").trim();
  if (replyName && !isGenericName(replyName)) return replyName;

  return null;
}

export function isGenericName(name) {
  const n = String(name || "").trim().toLowerCase();
  return (
    !n ||
    n === "user" ||
    n === "someone" ||
    n === "unknown" ||
    n === "unknown user"
  );
}

/** True when attachment snapshot has real media data (not empty Mongoose defaults). */
export function hasValidAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") return false;
  return !!(
    attachment.url ||
    attachment.thumbnailUrl ||
    attachment.fileId ||
    (attachment.name && String(attachment.name).trim()) ||
    (attachment.type && String(attachment.type).trim())
  );
}

/**
 * True when replyTo is a real quote reply — not an empty schema default object.
 * Mongoose nested replyTo often exists as {} with null fields on every message.
 */
export function hasValidReplyTo(replyTo, parentMessageId = null) {
  if (parentMessageId) return true;
  if (!replyTo || typeof replyTo !== "object") return false;
  if (replyTo.messageId) return true;
  const name = String(replyTo.senderName || "").trim();
  const content = String(replyTo.content || "").trim();
  if (name && !isGenericName(name)) return true;
  if (content && content.toLowerCase() !== "message" && content !== "...") return true;
  if (hasValidAttachment(replyTo.attachment)) return true;
  return false;
}

/** Strip HTML tags to plain text for quote previews. */
export function stripToPlainText(htmlOrText) {
  if (!htmlOrText) return "";
  return String(htmlOrText)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Best-effort plain text from a message (content, html, or media label).
 */
export function getMessagePlainText(message) {
  if (!message) return "";
  const direct = String(message.content || "").trim();
  if (direct) return direct;

  const fromHtml = stripToPlainText(message.htmlContent);
  if (fromHtml) return fromHtml;

  if (message.contentType === "gif" || message.gifMeta) return "GIF";
  if (message.contentType === "video" || message.type === "video" || message.videoMeta) return "Video";
  if (message.contentType === "audio" || message.type === "audio" || message.audioMeta) return "Voice note";

  const files = message.attachments || message.fileReferences || [];
  if (files.length > 0) {
    const file = files[0]?.fileId || files[0];
    return file?.originalName || file?.fileName || file?.name || "Attachment";
  }
  if (message.attachmentContext) {
    return (
      message.attachmentContext.name ||
      message.attachmentContext.fileName ||
      message.attachmentContext.originalName ||
      "Attachment"
    );
  }
  return "";
}

function inferAttachmentLabel(attachment) {
  if (!hasValidAttachment(attachment)) return "";
  const name = String(attachment.name || "").trim();
  if (name) return name;
  const type = String(attachment.type || "").toLowerCase();
  if (type.includes("gif")) return "GIF";
  if (type.includes("video")) return "Video";
  if (type.includes("audio")) return "Voice note";
  if (type.includes("image") || type.includes("photo")) return "Photo";
  if (attachment.thumbnailUrl) return "Photo";
  if (attachment.url) return "Attachment";
  return "Attachment";
}

/**
 * Build a replyTo snapshot from a message being replied to.
 * Used for optimistic UI so the quote appears immediately on send.
 */
export function buildReplyToSnapshot(message, members = []) {
  if (!message?._id) return null;

  const authorId =
    message.authorId?._id ||
    message.authorId ||
    message.senderSnapshot?._id ||
    null;

  const senderName =
    resolveMessageSenderName(message, members) || "Someone";

  const attachmentContext = message.attachmentContext;
  let attachment = null;

  if (attachmentContext) {
    attachment = {
      type: attachmentContext.type || attachmentContext.mimeType || "attachment",
      name:
        attachmentContext.name ||
        attachmentContext.fileName ||
        attachmentContext.originalName ||
        "Attachment",
      url: attachmentContext.url || attachmentContext.secureUrl || null,
      thumbnailUrl: attachmentContext.thumbnailUrl || null,
      fileId: attachmentContext._id || attachmentContext.fileId || null,
    };
  } else if (message.gifMeta || message.contentType === "gif") {
    attachment = {
      type: "gif",
      name: "GIF",
      url: message.gifMeta?.gifUrl || message.gifUrl || null,
    };
  } else if (message.videoMeta || message.contentType === "video" || message.type === "video") {
    attachment = {
      type: "video",
      name: "Video",
      url: message.videoUrl || message.videoMeta?.videoUrl || null,
      thumbnailUrl: message.thumbnailUrl || message.videoMeta?.thumbnailUrl || null,
    };
  } else if (message.audioMeta || message.contentType === "audio" || message.type === "audio") {
    attachment = {
      type: "audio",
      name: "Voice note",
      url: message.audioUrl || message.audioMeta?.audioUrl || null,
    };
  } else {
    const files = message.attachments || message.fileReferences || [];
    const first = files[0];
    if (first) {
      const file = first.fileId || first;
      const mime = String(file.mimeType || file.type || "").toLowerCase();
      let type = file.resourceType || "file";
      if (mime.startsWith("image/")) type = "image";
      else if (mime.startsWith("video/")) type = "video";
      else if (mime.startsWith("audio/")) type = "audio";
      attachment = {
        type,
        name: file.originalName || file.fileName || file.name || "Attachment",
        url: file.url || file.secureUrl || null,
        thumbnailUrl: file.thumbnailUrl || (type === "image" ? (file.url || file.secureUrl) : null),
        fileId: file._id || null,
      };
    }
  }

  const content = getMessagePlainText(message);

  return {
    messageId: message._id,
    authorId: authorId || null,
    senderName,
    content: content || (attachment ? inferAttachmentLabel(attachment) : ""),
    ...(hasValidAttachment(attachment) ? { attachment } : {}),
  };
}

/**
 * Human-readable snippet for a replyTo snapshot.
 */
export function getReplyToSnippet(replyTo) {
  if (!replyTo) return "";
  const text = stripToPlainText(replyTo.content);
  if (text && text.toLowerCase() !== "message" && text !== "...") return text;

  const label = inferAttachmentLabel(replyTo.attachment);
  if (label) return label;

  return "";
}

/**
 * Resolve the best display name for a replyTo quote.
 */
export function resolveReplyToSenderName(replyTo, parentMessage = null, members = []) {
  if (!replyTo && !parentMessage) return "Someone";

  const fromParent = resolveMessageSenderName(parentMessage, members);
  if (fromParent) return fromParent;

  const existing = String(replyTo?.senderName || "").trim();
  if (existing && !isGenericName(existing)) return existing;

  const authorId = replyTo?.authorId || replyTo?.senderId;
  if (authorId && Array.isArray(members) && members.length > 0) {
    const member = members.find((m) => String(m._id) === String(authorId));
    const memberName = String(member?.name || "").trim();
    if (memberName && !isGenericName(memberName)) return memberName;
  }

  return existing && !isGenericName(existing) ? existing : "Someone";
}

/**
 * Resolve the best quote content from replyTo + optional parent message.
 */
export function resolveReplyToContent(replyTo, parentMessage = null) {
  const fromReply = stripToPlainText(replyTo?.content);
  if (fromReply && fromReply.toLowerCase() !== "message" && fromReply !== "...") {
    return fromReply;
  }
  const fromParent = getMessagePlainText(parentMessage);
  if (fromParent) return fromParent;

  const label = inferAttachmentLabel(replyTo?.attachment);
  if (label) return label;

  if (parentMessage) {
    const parentSnap = buildReplyToSnapshot(parentMessage);
    if (parentSnap?.content) return parentSnap.content;
    return inferAttachmentLabel(parentSnap?.attachment);
  }

  return fromReply || "";
}

/**
 * Merge parent message media into replyTo.attachment when missing.
 */
export function resolveReplyToAttachment(replyTo, parentMessage = null) {
  if (hasValidAttachment(replyTo?.attachment)) return replyTo.attachment;
  if (!parentMessage) return null;
  const snap = buildReplyToSnapshot(parentMessage);
  return hasValidAttachment(snap?.attachment) ? snap.attachment : null;
}
