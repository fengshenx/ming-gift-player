import { APP_WIDTH, BACKGROUND_HEIGHT } from './renderer/constants.js';
import { elements } from './renderer/dom-elements.js';
import { blobToBase64, decodeBase64ToUint8Array, getVideoMimeType } from './renderer/file-utils.js';
import {
  createCanvas,
  createCanvasStream,
  drawPackedVideoToContext,
  getExportMimeType,
  requestStreamFrame,
  waitForEvent,
} from './renderer/media-utils.js';
import { createInitialState } from './renderer/ui-state.js';
import { VideoPlayer } from './renderer/video-player.js';
import { WebGlCompositor } from './renderer/webgl-compositor.js';

const state = createInitialState();

function hideLoading() {
  elements.loadingOverlay?.classList.add('hidden');
}

function renderCurrentFrame() {
  if (!state.compositor || !state.player || !state.videoLoaded) {
    return;
  }

  state.compositor.render(state.player.video);
}

function showLoading(message, showProgress = false) {
  if (elements.loadingMessage) {
    elements.loadingMessage.textContent = message;
  }

  if (elements.loadingProgress) {
    elements.loadingProgress.classList.toggle('hidden', !showProgress);
  }

  elements.loadingOverlay?.classList.remove('hidden');
}

function updateUi() {
  elements.dropZone?.classList.toggle('has-video', state.videoLoaded);
  elements.iconPlay?.classList.toggle('hidden', state.playing);
  elements.iconPause?.classList.toggle('hidden', !state.playing);
  elements.btnLoop?.classList.toggle('active', state.looping);

  if (elements.btnExport) {
    elements.btnExport.disabled = !state.videoLoaded || state.exporting;
  }

  if (elements.btnLoadVideo) {
    elements.btnLoadVideo.disabled = state.exporting;
  }

  if (elements.btnPlay) {
    elements.btnPlay.disabled = !state.videoLoaded || state.exporting;
  }

  if (elements.btnStop) {
    elements.btnStop.disabled = !state.videoLoaded || state.exporting;
  }

  if (elements.btnLoop) {
    elements.btnLoop.disabled = state.exporting;
  }
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
  if (!state.player) {
    return;
  }

  stopAnimationLoop();

  const tick = () => {
    if (!state.player || !state.playing) {
      return;
    }

    state.currentTime = state.player.video.currentTime;
    renderCurrentFrame();
    updateUi();

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

async function loadBackgroundImage() {
  if (state.backgroundImage) {
    return state.backgroundImage;
  }

  const img = new Image();
  img.src = new URL('./assets/background.png', import.meta.url).href;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to load background image.'));
  });

  state.backgroundImage = await createImageBitmap(img);
  return state.backgroundImage;
}

function handleResize() {
  if (!state.compositor || !elements.canvasContainer) {
    return;
  }

  const width = elements.canvasContainer.clientWidth;
  const height = elements.canvasContainer.clientHeight;

  if (width > 0 && height > 0) {
    state.compositor.setVideoSize(width, height);
    renderCurrentFrame();
  }
}

function ensureCompositor() {
  if (state.compositor) {
    return;
  }

  if (!elements.canvas) {
    throw new Error('Canvas element is missing.');
  }

  state.compositor = new WebGlCompositor(elements.canvas);

  const container = elements.canvasContainer;
  const width = container ? container.clientWidth : APP_WIDTH;
  const height = container ? container.clientHeight : BACKGROUND_HEIGHT;
  state.compositor.setVideoSize(width, height);
}

function createVideoBlob(fileName, data) {
  const bytes = decodeBase64ToUint8Array(data);
  return new Blob([bytes], { type: getVideoMimeType(fileName) });
}

