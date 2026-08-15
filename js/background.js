const VERTEX_SHADER = `
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_resolution;

float hash(vec2 p) {
  return fract(
    sin(dot(p, vec2(127.1, 311.7))) * 43758.5453
  );
}

vec3 backdrop(vec2 uv) {
  vec3 base = mix(
    vec3(0.92, 0.975, 1.0),
    vec3(0.985, 0.995, 1.0),
    smoothstep(-0.8, 0.85, uv.y)
  );

  float cyan = exp(
    -5.0 * dot(
      uv - vec2(-0.88, 0.37),
      uv - vec2(-0.88, 0.37)
    )
  );

  float blue = exp(
    -7.0 * dot(
      uv - vec2(0.92, -0.36),
      uv - vec2(0.92, -0.36)
    )
  );

  float lilac = exp(
    -9.0 * dot(
      uv - vec2(0.38, 0.82),
      uv - vec2(0.38, 0.82)
    )
  );

  float halo = exp(
    -3.4 * dot(
      uv - vec2(0.22, 0.02),
      uv - vec2(0.22, 0.02)
    )
  );

  base = mix(base, vec3(0.12, 0.82, 0.98), cyan * 0.68);
  base = mix(base, vec3(0.27, 0.43, 0.98), blue * 0.42);
  base = mix(base, vec3(0.72, 0.50, 1.0), lilac * 0.22);
  base = mix(base, vec3(0.42, 0.90, 0.96), halo * 0.22);

  float line = smoothstep(
    0.018,
    0.0,
    abs(uv.y + 0.70 + 0.055 * sin(uv.x * 2.2))
  );

  base += line * vec3(0.08, 0.30, 0.43) * 0.09;
  base += (hash(gl_FragCoord.xy) - 0.5) / 255.0;

  return base;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = (2.0 * frag - u_resolution.xy)
    / min(u_resolution.x, u_resolution.y);
  vec2 bgUv = uv * 0.62;
  vec3 backgroundColor = backdrop(bgUv);

  float vignette = smoothstep(
    1.8,
    0.15,
    length(bgUv)
  );

  backgroundColor *= 0.96 + 0.04 * vignette;
  gl_FragColor = vec4(backgroundColor, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Background shader compilation failed: ${message}`);
  }

  return shader;
}

function createProgram(gl) {
  const program = gl.createProgram();
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Background shader linking failed: ${message}`);
  }

  return program;
}

export function createBackgroundRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
  });

  if (!gl) return null;

  const program = createProgram(gl);
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  const positionBuffer = gl.createBuffer();

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1,
      1, -1,
      -1, 1,
      -1, 1,
      1, -1,
      1, 1,
    ]),
    gl.STATIC_DRAW,
  );

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  let renderFrame = null;

  const render = () => {
    renderFrame = null;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.7);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }

    gl.useProgram(program);
    gl.uniform2f(resolutionLocation, width, height);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  const scheduleRender = () => {
    if (renderFrame === null) {
      renderFrame = window.requestAnimationFrame(render);
    }
  };

  const resizeObserver = new ResizeObserver(scheduleRender);
  resizeObserver.observe(canvas);
  window.addEventListener("resize", scheduleRender, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) scheduleRender();
  });
  scheduleRender();

  return { render: scheduleRender };
}
