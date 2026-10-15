import Huddle from './Huddle.model.js';
import {AppError} from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';
import {mediaSettings} from './huddleMediaConfig.js';

let initialization;
export function initializeHuddles() {
  // autoIndex is disabled in production. Never accept starts without the
  // race-preventing index, and keep an optional feature failure out of chat.
  initialization ||= Huddle.createIndexes().then(()=>{
    // Log operational identity, never tokens, node URLs or signing secrets.
    const revision=/^[a-f\d]{7,64}$/i.test(process.env.RENDER_GIT_COMMIT || '')?process.env.RENDER_GIT_COMMIT:undefined;
    try {
      const settings=mediaSettings();
      logger.info('Huddle runtime configuration',{mediaMode:settings.mode,maxPeers:settings.maxPeers,
        presenceMode:process.env.HUDDLE_PRESENCE_MODE || (process.env.NODE_ENV==='production'?'redis':'memory'),...(revision?{revision}:{})});
    }catch(error){logger.warn('Huddle media configuration unavailable',{code:error.code || 'HUDDLE_CONFIG',...(revision?{revision}:{})});}
  }).catch(error=>{
    logger.error('Huddle index initialization failed',{code:error.code || 'HUDDLE_INDEX'});
    throw new AppError('Huddles are unavailable. Contact your administrator.',503,'HUDDLE_UNAVAILABLE');
  });
  return initialization;
}
