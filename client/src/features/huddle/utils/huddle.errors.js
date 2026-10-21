export class HuddleError extends Error {
  constructor(code,message,cause) {
    super(message,{cause});
    this.name='HuddleError';
    this.code=code;
  }
}

export function mediaError(error) {
  const failures={
    NotAllowedError:['MIC_PERMISSION_DENIED','Microphone access was denied. Allow your headset or computer microphone in browser and device settings, or select Join without microphone.'],
    NotFoundError:['MEDIA_DEVICE_NOT_FOUND','No microphone was found. Connect a headset with a microphone or enable your computer’s built-in microphone. You can also select Join without microphone to listen and share your screen.'],
    NotReadableError:['MEDIA_DEVICE_UNAVAILABLE','The microphone is busy or unavailable. Close other recording apps, or select Join without microphone.'],
  };
  const [code,message]=failures[error.name] || [error.code || 'SIGNALING_FAILED',error.message];
  return new HuddleError(code,message,error);
}
