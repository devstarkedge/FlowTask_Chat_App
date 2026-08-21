export const isCustomStatusValid = (status) => {
  if (!status || !status.text) return false;
  if (status.expiresAt) {
    const expiresAt = new Date(status.expiresAt).getTime();
    if (expiresAt < Date.now()) return false;
  }
  return true;
};
