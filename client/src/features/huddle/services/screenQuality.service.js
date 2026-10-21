// Favor readable text over frame rate. The network can still limit actual quality.
export const SCREEN_CAPTURE_VIDEO = {width:{ideal:3840},height:{ideal:2160},frameRate:{ideal:15,max:30}};
export const SCREEN_MAX_BITRATE = 8_000_000;
export const SCREEN_ENCODING = {maxBitrate:SCREEN_MAX_BITRATE,maxFramerate:30,scaleResolutionDownBy:1};

export function prepareScreenTrack(track) {
  if(track)track.contentHint='detail';
}

export async function configureScreenSender(sender) {
  if(!sender?.track || !sender.getParameters || !sender.setParameters)return;
  const parameters=sender.getParameters();
  // A newly reserved transceiver has no negotiated encoding yet.
  if(!parameters.encodings?.length)return;
  parameters.degradationPreference='maintain-resolution';
  parameters.encodings=parameters.encodings.map(encoding=>({...encoding,...SCREEN_ENCODING}));
  await sender.setParameters(parameters);
}
