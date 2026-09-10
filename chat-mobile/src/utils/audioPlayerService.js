import { Platform } from 'react-native';
import logger from './logger';

class UniversalAudioPlayer {
  constructor(uri, onStatusUpdate) {
    this.uri = uri;
    this.onStatusUpdate = onStatusUpdate;
    this.isPlaying = false;
    this.durationMillis = 0;
    this.positionMillis = 0;
    this.nativePlayer = null;
    this.webAudio = null;
    this.intervalId = null;
  }

  async init() {
    if (Platform.OS === 'web') {
      this.webAudio = new window.Audio(this.uri);
      this.webAudio.ontimeupdate = () => {
        this.positionMillis = (this.webAudio.currentTime || 0) * 1000;
        this.durationMillis = (this.webAudio.duration || 0) * 1000;
        this.notifyStatus();
      };
      this.webAudio.onended = () => {
        this.isPlaying = false;
        this.positionMillis = this.durationMillis;
        this.notifyStatus({ didJustFinish: true });
      };
      this.webAudio.onerror = (e) => {
        logger.error('[WebAudio] Playback error', e);
        this.notifyStatus({ error: e });
      };
    } else {
      try {
        const expoAudio = require('expo-audio');
        if (expoAudio.setAudioModeAsync) {
          await expoAudio.setAudioModeAsync({ playsInSilentMode: true });
        }
        if (expoAudio.createAudioPlayer) {
          this.nativePlayer = expoAudio.createAudioPlayer(this.uri);
        }
      } catch (err) {
        logger.error('[NativeAudio] Failed to initialize expo-audio', err);
      }
    }
  }

  async play() {
    this.isPlaying = true;
    if (Platform.OS === 'web') {
      if (this.webAudio) {
        await this.webAudio.play();
      }
    } else if (this.nativePlayer) {
      this.nativePlayer.play();
      this.startPolling();
    }
    this.notifyStatus();
  }

  async pause() {
    this.isPlaying = false;
    if (Platform.OS === 'web') {
      if (this.webAudio) {
        this.webAudio.pause();
      }
    } else if (this.nativePlayer) {
      this.nativePlayer.pause();
      this.stopPolling();
    }
    this.notifyStatus();
  }

  async replay() {
    if (Platform.OS === 'web') {
      if (this.webAudio) {
        this.webAudio.currentTime = 0;
        await this.webAudio.play();
      }
    } else if (this.nativePlayer) {
      if (this.nativePlayer.seekTo) {
        this.nativePlayer.seekTo(0);
      }
      this.nativePlayer.play();
      this.startPolling();
    }
    this.isPlaying = true;
    this.notifyStatus();
  }

  async unload() {
    this.stopPolling();
    if (Platform.OS === 'web') {
      if (this.webAudio) {
        this.webAudio.pause();
        this.webAudio = null;
      }
    } else if (this.nativePlayer) {
      try {
        if (this.nativePlayer.release) {
          this.nativePlayer.release();
        } else if (this.nativePlayer.pause) {
          this.nativePlayer.pause();
        }
      } catch (e) {}
      this.nativePlayer = null;
    }
    this.isPlaying = false;
  }

  startPolling() {
    this.stopPolling();
    this.intervalId = setInterval(() => {
      if (this.nativePlayer) {
        this.positionMillis = (this.nativePlayer.currentTime || 0) * 1000;
        this.durationMillis = (this.nativePlayer.duration || 0) * 1000;
        this.isPlaying = this.nativePlayer.playing ?? this.isPlaying;
        this.notifyStatus();
      }
    }, 200);
  }

  stopPolling() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  notifyStatus(extra = {}) {
    if (this.onStatusUpdate) {
      this.onStatusUpdate({
        isLoaded: true,
        isPlaying: this.isPlaying,
        positionMillis: this.positionMillis,
        durationMillis: this.durationMillis,
        ...extra,
      });
    }
  }
}

export const createUniversalAudioSound = async (uri, onStatusUpdate) => {
  const player = new UniversalAudioPlayer(uri, onStatusUpdate);
  await player.init();
  return player;
};
