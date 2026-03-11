import { DEFAULT_EXPORT_FPS } from './constants.js';

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function drawPackedVideoToContext({
  context,
  outputHeight,
  outputWidth,
  scratchCanvas,
  scratchContext,
  videoElement,
}) {
  const packedWidth = Math.max(1, videoElement.videoWidth || outputWidth);
  const packedHeight = Math.max(1, videoElement.videoHeight || outputHeight);
  const displayWidth = Math.max(1, packedWidth / 2);
  const scaledHeight = outputWidth * (packedHeight / displayWidth);
  const drawY = outputHeight - scaledHeight;

  scratchCanvas.width = outputWidth * 2;
  scratchCanvas.height = outputHeight;
  scratchContext.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
  scratchContext.drawImage(
    videoElement,
    0,
    0,
    packedWidth,
    packedHeight,
    0,
    drawY,
    outputWidth * 2,
    scaledHeight,
  );

  const packedFrame = scratchContext.getImageData(0, 0, outputWidth * 2, outputHeight);
  const frame = context.createImageData(outputWidth, outputHeight);
  const packedData = packedFrame.data;
  const frameData = frame.data;

  for (let y = 0; y < outputHeight; y += 1) {
    const rowOffset = y * outputWidth;

    for (let x = 0; x < outputWidth; x += 1) {
      const pixelOffset = (rowOffset + x) * 4;
      const colorIndex = pixelOffset + outputWidth * 4;
      const alpha =
        packedData[pixelOffset] * 0.299 +
        packedData[pixelOffset + 1] * 0.587 +
        packedData[pixelOffset + 2] * 0.114;

      frameData[pixelOffset] = packedData[colorIndex];
      frameData[pixelOffset + 1] = packedData[colorIndex + 1];
      frameData[pixelOffset + 2] = packedData[colorIndex + 2];
      frameData[pixelOffset + 3] = alpha;
    }
  }

  context.putImageData(frame, 0, 0);
}

export function getExportMimeType() {
  const mimeTypeCandidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];

  for (const candidate of mimeTypeCandidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return '';
}

export function waitForEvent(target, eventName) {
  return new Promise((resolve, reject) => {
    const handleEvent = (...args) => {
      cleanup();
      resolve(args);
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`Failed while waiting for ${eventName}.`));
    };

    const cleanup = () => {
      target.removeEventListener(eventName, handleEvent);
      target.removeEventListener('error', handleError);
    };

    target.addEventListener(eventName, handleEvent, { once: true });
    target.addEventListener('error', handleError, { once: true });
  });
}

export function createCanvasStream(canvas) {
  return canvas.captureStream(DEFAULT_EXPORT_FPS);
}
