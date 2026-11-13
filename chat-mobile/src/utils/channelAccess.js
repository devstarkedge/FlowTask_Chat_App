export function getErrorStatus(error) {
  return error?.response?.status ?? error?.status ?? null;
}

export function isCanceledError(error) {
  return (
    error?.name === 'CanceledError' ||
    error?.code === 'ERR_CANCELED' ||
    Boolean(error?.__CANCEL__)
  );
}

export function isChannelAccessDeniedError(error) {
  const status = getErrorStatus(error);
  return status === 403 || status === 404;
}

export function shouldRetryChannelQuery(failureCount, error, maxRetries = 1) {
  if (isCanceledError(error)) return false;
  const status = getErrorStatus(error);
  if (status === 401 || status === 403 || status === 404) return false;
  return failureCount < maxRetries;
}
