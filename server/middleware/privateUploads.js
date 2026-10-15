// Temporary upload/quarantine bytes are never a public asset store. Legacy
// files need a trusted FileAsset mapping before authenticated delivery is safe.
export function denyPublicUploads(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(410).json({success:false,error:{code:'PRIVATE_FILE_REQUIRED',message:'This legacy file link is unavailable. Ask the sender to share it again using protected file storage.'}});
}
