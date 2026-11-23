import { MAP } from '../../config/map';
import type { TerrainLook } from '../../config/terrain';
import {
  TERRAIN_FRAGMENT_SHADER,
  TERRAIN_FOG_FRAGMENT_SHADER,
  TERRAIN_UNIFORM_NAMES,
  TERRAIN_VERTEX_SHADER,
  type TerrainUniformName,
} from './terrainShader';
import { packTerrainUniforms } from './terrainUniforms';

export interface TerrainRenderFrame {
  widthPx: number;
  heightPx: number;
  offsetCss: { x: number; y: number };
  tileCss: number;
  dpr: number;
  timeS: number;
  animate: boolean;
  look: TerrainLook;
  gridAlpha: number;
  fogSplit: boolean;
  lavaFlow: [number, number];
}

export interface TerrainRenderer {
  setMap(data: Uint8Array): void;
  render(frame: TerrainRenderFrame): void;
  dispose(): void;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function createTerrainRenderer(
  canvas: HTMLCanvasElement,
  variant: 'terrain' | 'fog' = 'terrain',
): TerrainRenderer | null {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;

  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, TERRAIN_VERTEX_SHADER);
  const fragmentShader = compileShader(
    gl,
    gl.FRAGMENT_SHADER,
    variant === 'fog' ? TERRAIN_FOG_FRAGMENT_SHADER : TERRAIN_FRAGMENT_SHADER,
  );
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  const vao = gl.createVertexArray();
  const buffer = gl.createBuffer();
  const texture = gl.createTexture();
  if (!vao || !buffer || !texture) {
    if (vao) gl.deleteVertexArray(vao);
    if (buffer) gl.deleteBuffer(buffer);
    if (texture) gl.deleteTexture(texture);
    gl.deleteProgram(program);
    return null;
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'aPos');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    MAP.GRID_WIDTH,
    MAP.GRID_HEIGHT,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array(MAP.GRID_WIDTH * MAP.GRID_HEIGHT * 4),
  );

  const locations = new Map<TerrainUniformName, WebGLUniformLocation | null>();
  for (const name of TERRAIN_UNIFORM_NAMES) {
    const queryName = name === 'uTP' || name === 'uSE' ? `${name}[0]` : name;
    locations.set(name, gl.getUniformLocation(program, queryName));
  }
  gl.useProgram(program);
  gl.uniform1i(locations.get('uMap') ?? null, 0);

  let disposed = false;

  return {
    setMap(data) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, MAP.GRID_WIDTH, MAP.GRID_HEIGHT, gl.RGBA, gl.UNSIGNED_BYTE, data);
    },
    render(frame) {
      if (disposed || frame.widthPx <= 0 || frame.heightPx <= 0) return;
      const packed = packTerrainUniforms(frame.look);
      gl.viewport(0, 0, frame.widthPx, frame.heightPx);
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);

      gl.uniform2f(locations.get('uRes') ?? null, frame.widthPx, frame.heightPx);
      gl.uniform2f(locations.get('uOff') ?? null, frame.offsetCss.x, frame.offsetCss.y);
      gl.uniform1f(locations.get('uScale') ?? null, frame.tileCss);
      gl.uniform1f(locations.get('uDpr') ?? null, frame.dpr);
      gl.uniform2f(locations.get('uGrid') ?? null, MAP.GRID_WIDTH, MAP.GRID_HEIGHT);
      gl.uniform1f(locations.get('uTime') ?? null, frame.timeS);
      gl.uniform1f(locations.get('uAnim') ?? null, frame.animate ? 1 : 0);
      gl.uniform4fv(locations.get('uTP') ?? null, packed.tp);
      gl.uniform2fv(locations.get('uSE') ?? null, packed.se);
      gl.uniform3fv(locations.get('uFrz') ?? null, packed.frz);
      gl.uniform3fv(locations.get('uBrn') ?? null, packed.brn);
      gl.uniform3fv(locations.get('uCor') ?? null, packed.cor);
      gl.uniform3fv(locations.get('uCry') ?? null, packed.cry);
      gl.uniform1f(locations.get('uHeat') ?? null, packed.heat);
      gl.uniform2f(locations.get('uPrevEdge') ?? null, packed.prevEdge[0], packed.prevEdge[1]);
      gl.uniform1f(locations.get('uFogSplit') ?? null, frame.fogSplit ? 1 : 0);
      gl.uniform2f(locations.get('uLavaFlow') ?? null, frame.lavaFlow[0], frame.lavaFlow[1]);
      gl.uniform1f(locations.get('uGridA') ?? null, frame.gridAlpha);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
    },
  };
}
