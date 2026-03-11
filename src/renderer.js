function decodeBase64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

function getVideoMimeType(fileName) {
  const extension = fileName.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    default:
      return 'video/mp4';
  }
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${error}`);
  }

  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${error}`);
  }

  return program;
}

class VideoPlayer {
  constructor() {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.crossOrigin = 'anonymous';
    this.video.loop = true;
    this.video.style.display = 'none';
    document.body.appendChild(this.video);

    this.objectURL = null;
    this.sourceWidth = 0;
    this.sourceHeight = 0;
    this.displayWidth = 0;
    this.displayHeight = 0;
    this.duration = 0;
    this.frameCallbackId = null;
  }

  async loadFromBlob(blob) {
    this.resetSource();
    this.objectURL = URL.createObjectURL(blob);
    this.video.src = this.objectURL;
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
        this.video.removeEventListener('loadedmetadata', onLoadedMetadata);
        this.video.removeEventListener('error', onError);
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
      width: this.displayWidth,
      height: this.displayHeight,
      duration: this.duration,
      fps: 30,
    };
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
        this.video.removeEventListener('seeked', onSeeked);
        this.video.removeEventListener('error', onError);
      };

      this.video.addEventListener('seeked', onSeeked, { once: true });
      this.video.addEventListener('error', onError, { once: true });
      this.video.currentTime = targetTime;
    });
  }

  play() {
    return this.video.play();
  }

  pause() {
    this.video.pause();
  }

  resetSource() {
    this.video.pause();
    if (this.frameCallbackId !== null && 'cancelVideoFrameCallback' in this.video) {
      this.video.cancelVideoFrameCallback(this.frameCallbackId);
      this.frameCallbackId = null;
    }
    this.video.removeAttribute('src');
    this.video.load();

    if (this.objectURL) {
      URL.revokeObjectURL(this.objectURL);
      this.objectURL = null;
    }
  }
}

class WebGLCompositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      premultipliedAlpha: false,
      alpha: true,
      antialias: true,
    });

    if (!this.gl) {
      throw new Error('WebGL is not available in this renderer.');
    }

    this.videoWidth = 640;
    this.videoHeight = 480;
    this.videoTexture = this.createTexture();
    this.vertexSource = `
      attribute vec2 a_position;
      attribute vec2 a_texCoord;
      varying vec2 v_texCoord;

      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
      }
    `;
    this.program = createProgram(this.gl, this.vertexSource, `
      precision mediump float;

      uniform sampler2D u_video;
      uniform vec4 u_videoRect;
      varying vec2 v_texCoord;

      void main() {
        bool outsideVideo =
          v_texCoord.x < u_videoRect.x ||
          v_texCoord.x > u_videoRect.x + u_videoRect.z ||
          v_texCoord.y < u_videoRect.y ||
          v_texCoord.y > u_videoRect.y + u_videoRect.w;

        if (outsideVideo) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
          return;
        }

        vec2 videoCoord = vec2(
          (v_texCoord.x - u_videoRect.x) / u_videoRect.z,
          (v_texCoord.y - u_videoRect.y) / u_videoRect.w
        );

        vec2 alphaCoord = vec2(videoCoord.x * 0.5, videoCoord.y);
        vec2 colorCoord = vec2(videoCoord.x * 0.5 + 0.5, videoCoord.y);

        vec4 colorSample = texture2D(u_video, colorCoord);
        vec3 alphaSample = texture2D(u_video, alphaCoord).rgb;
        float alpha = dot(alphaSample, vec3(0.299, 0.587, 0.114));
        alpha = clamp(alpha, 0.0, 1.0);

        gl_FragColor = vec4(colorSample.rgb, alpha);
      }
    `);

    const vertices = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0,
    ]);

    this.buffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

    this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
    this.texCoordLocation = this.gl.getAttribLocation(this.program, 'a_texCoord');
    this.videoSamplerLocation = this.gl.getUniformLocation(this.program, 'u_video');
    this.videoRectLocation = this.gl.getUniformLocation(this.program, 'u_videoRect');

    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  bindGeometry(positionLocation, texCoordLocation) {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.enableVertexAttribArray(positionLocation);
    this.gl.vertexAttribPointer(positionLocation, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(texCoordLocation);
    this.gl.vertexAttribPointer(texCoordLocation, 2, this.gl.FLOAT, false, 16, 8);
  }

  createTexture() {
    const texture = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      1,
      1,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255])
    );
    return texture;
  }

  setVideoSize(width, height) {
    this.videoWidth = width;
    this.videoHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  render(videoElement) {
    const gl = this.gl;
    const packedVideoWidth = Math.max(1, videoElement.videoWidth || this.videoWidth);
    const packedVideoHeight = Math.max(1, videoElement.videoHeight || this.videoHeight);
    const displayVideoWidth = packedVideoWidth / 2;
    const scaledVideoHeight = this.videoWidth * (packedVideoHeight / displayVideoWidth);
    const normalizedHeight = scaledVideoHeight / this.videoHeight;
    const videoBottom = 1.0 - normalizedHeight;
    const videoHeight = normalizedHeight;

    gl.viewport(0, 0, this.videoWidth, this.videoHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    this.bindGeometry(this.positionLocation, this.texCoordLocation);
    gl.uniform4f(this.videoRectLocation, 0, videoBottom, 1, videoHeight);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoElement);
    gl.uniform1i(this.videoSamplerLocation, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

const state = {
  videoLoaded: false,
  playing: false,
  looping: true,
  currentTime: 0,
  duration: 0,
  videoName: '',
  animationId: null,
  player: null,
  compositor: null,
};

const elements = {
  dropZone: document.getElementById('drop-zone'),
  canvas: document.getElementById('video-canvas'),
  videoInfo: document.getElementById('video-info'),
  videoName: document.getElementById('video-name'),
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingMessage: document.getElementById('loading-message'),
  loadingProgress: document.getElementById('loading-progress'),
  exportOverlay: document.getElementById('export-overlay'),
  btnLoadVideo: document.getElementById('btn-load-video'),
  btnPlay: document.getElementById('btn-play'),
  btnStop: document.getElementById('btn-stop'),
  btnLoop: document.getElementById('btn-loop'),
  btnExport: document.getElementById('btn-export'),
  iconPlay: document.getElementById('icon-play'),
  iconPause: document.getElementById('icon-pause'),
  timeCurrent: document.getElementById('time-current'),
  timeTotal: document.getElementById('time-total'),
  progressBar: document.getElementById('progress-bar'),
  progressFill: document.getElementById('progress-fill'),
};

function showLoading(message, showProgress = false) {
  if (elements.loadingMessage) elements.loadingMessage.textContent = message;
  if (elements.loadingProgress) elements.loadingProgress.classList.toggle('hidden', !showProgress);
  if (elements.loadingOverlay) elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  if (elements.loadingOverlay) elements.loadingOverlay.classList.add('hidden');
}

function updateUI() {
  if (elements.videoInfo) elements.videoInfo.classList.toggle('hidden', !state.videoLoaded);
  if (elements.videoName) elements.videoName.textContent = state.videoName;
  if (elements.dropZone) elements.dropZone.classList.toggle('has-video', state.videoLoaded);
  elements.iconPlay.classList.toggle('hidden', state.playing);
  elements.iconPause.classList.toggle('hidden', !state.playing);
  elements.btnLoop.classList.toggle('active', state.looping);
  elements.btnExport.disabled = true;
  elements.timeCurrent.textContent = formatTime(state.currentTime);
  elements.timeTotal.textContent = formatTime(state.duration);

  const progress = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
  elements.progressFill.style.width = `${progress}%`;
}

function renderCurrentFrame() {
  if (!state.player || !state.compositor || !state.videoLoaded) {
    return;
  }

  state.compositor.render(state.player.video);
}

function stopAnimationLoop() {
  if (state.animationId) {
    cancelAnimationFrame(state.animationId);
    state.animationId = null;
  }

  if (state.player && state.player.frameCallbackId !== null && 'cancelVideoFrameCallback' in state.player.video) {
    state.player.video.cancelVideoFrameCallback(state.player.frameCallbackId);
    state.player.frameCallbackId = null;
  }
}

function startAnimationLoop() {
  stopAnimationLoop();

  const tick = () => {
    if (!state.player || !state.playing) {
      return;
    }

    state.currentTime = state.player.video.currentTime;
    renderCurrentFrame();
    updateUI();

    if ('requestVideoFrameCallback' in state.player.video) {
      state.player.frameCallbackId = state.player.video.requestVideoFrameCallback(() => {
        tick();
      });
      return;
    }

    state.animationId = requestAnimationFrame(tick);
  };

  if ('requestVideoFrameCallback' in state.player.video) {
    state.player.frameCallbackId = state.player.video.requestVideoFrameCallback(() => {
      tick();
    });
    return;
  }

  state.animationId = requestAnimationFrame(tick);
}

async function attachVideoBlob(blob, name) {
  showLoading('Loading video...');

  const player = state.player || new VideoPlayer();
  state.player = player;

  const info = await player.loadFromBlob(blob);

  if (!state.compositor) {
    state.compositor = new WebGLCompositor(elements.canvas);
  }

  state.compositor.setVideoSize(375, 815);

  player.video.loop = state.looping;
  player.video.onended = () => {
    state.playing = false;
    stopAnimationLoop();
    state.currentTime = state.duration;
    renderCurrentFrame();
    updateUI();
  };
  state.videoLoaded = true;
  state.videoName = name;
  state.duration = info.duration;
  state.currentTime = 0;
  state.playing = false;

  renderCurrentFrame();
  updateUI();
  hideLoading();

  try {
    await player.play();
    state.playing = true;
    startAnimationLoop();
    updateUI();
  } catch (error) {
    console.error('Error auto-playing video:', error);
  }
}

async function handleLoadVideo() {
  try {
    const result = await window.electronAPI.openVideo();
    if (!result) {
      return;
    }

    const bytes = decodeBase64ToUint8Array(result.data);
    const blob = new Blob([bytes], { type: getVideoMimeType(result.name) });
    await attachVideoBlob(blob, result.name);
  } catch (error) {
    console.error('Error loading video:', error);
    hideLoading();
    alert(`Error loading video: ${error.message}`);
  }
}

async function handlePlayPause() {
  if (!state.videoLoaded || !state.player) {
    return;
  }

  if (state.playing) {
    state.player.pause();
    state.playing = false;
    stopAnimationLoop();
    updateUI();
    return;
  }

  try {
    await state.player.play();
    state.playing = true;
    startAnimationLoop();
    updateUI();
  } catch (error) {
    console.error('Error playing video:', error);
    alert(`Error playing video: ${error.message}`);
  }
}

async function handleStop() {
  if (!state.player) {
    return;
  }

  state.player.pause();
  state.playing = false;
  stopAnimationLoop();
  await state.player.seek(0);
  state.currentTime = 0;
  renderCurrentFrame();
  updateUI();
}

function handleToggleLoop() {
  state.looping = !state.looping;

  if (state.player) {
    state.player.video.loop = state.looping;
  }

  updateUI();
}

function handleExport() {
  alert('Export is not implemented in the WebGL preview pipeline yet.');
}

async function handleProgressClick(event) {
  if (!state.videoLoaded || !state.player || state.duration === 0) {
    return;
  }

  const rect = elements.progressBar.getBoundingClientRect();
  const percentage = (event.clientX - rect.left) / rect.width;
  const newTime = percentage * state.duration;

  state.player.pause();
  state.playing = false;
  stopAnimationLoop();
  await state.player.seek(newTime);
  state.currentTime = state.player.video.currentTime;
  renderCurrentFrame();
  updateUI();
}

function setupDragAndDrop() {
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });

  elements.dropZone.addEventListener('dragenter', () => {
    elements.dropZone.classList.add('drag-over');
  });

  elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('drag-over');
  });

  elements.dropZone.addEventListener('drop', async (event) => {
    elements.dropZone.classList.remove('drag-over');
    const file = event.dataTransfer.files[0];

    if (!file || !file.type.startsWith('video/')) {
      alert('Please drop a video file');
      return;
    }

    try {
      await attachVideoBlob(file, file.name);
    } catch (error) {
      console.error('Error loading dropped video:', error);
      hideLoading();
      alert(`Error loading video: ${error.message}`);
    }
  });
}

function init() {
  elements.btnLoadVideo.addEventListener('click', handleLoadVideo);
  elements.btnPlay.addEventListener('click', handlePlayPause);
  elements.btnStop.addEventListener('click', handleStop);
  elements.btnLoop.addEventListener('click', handleToggleLoop);
  elements.btnExport.addEventListener('click', handleExport);
  elements.progressBar.addEventListener('click', handleProgressClick);

  setupDragAndDrop();
  
  if (!state.compositor) {
    state.compositor = new WebGLCompositor(elements.canvas);
    state.compositor.setVideoSize(375, 815);
  }

  updateUI();
}

init();
