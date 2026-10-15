// Transport retries belong to the Socket.IO Manager. Authentication failures
// must verify the current session before attempting a manual reconnect.
export function bindSocketRecovery(socket, { getAuth, refreshSession, setStatus, isCurrent, log }) {
  let pending = null, rejectedToken = null, disposed = false, blocked = false;
  const current = () => !disposed && isCurrent();
  const recover = () => {
    if (!current()) return Promise.resolve();
    if (pending) return pending;
    const before = getAuth();
    if (!before.token || !before.workspaceId || rejectedToken === before.token) {
      blocked = true;
      setStatus('recovery_required');
      return Promise.resolve();
    }
    rejectedToken = before.token;
    setStatus('connecting');
    pending = Promise.resolve().then(refreshSession).then(() => {
      if (!current()) return;
      const auth = getAuth();
      if (!auth.token || auth.workspaceId !== before.workspaceId) return;
      socket.auth = auth;
      if (!socket.connected) socket.connect();
    }).catch(error => {
      if (!current()) return;
      log('auth_recovery_failed', { message: error.message });
      blocked = true;
      setStatus('recovery_required');
    }).finally(() => { pending = null; });
    return pending;
  };
  const attempt = number => {
    if (!current()) return;
    socket.auth = getAuth();
    setStatus('connecting');
    log('reconnect_attempt', { attempt: number });
  };
  const failed = () => {
    if (current()) { blocked = true; setStatus('recovery_required'); }
  };
  const connected = () => { rejectedToken = null; blocked = false; };
  const serverError = error => {
    if (/session limit reached/i.test(error?.message || '')) failed();
  };
  const disconnected = reason => {
    if (current() && reason !== 'io client disconnect') {
      log('disconnected', { reason, transport: socket.io.engine?.transport?.name || 'unknown',
        online: typeof navigator === 'undefined' ? true : navigator.onLine });
    }
  };
  const error = error => {
    if (!current()) return;
    if (/auth|token|unauthorized/i.test(error.message || '')) recover();
    else if (!socket.active) failed();
  };
  socket.io.on('reconnect_attempt', attempt);
  socket.io.on('reconnect_failed', failed);
  socket.on('connect', connected);
  socket.on('connect_error', error);
  socket.on('auth:expired', recover);
  socket.on('error', serverError);
  socket.on('disconnect', disconnected);
  return {
    get isRecovering() { return Boolean(pending); },
    get isBlocked() { return blocked; },
    dispose() {
      disposed = true;
      socket.io.off('reconnect_attempt', attempt);
      socket.io.off('reconnect_failed', failed);
      socket.off('connect', connected);
      socket.off('connect_error', error);
      socket.off('auth:expired', recover);
      socket.off('error', serverError);
      socket.off('disconnect', disconnected);
    },
  };
}
