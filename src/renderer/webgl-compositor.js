function compileShader(glContext, type, source) {
  const shader = glContext.createShader(type);

  if (!shader) {
    throw new Error('Failed to create shader.');
  }

  glContext.shaderSource(shader, source);
  glContext.compileShader(shader);

  if (!glContext.getShaderParameter(shader, glContext.COMPILE_STATUS)) {
    const errorMessage = glContext.getShaderInfoLog(shader);
    glContext.deleteShader(shader);
    throw new Error(`Shader compile failed: ${errorMessage}`);
  }

  return shader;
}

function createProgram(glContext, fragmentSource, vertexSource) {
  const vertexShader = compileShader(glContext, glContext.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(glContext, glContext.FRAGMENT_SHADER, fragmentSource);
  const program = glContext.createProgram();

  if (!program) {
    glContext.deleteShader(vertexShader);
    glContext.deleteShader(fragmentShader);
    throw new Error('Failed to create WebGL program.');
  }

  glContext.attachShader(program, vertexShader);
  glContext.attachShader(program, fragmentShader);
  glContext.linkProgram(program);

  glContext.deleteShader(vertexShader);
  glContext.deleteShader(fragmentShader);

  if (!glContext.getProgramParameter(program, glContext.LINK_STATUS)) {
    const errorMessage = glContext.getProgramInfoLog(program);
    glContext.deleteProgram(program);
    throw new Error(`Program link failed: ${errorMessage}`);
  }

  return program;
}

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_tex_coord;
  varying vec2 v_tex_coord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_tex_coord = a_tex_coord;
  }
`;

const FRAGMENT_SHADER_SOURCE = `
  precision mediump float;

  uniform sampler2D u_video;
  uniform vec4 u_video_rect;
  varying vec2 v_tex_coord;

  void main() {
    bool outsideVideo =
      v_tex_coord.x < u_video_rect.x ||
      v_tex_coord.x > u_video_rect.x + u_video_rect.z ||
      v_tex_coord.y < u_video_rect.y ||
      v_tex_coord.y > u_video_rect.y + u_video_rect.w;

    if (outsideVideo) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }

    vec2 videoCoord = vec2(
      (v_tex_coord.x - u_video_rect.x) / u_video_rect.z,
      (v_tex_coord.y - u_video_rect.y) / u_video_rect.w
    );

    vec2 alphaCoord = vec2(videoCoord.x * 0.5, videoCoord.y);
    vec2 colorCoord = vec2(videoCoord.x * 0.5 + 0.5, videoCoord.y);

    vec4 colorSample = texture2D(u_video, colorCoord);
    vec3 alphaSample = texture2D(u_video, alphaCoord).rgb;
    float alpha = dot(alphaSample, vec3(0.299, 0.587, 0.114));
    alpha = clamp(alpha, 0.0, 1.0);

    gl_FragColor = vec4(colorSample.rgb, alpha);
  }
`;

export class WebGlCompositor {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });

    if (!this.gl) {
      throw new Error('WebGL is not available in this renderer.');
    }

    this.videoHeight = 480;
    this.videoWidth = 640;
    this.videoTexture = this.createTexture();
    this.program = createProgram(this.gl, FRAGMENT_SHADER_SOURCE, VERTEX_SHADER_SOURCE);
    this.buffer = this.createVertexBuffer();
    this.positionLocation = this.gl.getAttribLocation(this.program, 'a_position');
    this.texCoordLocation = this.gl.getAttribLocation(this.program, 'a_tex_coord');
    this.videoRectLocation = this.gl.getUniformLocation(this.program, 'u_video_rect');
    this.videoSamplerLocation = this.gl.getUniformLocation(this.program, 'u_video');

    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  bindGeometry() {
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
    this.gl.enableVertexAttribArray(this.positionLocation);
    this.gl.vertexAttribPointer(this.positionLocation, 2, this.gl.FLOAT, false, 16, 0);
    this.gl.enableVertexAttribArray(this.texCoordLocation);
    this.gl.vertexAttribPointer(this.texCoordLocation, 2, this.gl.FLOAT, false, 16, 8);
  }

  createTexture() {
    const texture = this.gl.createTexture();

    if (!texture) {
      throw new Error('Failed to create texture.');
    }

    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      1,
      1,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );

    return texture;
  }

  createVertexBuffer() {
    const vertices = new Float32Array([
      -1, -1, 0, 1,
      1, -1, 1, 1,
      -1, 1, 0, 0,
      1, 1, 1, 0,
    ]);
    const buffer = this.gl.createBuffer();

    if (!buffer) {
      throw new Error('Failed to create buffer.');
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);

    return buffer;
  }

  render(videoElement) {
    const packedVideoWidth = Math.max(1, videoElement.videoWidth || this.videoWidth);
    const packedVideoHeight = Math.max(1, videoElement.videoHeight || this.videoHeight);
    const displayVideoWidth = packedVideoWidth / 2;
    const scaledVideoHeight = this.videoWidth * (packedVideoHeight / displayVideoWidth);
    const normalizedHeight = scaledVideoHeight / this.videoHeight;
    const videoBottom = 1 - normalizedHeight;

    this.gl.viewport(0, 0, this.videoWidth, this.videoHeight);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);

    this.gl.disable(this.gl.BLEND);
    this.gl.useProgram(this.program);
    this.bindGeometry();
    this.gl.uniform4f(this.videoRectLocation, 0, videoBottom, 1, normalizedHeight);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.videoTexture);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, videoElement);
    this.gl.uniform1i(this.videoSamplerLocation, 0);
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }

  setVideoSize(width, height) {
    this.videoWidth = width;
    this.videoHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }
}
