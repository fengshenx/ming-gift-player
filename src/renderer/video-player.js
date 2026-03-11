import { DEFAULT_EXPORT_FPS } from './constants.js';

export class VideoPlayer {
  constructor() {
    this.video = document.createElement('video');
    this.video.crossOrigin = 'anonymous';
    this.video.defaultMuted = false;
    this.video.loop = true;
    this.video.muted = false;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.style.display = 'none';
    this.video.volume = 1;
    document.body.append(this.video);

    this.displayHeight = 0;
    this.displayWidth = 0;
    this.duration = 0;
    this.frameCallbackId = null;
    this.objectUrl = null;
    this.sourceHeight = 0;
    this.sourceWidth = 0;
  }

  async loadFromBlob(blob) {
    this.resetSource();
    this.objectUrl = URL.createObjectURL(blob);
    this.video.src = this.objectUrl;
    this.video.load();

    await new Promise((resolve, reject) => {
      const onLoadedMetadata = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('Failed to load video metadata.'));
      };

      const cleanup = () => {
        this.video.removeEventListener('error', onError);
        this.video.removeEventListener('loadedmetadata', onLoadedMetadata);
      };

      this.video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
      this.video.addEventListener('error', onError, { once: true });
    });

    this.sourceWidth = this.video.videoWidth;
    this.sourceHeight = this.video.videoHeight;
    this.displayWidth = Math.max(1, Math.floor(this.sourceWidth / 2));
    this.displayHeight = this.sourceHeight;
    this.duration = Number.isFinite(this.video.duration) ? this.video.duration : 0;

    await this.seek(0);

    return {
      duration: this.duration,
      fps: DEFAULT_EXPORT_FPS,
      height: this.displayHeight,
      width: this.displayWidth,
    };
  }

  pause() {
    this.video.pause();
  }

  play() {
    return this.video.play();
  }

  resetSource() {
    this.video.pause();

    if (this.frameCallbackId !== null && 'cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.frameCallbackId);
      this.frameCallbackId = null;
    }

    this.video.removeAttribute('src');
    this.video.load();

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
  }

  async seek(time) {
    const targetTime = Math.max(0, Math.min(time, this.duration || 0));

    if (Math.abs(this.video.currentTime - targetTime) < 0.001) {
      return;
    }

    await new Promise((resolve, reject) => {
      const onSeeked = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        reject(new Error('Failed to seek video.'));
      };

      const cleanup = () => {
        this.video.removeEventListener('error', onError);
        this.video.removeEventListener('seeked', onSeeked);
      };

      this.video.addEventListener('seeked', onSeeked, { once: true });
      this.video.addEventListener('error', onError, { once: true });
      this.video.currentTime = targetTime;
    });
  }
}
