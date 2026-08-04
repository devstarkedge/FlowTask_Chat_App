import logger from '../../utils/logger';

export default (socket) => {
  socket.on('presence:online', ({ userId, name }) => {
    logger.info('[SocketPresence] User online:', name);
  });

  socket.on('presence:offline', ({ userId }) => {
    logger.info('[SocketPresence] User offline:', userId);
  });
};
