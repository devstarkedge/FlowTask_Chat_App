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

  // replyTo snapshot may already carry a good name
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
      type: attachmentContext.type || "attachment",
      name:
        attachmentContext.name ||
        attachmentContext.fileName ||
        attachmentContext.originalName ||
        "Media attached",
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
      name: "Audio Voice Note",
      url: message.audioUrl || message.audioMeta?.audioUrl || null,
    };
  } else {
    const files = message.attachments || message.fileReferences || [];
    const first = files[0];
    if (first) {
      const file = first.fileId || first;
      attachment = {
        type: file.resourceType || "attachment",
        name: file.originalName || file.fileName || file.name || "Media attached",
        url: file.url || file.secureUrl || null,
        thumbnailUrl: file.thumbnailUrl || null,
        fileId: file._id || null,
      };
    }
  }

  const rawContent = (message.content || "").trim();
  const fromHtml = message.htmlContent
    ? String(message.htmlContent)
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
  const content = rawContent || fromHtml;

  return {
    messageId: message._id,
    authorId: authorId || null,
    senderName,
    content: content || (attachment ? "" : "..."),
    ...(attachment && { attachment }),
  };
}

/**
 * Human-readable snippet for a replyTo snapshot.
 */
export function getReplyToSnippet(replyTo) {
  if (!replyTo) return "";
  const text = String(replyTo.content || "")
    .replace(/\s+/g, " ")
    .trim();
  if (text) return text;
  if (replyTo.attachment?.name) return replyTo.attachment.name;
  if (replyTo.attachment?.type === "gif") return "GIF";
  if (replyTo.attachment?.type === "video") return "Video";
  if (replyTo.attachment?.type === "audio") return "Voice note";
  if (replyTo.attachment) return "Media attached";
  return "Message";
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

  return existing || "Someone";
}