async function attachVideoBlob(blob, fileName) {
  showLoading('加载视频中...');

  const player = state.player ?? new VideoPlayer();
  state.player = player;

  const videoInfo = await player.loadFromBlob(blob);
  ensureCompositor();

  player.video.loop = state.looping;
  player.video.onended = () => {
    state.currentTime = state.duration;
    state.playing = false;
    stopAnimationLoop();
    renderCurrentFrame();
    updateUi();
  };

  state.currentTime = 0;
  state.duration = videoInfo.duration;
  state.playing = false;
  state.videoLoaded = true;
  state.videoName = fileName;

  renderCurrentFrame();
  updateUi();
  hideLoading();

  try {
    await player.play();
    state.playing = true;
    startAnimationLoop();
    updateUi();
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

    const blob = createVideoBlob(result.name, result.data);
    await attachVideoBlob(blob, result.name);
  } catch (error) {
    console.error('Error loading video:', error);
    hideLoading();
    alert(`加载视频失败: ${error.message}`);
  }
}

async function handlePlayPause() {
  if (!state.player || !state.videoLoaded) {
    return;
  }

  if (state.playing) {
    state.player.pause();
    state.playing = false;
    stopAnimationLoop();
    updateUi();
    return;
  }

  try {
    await state.player.play();
    state.playing = true;
    startAnimationLoop();
    updateUi();
  } catch (error) {
    console.error('Error playing video:', error);
    alert(`播放视频失败: ${error.message}`);
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
  updateUi();
}

function handleToggleLoop() {
  state.looping = !state.looping;

  if (state.player) {
    state.player.video.loop = state.looping;
  }

  updateUi();
}

function createExportRecorder(exportStream, exportMimeType) {
  return new MediaRecorder(
    exportStream,
    exportMimeType ? { mimeType: exportMimeType } : undefined,
  );
}

function createExportStream(canvas, videoElement) {
  const canvasStream = createCanvasStream(canvas);
  const audioStream = typeof videoElement.captureStream === 'function' ? videoElement.captureStream() : null;

  return new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...(audioStream ? audioStream.getAudioTracks() : []),
  ]);
}

function createExportContexts(canvas) {
  const exportCanvas = createCanvas(canvas.width, canvas.height);
  const exportContext = exportCanvas.getContext('2d');
  const scratchCanvas = createCanvas(exportCanvas.width * 2, exportCanvas.height);
  const scratchContext = scratchCanvas.getContext('2d', { willReadFrequently: true });

  if (!exportContext || !scratchContext) {
    throw new Error('Failed to create export canvas.');
  }

  return {
    exportCanvas,
    exportContext,
    scratchCanvas,
    scratchContext,
  };
}

async function exportVideoToPath(exportPath, exportMimeType, backgroundImage) {
  if (!state.player || !elements.canvas) {
    throw new Error('Video player is not ready.');
  }

  const { exportCanvas, exportContext, scratchCanvas, scratchContext } = createExportContexts(elements.canvas);
  const player = state.player;

  const exportStream = createExportStream(exportCanvas, player.video);
  const recorder = createExportRecorder(exportStream, exportMimeType);

  const drawCompositeFrame = () => {
    exportContext.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportContext.drawImage(backgroundImage, 0, 0, exportCanvas.width, exportCanvas.height);
    drawPackedVideoToContext({
      context: exportContext,
      outputHeight: exportCanvas.height,
      outputWidth: exportCanvas.width,
      scratchCanvas,
      scratchContext,
      videoElement: player.video,
    });
    requestStreamFrame(exportStream);
  };

  const renderExportFrame = () => {
    renderCurrentFrame();
    drawCompositeFrame();
    state.currentTime = player.video.currentTime;
    updateUi();
  };
  const chunks = [];
  let exportAnimationId = null;

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  });

  const stopPromise = new Promise((resolve, reject) => {
    recorder.addEventListener('stop', resolve, { once: true });
    recorder.addEventListener(
      'error',
      () => reject(new Error('Export recording failed.')),
      { once: true },
    );
  });

  const stopExportLoop = () => {
    stopAnimationLoop();

    if (exportAnimationId) {
      cancelAnimationFrame(exportAnimationId);
      exportAnimationId = null;
    }
  };

  recorder.start(250);
  showLoading('导出视频中...');
  renderExportFrame();

  if ('requestVideoFrameCallback' in player.video) {
    const frameLoop = () => {
      renderExportFrame();

      if (!player.video.paused && !player.video.ended) {
        player.frameCallbackId = player.video.requestVideoFrameCallback(() => {
          frameLoop();
        });
      }
    };

    player.frameCallbackId = player.video.requestVideoFrameCallback(() => {
      frameLoop();
    });
  } else {
    const frameLoop = () => {
      if (player.video.paused || player.video.ended) {
        return;
      }

      renderExportFrame();
      exportAnimationId = requestAnimationFrame(frameLoop);
    };

    exportAnimationId = requestAnimationFrame(frameLoop);
  }

  const endedPromise = waitForEvent(player.video, 'ended');
  await player.play();
  await endedPromise;
  stopExportLoop();
  renderExportFrame();
  recorder.stop();
  await stopPromise;

  const exportedBlob = new Blob(chunks, { type: exportMimeType || 'video/webm' });
  const encodedData = await blobToBase64(exportedBlob);
  const writeResult = await window.electronAPI.writeFile(exportPath, encodedData);

  if (!writeResult?.success) {
    throw new Error(writeResult?.error || 'Failed to save exported video.');
  }
}

