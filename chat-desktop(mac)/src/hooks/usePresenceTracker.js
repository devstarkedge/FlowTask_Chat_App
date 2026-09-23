import { useEffect, useRef } from 'react';
import { getSocket } from '../services/socket';

const IDLE_TIMEOUT = 10 * 60 * 1000; // 10 minutes
const HEARTBEAT_INTERVAL = 2 * 60 * 1000; // 2 minutes

export function usePresenceTracker() {
  const lastActivity = useRef(Date.now());
  const idleTimer = useRef(null);
  const heartbeatTimer = useRef(null);
  const isIdle = useRef(false);

  useEffect(() => {
    const handleActivity = () => {
      lastActivity.current = Date.now();
      
      if (isIdle.current) {
        // We were idle, but just became active. Tell server immediately.
        isIdle.current = false;
        const socket = getSocket();
        if (socket && socket.connected) {
          socket.emit('presence:activity');
        }
      }
    };

    // Throttle the actual DOM event listeners if needed, but passive true is usually fine
    // for just recording Date.now().
    window.addEventListener('mousemove', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('click', handleActivity, { passive: true });

    heartbeatTimer.current = setInterval(() => {
      const socket = getSocket();
      if (Date.now() - lastActivity.current < IDLE_TIMEOUT) {
        if (!isIdle.current && socket && socket.connected) {
          socket.emit('presence:activity');
        }
      } else {
        if (!isIdle.current && socket && socket.connected) {
          isIdle.current = true;
          socket.emit('presence:idle');
        }
      }
    }, HEARTBEAT_INTERVAL);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('click', handleActivity);
      clearInterval(heartbeatTimer.current);
      clearTimeout(idleTimer.current);
    };
  }, []);
}
