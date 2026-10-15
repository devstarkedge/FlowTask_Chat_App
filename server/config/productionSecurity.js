export function validateProductionSecrets(source) {
  if (source.NODE_ENV !== 'production') return;
  for (const key of ['JWT_SECRET','JWT_REFRESH_SECRET',...(source.FLOWTASK_ENABLED === 'true' ? ['FLOWTASK_JWT_SECRET','FLOWTASK_WEBHOOK_SECRET'] : [])]) {
    const secret = source[key];
    if (typeof secret !== 'string' || secret.length < 32 || /^(change.?me|replace|your[_-]|example|test[_-])/i.test(secret)) throw new Error(`Production requires a strong ${key} of at least 32 characters`);
  }
  if (source.JWT_SECRET === source.JWT_REFRESH_SECRET) throw new Error('Production access and refresh signing secrets must differ');
}