async function handleExport() {
  if (!state.player || !state.videoLoaded || state.exporting) {
    return;
  }

  const exportMimeType = getExportMimeType();

  if (!exportMimeType) {
    alert('当前环境不支持 WebM 导出。');
    return;
  }

  state.exporting = true;
  updateUi();

  const player = state.player;
  const previousEndedHandler = player.video.onended;
  const previousLoop = player.video.loop;
  const resumeAfterExport = state.playing;

  try {
    showLoading('准备导出...');
    const backgroundImage = await loadBackgroundImage();
    const exportPath = await window.electronAPI.saveVideo(
      `${state.videoName.replace(/\.[^.]+$/, '') || 'output'}.webm`,
    );

    if (!exportPath) {
      return;
    }

    player.pause();
    state.currentTime = 0;
    state.playing = false;
    stopAnimationLoop();
    player.video.loop = false;
    player.video.onended = null;
    await player.seek(0);
    renderCurrentFrame();
    updateUi();

    await exportVideoToPath(exportPath, exportMimeType, backgroundImage);
    await player.seek(0);
    state.currentTime = 0;
    renderCurrentFrame();
    alert(`已导出到:\n${exportPath}`);
  } catch (error) {
    console.error('Error exporting video:', error);
    alert(`导出视频失败: ${error.message}`);
  } finally {
    player.video.loop = previousLoop;
    player.video.onended = previousEndedHandler;
    state.exporting = false;
    hideLoading();

    if (resumeAfterExport) {
      try {
        await player.play();
        state.playing = true;
        startAnimationLoop();
      } catch (error) {
        console.error('Error resuming video after export:', error);
      }
    } else {
      state.playing = false;
      stopAnimationLoop();
      renderCurrentFrame();
    }

    updateUi();
  }
}

function handleDragState(event) {
  event.preventDefault();
  event.stopPropagation();
}

function setupDragAndDrop() {
  if (!elements.dropZone) {
    return;
  }

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, handleDragState);
  });

  elements.dropZone.addEventListener('dragenter', () => {
    elements.dropZone?.classList.add('drag-over');
  });

  elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone?.classList.remove('drag-over');
  });

  elements.dropZone.addEventListener('drop', async (event) => {
    elements.dropZone?.classList.remove('drag-over');
    const file = event.dataTransfer?.files[0];

    if (!file || !file.type.startsWith('video/')) {
      alert('请拖放视频文件。');
      return;
    }

    try {
      await attachVideoBlob(file, file.name);
    } catch (error) {
      console.error('Error loading dropped video:', error);
      hideLoading();
      alert(`加载视频失败: ${error.message}`);
    }
  });
}

function bindUiEvents() {
  elements.btnLoadVideo?.addEventListener('click', handleLoadVideo);
  elements.dropOverlay?.addEventListener('click', handleLoadVideo);
  elements.btnPlay?.addEventListener('click', handlePlayPause);
  elements.btnStop?.addEventListener('click', handleStop);
  elements.btnLoop?.addEventListener('click', handleToggleLoop);
  elements.btnExport?.addEventListener('click', handleExport);
}

function init() {
  ensureCompositor();
  bindUiEvents();
  setupDragAndDrop();
  updateUi();

  if (elements.canvasContainer) {
    new ResizeObserver(handleResize).observe(elements.canvasContainer);
  }
}

init();
