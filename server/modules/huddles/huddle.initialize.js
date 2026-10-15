import Huddle from './Huddle.model.js';
import {AppError} from '../../middleware/errorHandler.js';
import logger from '../../utils/logger.js';

let initialization;
export function initializeHuddles() {
  // autoIndex is disabled in production. Never accept starts without the
  // race-preventing index, and keep an optional feature failure out of chat.
  initialization ||= Huddle.createIndexes().catch(error=>{
    logger.error('Huddle index initialization failed',{code:error.code || 'HUDDLE_INDEX'});
    throw new AppError('Huddles are unavailable. Contact your administrator.',503,'HUDDLE_UNAVAILABLE');
  });
  return initialization;
}
