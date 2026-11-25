/**
 * Terrain shaders (WebGL2, GLSL ES 3.00).
 *
 * Ported from the terrain prototype ("Volcanae Terrain prozedural"). The GLSL source is treated as art data:
 * colors, noise frequencies and shape constants inside the shader are the look itself and stay here, like
 * keyframes in CSS. Every value that is tuned per terrain or status arrives as a uniform from
 * config/terrain.ts (TERRAIN_LOOK) through terrainRenderer.ts.
 *
 * Two programs share this source. TERRAIN_FRAGMENT_SHADER draws the ground under the DOM grid.
 * TERRAIN_FOG_FRAGMENT_SHADER (FOG_PASS) draws only the clouds, in a second canvas above the grid,
 * so that objects on a tile that is being revealed come free as the cloud retreats.
 *
 * Map texture (one RGBA8 texel per tile, see terrainMapEncoding.ts):
 *   R = level (low nibble: 0 water, 1 canyon, 2 plains incl. forest and mountain, 3 lava)
 *       + 16 when the tile is the lava preview row that a running lava flow adds (fades in with the flow)
 *   G = status (low nibble: 0 none, 1 frozen, 2 burning, 3 corrupted, 4 crystalline)
 *       + 16 * lava preview heat level (0 none, 15 = row lava takes next)
 *   B = fog: 255 = not revealed, 0 = revealed. Values in between mark a tile whose cloud is retreating
 *       (0 at its end). With uFogLift set, a lift starts at 254, so 255 always means fog at rest. Only the fog
 *       pass and the split shadow read the values in between.
 *   A = per-tile phase used to desynchronize animations
 *
 * Uniforms:
 *   uMap        map texture
 *   uRes        canvas size in device pixels
 *   uOff        grid origin in CSS pixels relative to the canvas
 *   uScale      CSS pixels per tile (tile size * zoom)
 *   uDpr        device pixels per CSS pixel
 *   uGrid       grid size in tiles
 *   uTime       seconds
 *   uAnim       1 = animate, 0 = still image
 *   uTP[5]      per terrain (0 water, 1 canyon, 2 plains, 3 lava, 4 fog): x blend, y edge noise, z and w terrain specific
 *   uSE[5]      per status (1..4): x blend, y edge noise
 *   uFrz, uBrn, uCor, uCry   per status look parameters
 *   uHeat       lava preview heat strength
 *   uGridA      grid line opacity, 0 = no lines
 *   uPrevEdge   lava preview band edge: x blend (at least 0.06), y edge noise. 0, 0 = straight edge
 *   uLavaFlow   x row being consumed, y flow progress 0..1. y = 0: no flow
 *   uFogSplit   0 = the terrain pass draws the clouds, 1 = the fog pass draws them and the terrain pass only their shadow
 *   uFogLift    cloud retreat: x edge billow, y drift in tiles, z share of the lift over which the cloud thins out,
 *               w billow speed. 0, 0, 0, 0 = carve retreat of v0.134.9 (lift starts at 255)
 *
 * Every uniform added after the first version defaults to 0 and then reproduces the first version's look.
 */

export const TERRAIN_VERTEX_SHADER = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

export const TERRAIN_FRAGMENT_SHADER = `#version 300 es
precision highp float; precision highp int;
precision highp sampler2D;
uniform sampler2D uMap;
uniform vec2 uRes, uOff, uGrid; uniform float uScale, uDpr, uTime;
uniform float uAnim;
// per terrain (0 water, 1 canyon, 2 plains incl. forest and mountain, 3 lava, 4 fog): x blend, y edge noise, z and w terrain specific
uniform vec4 uTP[5];
// per status (1 frozen, 2 burning, 3 corrupted, 4 crystalline): x blend, y edge noise
uniform vec2 uSE[5];
// lava preview heat strength (0..1) and grid line opacity (0 = off)
uniform float uHeat, uGridA;
// per-status look parameters, each 0..1 (see GROUPS in the script)
uniform vec3 uFrz, uBrn, uCor, uCry;
// lava preview band edge (x blend, y noise), lava flow (x row, y progress), fog split (0 or 1)
uniform vec2 uPrevEdge, uLavaFlow;
uniform float uFogSplit;
// fog lift: x edge billow, y drift in tiles, z thinning share of the lift, w billow speed. All 0 = carve retreat of v0.134.9
uniform vec4 uFogLift;
out vec4 outColor;

const vec2 LDIR = vec2(-0.7071, -0.7071);          // toward the light, north-west
float PX;                                          // tile units per device pixel

// ------------------------------------------------ noise
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p){ return vec2(hash12(p), hash12(p + 19.7)); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float fbm(vec2 p){ return 0.55*vnoise(p) + 0.3*vnoise(p*2.03 + 7.1) + 0.15*vnoise(p*4.11 + 3.3); }
float ridge(float n){ return 1.0 - abs(n * 2.0 - 1.0); }
void worley(vec2 x, out float f1, out float f2, out vec2 r1, out vec2 c1){
  vec2 n = floor(x), f = fract(x); f1 = 8.0; f2 = 8.0; r1 = vec2(0.0); c1 = n;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g) * 0.8 + 0.1;
    vec2 r = g + o - f; float d = length(r);
    if (d < f1) { f2 = f1; f1 = d; r1 = r; c1 = n + g; } else if (d < f2) { f2 = d; }
  }
}
// anti-aliased step around 0 with half width w, and coverage of a distance field given in tile units
float aas(float x, float w){ return smoothstep(-w, w, x); }
float cov(float d){ return clamp(d / PX + 0.5, 0.0, 1.0); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float lum(vec3 c){ return dot(c, vec3(0.3, 0.59, 0.11)); }

// ------------------------------------------------ map access
vec4 cellAt(ivec2 c){ c = clamp(c, ivec2(0), ivec2(uGrid) - 1); return texelFetch(uMap, c, 0); }
float rawR(vec4 c){ return floor(c.r * 255.0 + 0.5); }
int levelOf(vec4 c){ return int(mod(rawR(c), 16.0)); }
int statusOf(vec4 c){ return int(mod(floor(c.g * 255.0 + 0.5), 16.0)); }
// lava preview heat level of a tile, 0 = no preview, 1 = the row lava takes next
float heatOf(vec4 c){ return floor(floor(c.g * 255.0 + 0.5) / 16.0) / 15.0; }
float remapB(float t, float b){ return b < 0.001 ? step(0.5, t) : clamp((t - 0.5) / (2.0 * b) + 0.5, 0.0, 1.0); }
vec4 bw(vec2 g){ return vec4((1.0-g.x)*(1.0-g.y), g.x*(1.0-g.y), (1.0-g.x)*g.y, g.x*g.y); }

// y of the moving lava front in tile units (south edge of the row at progress 0, north edge at 1). The front
// wobbles while it moves and is straight at both ends, so it meets the still states without a jump.
float lavaFrontY(float x){
  float pr = clamp(uLavaFlow.y, 0.0, 1.0);
  float wob = (vnoise(vec2(x * 2.3, uTime * uAnim * 0.5 + 4.0)) - 0.5) * 0.22 * pr * (1.0 - pr) * 4.0;
  return uLavaFlow.x + 1.0 - pr + wob;
}
// Edge parameters are blended from the four surrounding cells. All terrain layers share one boundary, so no sliver
// of a third layer can appear between two others. Fog gets its own weights.
void gather(vec2 p, out vec4 L, out float F, out float tN){
  vec2 q = p - 0.5; vec2 fi = floor(q); vec2 f = q - fi; ivec2 i = ivec2(fi);
  vec4 wb = bw(f * f * (3.0 - 2.0 * f));
  vec4 c[4]; float tB = 0.0; tN = 0.0;
  for (int k = 0; k < 4; k++) {
    c[k] = cellAt(i + ivec2(k & 1, k >> 1));
    int lv = levelOf(c[k]);
    tB += wb[k] * uTP[lv].x; tN += wb[k] * uTP[lv].y;
  }
  vec4 w = bw(vec2(remapB(f.x, tB), remapB(f.y, tB)));
  vec4 wf = bw(vec2(remapB(f.x, uTP[4].x), remapB(f.y, uTP[4].x)));
  L = vec4(0.0); F = 0.0;
  for (int k = 0; k < 4; k++) {
    float lv = float(levelOf(c[k]));
    L += w[k] * vec4(1.0, step(0.5, lv), step(1.5, lv), step(2.5, lv));
    F += wf[k] * c[k].b;
  }
  // lava flow: the consumed row turns into lava from its south edge to its north edge
  if (uLavaFlow.y > 0.0 && p.y > uLavaFlow.x - 0.5) {
    float fw = clamp((p.y - lavaFrontY(p.x)) / (2.0 * max(uTP[3].x, 0.02)) + 0.5, 0.0, 1.0);
    L.yzw = max(L.yzw, vec3(fw));
  }
}
// Status of the visible layer: only cells whose level equals the layer shown here take part, so a status area ends
// exactly where its terrain ends. Between cells of the same layer the status edge uses its own blend and noise.
void gatherStatus(vec2 p, int top, out vec4 St, out float Cr, out float sN){
  vec2 q = p - 0.5; vec2 fi = floor(q); vec2 f = q - fi; ivec2 i = ivec2(fi);
  vec4 wb = bw(f * f * (3.0 - 2.0 * f));
  vec4 c[4]; vec4 m = vec4(0.0); float sB = 0.0, sW = 0.0; sN = 0.0;
  for (int k = 0; k < 4; k++) {
    c[k] = cellAt(i + ivec2(k & 1, k >> 1));
    m[k] = levelOf(c[k]) == top ? 1.0 : 0.0;
    int st = statusOf(c[k]);
    if (m[k] > 0.0 && st > 0) { sB += wb[k] * uSE[st].x; sN += wb[k] * uSE[st].y; sW += wb[k]; }
  }
  if (sW > 0.0) { sB /= sW; sN /= sW; }
  vec4 ws = (bw(vec2(remapB(f.x, sB), remapB(f.y, sB))) + wb * 1e-3) * m;
  float tot = ws.x + ws.y + ws.z + ws.w;
  St = vec4(0.0); Cr = 0.0;
  for (int k = 0; k < 4; k++) {
    float st = float(statusOf(c[k]));
    St += ws[k] * vec4(st < 0.5 ? 1.0 : 0.0, abs(st-1.0) < 0.5 ? 1.0 : 0.0, abs(st-2.0) < 0.5 ? 1.0 : 0.0, abs(st-3.0) < 0.5 ? 1.0 : 0.0);
    Cr += ws[k] * (abs(st - 4.0) < 0.5 ? 1.0 : 0.0);
  }
  if (tot > 0.0) { St /= tot; Cr /= tot; } else { St = vec4(1.0, 0.0, 0.0, 0.0); Cr = 0.0; }
}
float gatherFog(vec2 p){
  vec2 q = p - 0.5; vec2 fi = floor(q); vec2 f = q - fi; ivec2 i = ivec2(fi);
  vec2 g = vec2(remapB(f.x, uTP[4].x), remapB(f.y, uTP[4].x));
  return mix(mix(cellAt(i).b, cellAt(i + ivec2(1,0)).b, g.x), mix(cellAt(i + ivec2(0,1)).b, cellAt(i + ivec2(1,1)).b, g.x), g.y);
}
vec4 levelE(vec4 L, vec2 p, float n){ return L + (fbm(p * 1.9) - 0.5) * 2.0 * n - 0.5; }
int topOf(vec4 e){ int t = 0; if (e.y > 0.0) t = 1; if (e.z > 0.0) t = 2; if (e.w > 0.0) t = 3; return t; }
int topAt(vec2 q){ vec4 a; float c, n; gather(q, a, c, n); return topOf(levelE(a, q, n)); }
float fogEdge(vec2 p){ return gatherFog(p) + (fbm(p * 1.4 + 31.0) - 0.5) * 2.0 * uTP[4].y - 0.5; }
// Split fog (fog pass above the grid). A cloud never reaches into a revealed tile: its noisy edge lies inside the
// fog tiles, so health bars and icons of units next to the fog stay readable. A tile whose fog value lies between
// 0 and 255 is being revealed: its cloud retreats from every side it shares with a tile whose fog value is lower
// (revealed, or further along in its own lift). Tiles that lift in step keep their cloud joined, so the cloud
// recedes as one front when the lifts of deeper rows start one after another.
float gatherFogBin(vec2 p){
  vec2 q = p - 0.5; vec2 fi = floor(q); vec2 f = q - fi; ivec2 i = ivec2(fi);
  vec2 g = vec2(remapB(f.x, uTP[4].x), remapB(f.y, uTP[4].x));
  float a = step(0.002, cellAt(i).b), b = step(0.002, cellAt(i + ivec2(1,0)).b);
  float c = step(0.002, cellAt(i + ivec2(0,1)).b), d = step(0.002, cellAt(i + ivec2(1,1)).b);
  return mix(mix(a, b, g.x), mix(c, d, g.x), g.y);
}
float fogField(vec2 p){
  ivec2 ci = ivec2(floor(p));
  float own = cellAt(ci).b;
  if (own < 0.002) return -1.0;
  float e = gatherFogBin(p) + (fbm(p * 1.4 + 31.0) - 0.5) * 2.0 * uTP[4].y - 0.5 - (0.75 * uTP[4].y + 0.04);
  if (own < 0.998) {
    vec2 f = p - vec2(ci); float d = 2.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      if (i == 0 && j == 0) continue;
      if (cellAt(ci + ivec2(i, j)).b > own - 0.004) continue;
      vec2 a = vec2(i < 0 ? f.x : (i > 0 ? 1.0 - f.x : 0.0), j < 0 ? f.y : (j > 0 ? 1.0 - f.y : 0.0));
      d = min(d, (i != 0 && j != 0) ? length(a) : a.x + a.y);
    }
    float lift = 1.0 - own;
    // reach 1.7 > sqrt(2) + max noise, so the carve has removed the whole tile when lift reaches 1 (no leftover pop)
    e = min(e, d - lift * 1.7 + (fbm(p * 2.2 + 57.0) - 0.5) * 2.0 * uTP[4].y);
  }
  return e;
}
// Fog lift (uFogLift not 0). B values: 255 = fog at rest, 0 = revealed, 1..254 = lifting (254 = waiting for its
// start). The retreat is one continuous field: G interpolates every tile's remaining cloud (rest fog 1, lifting tiles
// their value, revealed 0) between tile centers, so the cloud edge moves away from the revealed side across tile
// borders without straight cuts. While a tile lifts its edge billows and drifts toward the remaining fog, and its cloud
// thins out over the last share of the lift. L (lifting tiles only) caps the lifting cloud, so nothing is left when a
// lift ends. Fog at rest keeps the v0.134.9 rule: its noisy edge lies inside the fog tiles.
float liftG(vec4 c){ return c.b > 0.998 ? 1.0 : c.b; }
bool isLifting(float b){ return b > 0.002 && b < 0.998; }
// x: remaining cloud G, y: weight of lifting tiles, z: their weighted value. G starts with the edge blend of the fog
// at rest and widens to a linear blend between tile centers while the lift runs, so the front can wander.
vec3 gatherLift(vec2 p, bool anyFog){
  vec2 q = p - 0.5; vec2 fi = floor(q); vec2 f = q - fi; ivec2 i = ivec2(fi);
  vec4 c[4];
  vec4 wl = bw(f);
  float lw = 0.0, lv = 0.0;
  for (int k = 0; k < 4; k++) {
    c[k] = cellAt(i + ivec2(k & 1, k >> 1));
    if (isLifting(c[k].b)) { lw += wl[k]; lv += wl[k] * c[k].b; }
  }
  float lift = lw > 1e-4 ? lv / lw : 1.0;
  float blend = anyFog ? uTP[4].x : mix(uTP[4].x, 0.5, smoothstep(1.0, 0.8, lift));
  vec4 w = bw(vec2(remapB(f.x, blend), remapB(f.y, blend)));
  float g = 0.0;
  for (int k = 0; k < 4; k++) g += w[k] * (anyFog ? step(0.002, c[k].b) : liftG(c[k]));
  return vec3(g, lw, lift);
}
float gatherRestBin(vec2 p){
  vec2 q = p - 0.5; vec2 fi = floor(q); vec2 f = q - fi; ivec2 i = ivec2(fi);
  vec4 w = bw(vec2(remapB(f.x, uTP[4].x), remapB(f.y, uTP[4].x)));
  float r = 0.0;
  for (int k = 0; k < 4; k++) r += w[k] * step(0.998, cellAt(i + ivec2(k & 1, k >> 1)).b);
  return r;
}
// edge value (> 0 inside the cloud) and coverage of the clouds of the fog pass
float fogFieldLift(vec2 p, out float cover){
  ivec2 ci = ivec2(floor(p));
  float own = cellAt(ci).b;
  cover = 0.0;
  bool near = false;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) if (isLifting(cellAt(ci + ivec2(i, j)).b)) near = true;
  // at rest a cloud never reaches into a revealed tile. A retreating cloud may billow over the border while it lifts
  if (own < 0.002 && !near) return -1.0;
  float off = 0.75 * uTP[4].y + 0.04;
  float n0 = (fbm(p * 1.4 + 31.0) - 0.5) * 2.0 * uTP[4].y;
  float eRest = own > 0.998 ? gatherRestBin(p) + n0 - 0.5 - off : -1.0;
  cover = aas(eRest, 0.02);
  if (!near) return eRest;
  bool still = uAnim < 0.5;
  vec3 gl = gatherLift(p, still);
  float lift = gl.z;
  float eLift;
  float thin;
  if (still) {
    // reduced motion: the cloud keeps its shape and only fades
    eLift = gl.x + n0 - 0.5 - off;
    thin = lift;
  } else {
    float prog = 1.0 - lift;
    vec2 h = vec2(0.06, 0.0);
    vec2 grad = vec2(gatherLift(p + h.xy, false).x - gl.x, gatherLift(p + h.yx, false).x - gl.x);
    vec2 dir = dot(grad, grad) > 1e-8 ? normalize(grad) : vec2(0.0);
    vec2 pd = p - dir * uFogLift.y * prog;
    float t = uTime * uFogLift.w;
    // billow: large slow lobes plus finer fraying, strongest in the middle of the lift
    float bill = (fbm(pd * 1.1 + vec2(t * 0.5, -t * 0.4) + 57.0) - 0.5)
      + 0.5 * (fbm(pd * 2.6 - vec2(t * 0.8, t * 0.6) + 11.0) - 0.5);
    float amp = uFogLift.x * 8.0 * lift * prog;
    eLift = gl.x + (fbm(pd * 1.4 + 31.0) - 0.5) * 2.0 * uTP[4].y - 0.5 - off + clamp(bill * amp, -1.0, off);
    thin = smoothstep(0.0, max(uFogLift.z, 1e-3), lift);
  }
  // nothing of the lifting cloud is left when its lift ends
  eLift = min(eLift, lift * 3.0 - 0.05);
  cover = max(cover, aas(eLift, 0.02) * thin);
  return max(eRest, eLift);
}
float fogCloud(vec2 p, out float cover){
  if (dot(uFogLift, vec4(1.0)) > 0.0) return fogFieldLift(p, cover);
  float e = fogField(p);
  cover = aas(e, 0.02);
  return e;
}
float gridLine(vec2 p){
  vec2 gf = fract(p); float gd = min(min(gf.x, 1.0 - gf.x), min(gf.y, 1.0 - gf.y));
  return 1.0 - smoothstep(PX * 0.5, PX * 1.2, gd);
}

// ------------------------------------------------ ground materials
vec3 grassMat(vec2 p){
  float w = PX * 2.0 + 0.012;
  float n = fbm(p * 1.15 + 3.1);
  float hue = vnoise(p * 0.32 + 8.0);
  vec3 c = mix(vec3(0.37, 0.56, 0.08), vec3(0.41, 0.57, 0.10), hue);
  vec3 mid = c;
  c = mix(c, mix(mid, vec3(0.30, 0.49, 0.07), uTP[2].z), aas(0.36 - n, w));
  c = mix(c, mix(mid, vec3(0.47, 0.66, 0.14), uTP[2].z), aas(n - 0.66, w));
  // tufts: three chunky blades, darker than the ground, lit tip on the north-west blade
  vec2 q = p * 4.0; vec2 id = floor(q);
  vec2 r = (fract(q) - (0.28 + 0.44 * hash22(id + 3.0))) * 0.25;
  if (hash12(id + 7.7) < 0.52 * uTP[2].w) {
    float s = 1.25;
    float d = min(min(sdSeg(r, vec2(0.0, 0.012)*s, vec2(-0.022, -0.026)*s), sdSeg(r, vec2(0.0, 0.012)*s, vec2(0.003, -0.036)*s)), sdSeg(r, vec2(0.0, 0.012)*s, vec2(0.025, -0.022)*s)) - 0.0075;
    c = mix(c, c * 0.8, cov(-d));
  } else if (hash12(id + 2.9) < 0.04 * uTP[2].w) {
    float d = length(r) - 0.013;
    vec3 fl = hash12(id + 5.1) < 0.5 ? vec3(0.99, 0.9, 0.45) : vec3(0.96, 0.96, 0.9);
    c = mix(c, c * 0.6, cov(-(length(r - vec2(0.006, 0.006)) - 0.013)));
    c = mix(c, fl, cov(-d));
  }
  return c;
}

float landBilinear(vec2 p){
  vec2 q = p - 0.5; vec2 fi = floor(q); vec2 f = q - fi; ivec2 i = ivec2(fi);
  vec2 g = f * f * (3.0 - 2.0 * f);
  float a = levelOf(cellAt(i)) > 0 ? 1.0 : 0.0, b = levelOf(cellAt(i + ivec2(1,0))) > 0 ? 1.0 : 0.0;
  float c = levelOf(cellAt(i + ivec2(0,1))) > 0 ? 1.0 : 0.0, d = levelOf(cellAt(i + ivec2(1,1))) > 0 ? 1.0 : 0.0;
  return mix(mix(a, b, g.x), mix(c, d, g.x), g.y);
}
vec3 waterMat(vec2 p, float shore, float t){
  float w = PX * 2.0 + 0.012;
  float depth = clamp((0.5 - landBilinear(p)) * 2.0, 0.0, 1.0);
  float dn = depth + (fbm(p * 1.3 + vec2(t * 0.04, -t * 0.03)) - 0.5) * 0.4;
  vec3 c = vec3(0.50, 0.83, 0.97);
  c = mix(c, vec3(0.34, 0.70, 0.93), aas(dn - 0.30, w));
  c = mix(c, vec3(0.22, 0.56, 0.86), aas(dn - 0.70, w));
  vec2 wq = p * 3.2 + vec2(t * 0.08, t * 0.05);
  float n1 = vnoise(wq + vec2(vnoise(wq * 0.6 + t * 0.2), vnoise(wq * 0.6 + 3.0 - t * 0.16)) * 1.4);
  float line = ridge(n1);
  float fade = vnoise(p * 1.2 + vec2(0.0, t * 0.1));
  c = mix(c, vec3(0.80, 0.95, 1.0), aas(line - 0.955, PX * 4.0 + 0.012) * 0.46 * uTP[0].w * aas(fade - 0.35, 0.1));
  // wave marks: small bright arcs that bob and fade
  vec2 q = p * 3.0 + vec2(t * 0.05, 0.0); vec2 id = floor(q);
  if (hash12(id + 2.2) < 0.34 * uTP[0].w) {
    vec2 r = (fract(q) - (0.3 + 0.4 * hash22(id))) / 3.0;
    float bob = sin(t * 1.6 + hash12(id) * 6.283);
    r.y += bob * 0.006;
    float arc = max(abs(length(r - vec2(0.0, 0.034)) - 0.034) - 0.0055, r.y - 0.016);
    c = mix(c, vec3(0.93, 0.99, 1.0), cov(-arc) * (0.45 + 0.35 * bob));
  }
  return c;
}

vec3 canyonMat(vec2 p){
  float w = PX * 2.0 + 0.01;
  const float SC = 1.25, E = 0.035;
  float h = fbm(p * SC + 21.0);
  vec2 g = vec2(fbm((p + vec2(E, 0.0)) * SC + 21.0) - h, fbm((p + vec2(0.0, E)) * SC + 21.0) - h) / E;
  float k = h * 5.0; float tier = floor(k); float fr = fract(k);
  vec3 c = mix(vec3(0.62, 0.32, 0.13), vec3(0.85, 0.53, 0.26), clamp(tier / 4.0, 0.0, 1.0));
  // riser of each terrace: lit when it faces the light, dark otherwise
  float band = clamp(0.03 * length(g) * 5.0, 0.02, 0.35);
  float riser = 1.0 - aas(fr - band, w * 5.0 * length(g) + 0.01);
  float facing = dot(normalize(-g + 1e-5), LDIR);
  vec3 riserC = facing > 0.0 ? c * 1.22 + vec3(0.04, 0.02, 0.0) : c * 0.62;
  c = mix(c, riserC, riser * step(0.5, tier));
  // dry cracks
  float f1, f2; vec2 rr, cid; worley(p * 2.1 + 5.0, f1, f2, rr, cid);
  float crack = (1.0 - aas(f2 - f1 - 0.03, PX * 3.0 + 0.008)) * aas(fbm(p * 1.7 + 2.0) - 0.6, 0.03);
  c = mix(c, vec3(0.36, 0.17, 0.07), crack * 0.8 * uTP[1].w);
  // pebbles with a lit north-west side
  vec2 q = p * 5.0; vec2 id = floor(q);
  if (hash12(id + 4.4) < 0.16 * uTP[1].w) {
    vec2 r = (fract(q) - (0.3 + 0.4 * hash22(id + 1.0))) / 5.0;
    float rad = 0.012 + 0.01 * hash12(id + 9.0);
    c = mix(c, c * 0.55, cov(-(length(r - vec2(0.006, 0.007)) - rad)));
    float d = length(r) - rad;
    vec3 pc = mix(vec3(0.80, 0.62, 0.45), vec3(0.55, 0.40, 0.29), aas(dot(r, -LDIR), 0.003));
    c = mix(c, pc, cov(-d));
  }
  return c;
}

// south-facing cliff band below a higher layer. wy: 0 at the rim, 1 at the foot
vec3 cliffMat(vec2 p, float wy, vec3 topC, vec3 botC, float strata){
  float wob = (vnoise(vec2(p.x * 3.0, 0.5)) - 0.5) * 0.3;
  float bandId = floor((wy + wob) * strata);
  vec3 c = mix(topC, botC, wy) * (0.9 + 0.14 * mod(bandId, 2.0));
  float cv = vnoise(vec2(p.x * 9.0, wy * 1.2 + 3.0));
  c *= mix(1.0, 0.72, aas(cv - 0.7, 0.04));
  c = mix(c, c * 1.32, 1.0 - smoothstep(0.0, 0.1, wy));
  c = mix(c, c * 0.55, smoothstep(0.8, 1.0, wy));
  return c;
}

vec3 lavaMat(vec2 p, float t){
  vec2 q = p * 1.1 + vec2(0.0, t * 0.04);
  vec2 wq = q + 0.45 * vec2(fbm(q * 0.8 + vec2(t * 0.05, 0.0)), fbm(q * 0.8 + 5.0 - vec2(0.0, t * 0.05)));
  float n = fbm(wq * 1.4), n2 = fbm((wq + vec2(0.045, 0.045)) * 1.4);
  float sh = n - n2;
  float st = ridge(fbm(wq * 2.2 + vec2(0.0, t * 0.08)));
  vec3 c = mix(vec3(0.95, 0.34, 0.07), vec3(1.0, 0.56, 0.12), aas(st - 0.8, 0.03));
  c = mix(c, vec3(1.0, 0.84, 0.42), aas(st - 0.94, 0.02));
  float ISL = mix(0.72, 0.38, uTP[3].z);
  float crust = aas(n - ISL, PX * 3.0 + 0.006);
  c = mix(c, vec3(1.0, 0.80, 0.38), (1.0 - smoothstep(0.0, 0.07, ISL - n)) * (1.0 - crust) * 0.75);
  float edge = 1.0 - aas(n - ISL - 0.06, 0.015);
  vec3 cr = mix(vec3(0.60, 0.14, 0.05), vec3(0.76, 0.21, 0.06), vnoise(wq * 3.0));
  cr = mix(cr, vec3(0.97, 0.44, 0.13), aas(-sh - 0.004, 0.006) * edge);
  cr = mix(cr, vec3(0.36, 0.07, 0.03), aas(sh - 0.004, 0.006) * edge * 0.85);
  float f1, f2; vec2 r, cid; worley(wq * 2.6, f1, f2, r, cid);
  float hot = 0.6 + 0.4 * sin(t * 1.8 + hash12(cid) * 6.283);
  float ck = (1.0 - aas(f2 - f1 - 0.06, PX * 3.0 + 0.01)) * aas(n - ISL - 0.05, 0.02);
  cr = mix(cr, vec3(1.0, 0.62, 0.15) * hot + vec3(0.0, 0.08, 0.0), ck * 0.9);
  c = mix(c, cr, crust);
  // bubbles in the molten parts
  vec2 bq = p * 2.6; vec2 bid = floor(bq);
  if (hash12(bid + 6.1) < 0.35 && crust < 0.5) {
    float ph = fract(t * 0.33 + hash12(bid + 2.0));
    vec2 br = (fract(bq) - (0.3 + 0.4 * hash22(bid + 8.0))) / 2.6;
    float d = length(br) - 0.045 * smoothstep(0.0, 0.8, ph);
    float on = step(ph, 0.86) * (1.0 - crust);
    c = mix(c, vec3(1.0, 0.93, 0.62), cov(-d) * on * 0.9);
    c = mix(c, vec3(0.78, 0.22, 0.05), cov(-(abs(d) - 0.006)) * on * 0.8);
  }
  return c;
}

vec3 fogMat(vec2 p, float t){
  vec2 q = p * 0.75 + vec2(t * 0.025, t * 0.008);
  float n = fbm(q), n2 = fbm(q + vec2(0.09, 0.12));
  float sh = n - n2;
  vec3 c = vec3(0.80, 0.82, 0.87);
  c = mix(c, vec3(0.91, 0.92, 0.95), aas(n - 0.5, 0.015));
  c = mix(c, vec3(0.99, 0.99, 1.0), aas(sh - 0.03, 0.01) * aas(n - 0.44, 0.02));
  c = mix(c, vec3(0.66, 0.69, 0.77), aas(-sh - 0.04, 0.01));
  return c;
}

vec3 cloudColor(vec2 p, float t, float fe){
  vec3 fc = mix(vec3(0.87, 0.89, 0.92), fogMat(p, t), uTP[4].w / 0.6);
  return mix(fc, vec3(0.66, 0.69, 0.77), (1.0 - aas(fe - 0.05, 0.015)) * 0.8);
}

// ------------------------------------------------ status materials
// Frozen: x frost layer, y cracks, z glare
float iceGlare(vec2 p, float t){
  float d = p.x * 0.6 + p.y + (fbm(p * 0.8) - 0.5) * 0.5;
  float b1 = fract(d * 0.22 - t * 0.09);
  float glare = smoothstep(0.0, 0.07, b1) * (1.0 - smoothstep(0.07, 0.19, b1));
  float streak = smoothstep(0.8, 0.96, vnoise(vec2((p.x - p.y * 0.6) * 2.0, (p.x * 0.6 + p.y) * 22.0)));
  return glare * 0.16 + streak * 0.08 + glare * streak * 0.12;
}
vec3 frozenGround(vec3 base, vec2 p, float t){
  float l = lum(base);
  vec3 c = mix(base, vec3(l) * vec3(0.82, 0.96, 1.06) + vec3(0.12, 0.18, 0.22), 0.8 * uFrz.x);
  float n = fbm(p * 1.6 + 5.0);
  c = mix(c, vec3(0.82, 0.92, 0.97), aas(n - 0.58, 0.02) * 0.75 * uFrz.x);
  float f1, f2; vec2 r, cid; worley(p * 2.2 + 1.7, f1, f2, r, cid);
  float crack = (1.0 - aas(f2 - f1 - 0.025, PX * 3.0 + 0.006)) * aas(fbm(p * 1.3 + 4.0) - mix(0.8, 0.2, uFrz.y), 0.04);
  c = mix(c, vec3(0.95, 0.99, 1.0), crack * min(1.0, uFrz.y * 1.4));
  c *= 0.97 + 0.06 * hash12(cid) * uFrz.x;
  return c + vec3(0.78, 0.9, 1.0) * iceGlare(p, t) * uFrz.z;
}
vec3 frozenWater(vec3 base, vec2 p, float t){
  float l = lum(base);
  vec3 ice = mix(vec3(0.62, 0.82, 0.93), vec3(0.80, 0.93, 0.98), clamp((l - 0.45) * 2.2, 0.0, 1.0));
  vec3 c = mix(base, ice, 0.35 + 0.65 * uFrz.x);
  float f1, f2; vec2 r, cid; worley(p * 1.3 + 4.0, f1, f2, r, cid);
  c *= 0.95 + 0.08 * hash12(cid);
  c = mix(c, vec3(0.97, 1.0, 1.0), (1.0 - aas(f2 - f1 - 0.025, PX * 2.0 + 0.006)) * min(1.0, uFrz.y * 1.5));
  return c + vec3(0.78, 0.9, 1.0) * iceGlare(p, t) * uFrz.z * 2.0;
}

// Burning: x char share, y scorch of the remaining grass, z embers and fire.
// The burn field uses a short wavelength, so char, front and fire spread evenly over every tile.
float burnFront(){ return mix(0.72, 0.32, uBrn.x); }
float burnN(vec2 p){ return fbm(p * 2.4 + 9.0) + (vnoise(p * 8.0 + 2.0) - 0.5) * 0.12 + (vnoise(p * 18.0 + 5.0) - 0.5) * 0.05; }
vec3 burningGround(vec3 base, vec2 p, float t, float phase){
  float n = burnN(p), fr = burnFront();
  float w = PX * 2.0 + 0.004;
  vec3 c = mix(base, base * vec3(0.80, 0.66, 0.38) + vec3(0.04, 0.02, 0.0), uBrn.y);
  c = mix(c, base * vec3(1.02, 0.80, 0.45), aas(n - fr + 0.11, 0.05) * (0.4 + 0.6 * uBrn.y));
  c = mix(c, vec3(0.44, 0.31, 0.13), aas(n - fr + 0.04, w));
  c = mix(c, vec3(0.17, 0.13, 0.10), aas(n - fr - 0.003, w));
  float charIn = aas(n - fr - 0.04, 0.02);
  c = mix(c, vec3(0.31, 0.28, 0.26), aas(vnoise(p * 6.0 + 11.0) - 0.64, 0.03) * charIn * 0.6);
  float F = uBrn.z;
  float front = 1.0 - aas(abs(n - fr) - 0.007, w);
  float seg = aas(vnoise(p * 5.0 + vec2(0.0, t * 0.3)) - 0.38, 0.06);
  float pulse = 0.7 + 0.3 * sin(t * 2.5 + p.x * 4.0 + phase * 6.283);
  c = mix(c, vec3(1.0, 0.5, 0.12) * pulse + vec3(0.0, 0.05, 0.0), front * seg * 0.9 * F);
  float f1, f2; vec2 r, cid; worley(p * 3.0 + 7.0, f1, f2, r, cid);
  float fis = (1.0 - aas(f2 - f1 - 0.022, PX * 3.0 + 0.006)) * aas(vnoise(p * 2.3 + 1.0) - 0.55, 0.04) * aas(n - fr - 0.07, 0.02);
  c = mix(c, vec3(1.0, 0.42, 0.1) * (0.6 + 0.4 * pulse), fis * 0.85 * F);
  vec2 q = p * 7.0; vec2 id = floor(q);
  if (hash12(id + 3.3) < 0.3) {
    vec2 rr = (fract(q) - (0.25 + 0.5 * hash22(id))) / 7.0;
    float tw = 0.5 + 0.5 * sin(t * 4.0 + hash12(id + 1.0) * 6.283);
    c = mix(c, vec3(1.0, 0.72, 0.3), cov(-(length(rr) - 0.006)) * tw * max(charIn, 0.5) * F);
  }
  return c;
}
// smouldering fire along the burn front: low ragged tongues that lick north and drift, smoke over the char
vec3 smoulder(vec3 col, vec2 p, float t){
  float F = uBrn.z, fr = burnFront();
  float rise = 0.55 * vnoise(vec2(p.x * 10.0, p.y * 4.0 + t * 2.4)) + 0.45 * vnoise(vec2(p.x * 23.0 + 3.0, p.y * 7.0 + t * 3.2));
  float h = 0.1 * rise;
  float n0 = burnN(p), nf = burnN(p + vec2(0.0, h));
  float seg = aas(vnoise(p * 3.5 + vec2(0.0, t * 0.2)) - 0.22, 0.08);
  float fire = aas(nf - fr, 0.004) * (1.0 - aas(n0 - fr - 0.03, 0.006)) * seg;
  float heat = clamp((nf - fr) / 0.035, 0.0, 1.0) * (0.75 + 0.25 * rise);
  vec3 fc = mix(vec3(0.80, 0.20, 0.05), vec3(1.0, 0.52, 0.10), aas(heat - 0.3, 0.12));
  fc = mix(fc, vec3(1.0, 0.82, 0.40), aas(heat - 0.75, 0.1));
  col = mix(col, fc, fire * min(1.0, F * 1.2));
  col += vec3(1.0, 0.40, 0.10) * (1.0 - smoothstep(0.0, 0.06, abs(n0 - fr))) * seg * 0.16 * F;
  float sm = fbm(p * 2.4 + vec2(t * 0.05, t * 0.35));
  col = mix(col, vec3(0.10, 0.09, 0.09), aas(sm - 0.6, 0.06) * aas(n0 - fr - 0.06, 0.03) * 0.35);
  return col;
}

// Corrupted: x ash tone, y vein network, z magic glow
vec3 corruptedGround(vec3 base, vec2 p, float t, float phase, float lref){
  float l = lum(base);
  vec3 c = mix(base, vec3(0.39, 0.35, 0.31) * (1.0 + 1.8 * (l - lref)), uCor.x);
  float w = PX * 3.0 + 0.006;
  vec2 wp = p + 0.32 * vec2(fbm(p * 1.8 + 3.0), fbm(p * 1.8 + 8.0));
  float f1, f2; vec2 r, cid; worley(wp * 2.3 + 13.0, f1, f2, r, cid);
  float g1, g2; vec2 gr, gid; worley(wp * 5.5 + 2.0, g1, g2, gr, gid);
  float e = f2 - f1, e2 = g2 - g1;
  float m1 = aas(fbm(p * 1.1 + 4.0) - mix(0.75, 0.25, uCor.y), 0.05) * aas(vnoise(wp * 3.1 + 9.0) - mix(0.6, 0.12, uCor.y), 0.1);
  float m2 = aas(vnoise(p * 3.0 + 6.0) - 0.5, 0.06) * aas(0.3 - e, 0.08);
  float wid = 0.02 + 0.035 * vnoise(wp * 4.0);
  float vein = max((1.0 - aas(e - wid, w)) * m1, (1.0 - aas(e2 - 0.018, w)) * m2 * m1);
  float stain = (1.0 - smoothstep(0.0, 0.22, e)) * m1;
  c = mix(c, c * vec3(0.76, 0.70, 0.80), stain * 0.55);
  c = mix(c, vec3(0.19, 0.09, 0.24), vein * 0.85);
  float pu = 0.5 + 0.5 * sin(t * 1.57 + phase * 6.283 + p.y * 1.3);
  float core = (1.0 - aas(e - wid * 0.45, w * 0.7)) * m1 * aas(vnoise(p * 1.8 + 2.0) - 0.42, 0.08);
  c = mix(c, mix(vec3(0.46, 0.24, 0.64), vec3(0.74, 0.54, 0.95), pu), core * uCor.z);
  return c;
}

// Crystalline: x crystal density (1 = the whole area), y crystal size, z strength (facet opacity, glaze, sparkle)
float crystalOn(vec2 cid){ return step(hash12(cid + 0.7), uCry.x * 1.001); }
vec3 crystalline(vec3 col, vec2 p, float t, float phase){
  float CS = mix(7.0, 2.5, uCry.y), K = uCry.z;
  float f1, f2; vec2 r, cid; worley(p * CS, f1, f2, r, cid);
  float on = crystalOn(cid);
  col = mix(col, col * vec3(0.86, 0.97, 1.08) + vec3(0.03, 0.06, 0.08), 0.6 * K);
  // drop shadow: crystals stand up, their shadow falls south-east
  float g1, g2; vec2 gr, gid; worley(p * CS - vec2(0.18, 0.22) * CS / 5.0, g1, g2, gr, gid);
  col *= 1.0 - 0.3 * K * crystalOn(gid) * (1.0 - on) * smoothstep(0.02, 0.06, g2 - g1);
  float flat_ = hash12(cid + 1.3);
  vec3 facet = mix(vec3(0.36, 0.58, 0.84), vec3(0.70, 0.88, 0.99), flat_);
  facet = mix(facet, vec3(0.66, 0.62, 0.98), step(0.85, hash12(cid + 9.1)) * 0.4);
  vec2 cut = normalize(vec2(hash12(cid + 6.6), hash12(cid + 8.8)) - 0.5 + 1e-3);
  facet *= dot(-r, cut) > 0.0 ? 1.12 : 0.72;
  float edge = 1.0 - smoothstep(0.0, 0.03 + PX * CS * 1.6, f2 - f1);
  facet = mix(facet, vec3(0.92, 1.0, 1.0), edge * 0.6);
  float inner = smoothstep(0.0, 0.02 + PX * CS * 1.6, f2 - f1);
  col = mix(col, facet, on * (edge > 0.5 ? 1.0 : inner) * mix(0.35, 1.0, K));
  float flash = pow(max(0.0, sin(t * 1.4 + hash12(cid + 7.7) * 18.85 + phase * 6.283)), 16.0);
  col = mix(col, vec3(0.75, 1.0, 1.0), flash * 0.2 * on * K);
  float tw = pow(max(0.0, sin(t * 2.2 + hash12(cid + 4.4) * 18.85 + phase * 6.283)), 10.0) * step(0.65, hash12(cid + 2.2)) * on;
  float star = max(1.0 - abs(r.x) * 18.0, 0.0) * max(1.0 - abs(r.y) * 3.5, 0.0) + max(1.0 - abs(r.y) * 18.0, 0.0) * max(1.0 - abs(r.x) * 3.5, 0.0);
  vec3 hue = 0.6 + 0.4 * cos(6.283 * (hash12(cid + 5.5) + vec3(0.0, 0.33, 0.67)));
  col += hue * clamp(star, 0.0, 1.0) * tw * 0.5 * K;
  return col;
}

// ------------------------------------------------ main
#ifdef FOG_PASS
// fog pass: clouds only, premultiplied alpha, drawn in a canvas above the grid
void main(){
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 p = (css - uOff) / uScale;
  PX = 1.0 / (uScale * uDpr);
  bool inside = p.x >= 0.0 && p.y >= 0.0 && p.x < uGrid.x && p.y < uGrid.y;
  float a = 0.0;
  float fe = inside ? fogCloud(p, a) : -1.0;
  if (a <= 0.0) { outColor = vec4(0.0); return; }
  vec3 c = cloudColor(p, uTime * uAnim, fe);
  if (uGridA > 0.0) c = mix(c, vec3(0.0), gridLine(p) * uGridA);
  outColor = vec4(c * a, a);
}
#else
void main(){
  vec2 css = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec2 p = (css - uOff) / uScale;
  PX = 1.0 / (uScale * uDpr);
  bool inside = p.x >= 0.0 && p.y >= 0.0 && p.x < uGrid.x && p.y < uGrid.y;
  float t = uTime * uAnim;

  vec4 L; float F, tN; gather(p, L, F, tN);
  vec4 eb = levelE(L, p, tN);
  vec4 dist = eb / max(fwidth(eb), vec4(1e-5)) * PX;
  int top = topOf(eb);
  vec4 St; float Cr, sN; gatherStatus(p, top, St, Cr, sN);
  float dIn = dist[top];
  float dOut = (top < 3 && L[min(top + 1, 3)] > 0.0) ? -dist[min(top + 1, 3)] : 1e3;
  float dLava = L.w > 0.0 ? -dist.w : 1e3;

  // status: argmax with edge noise, skipped where no status is near (the condition is constant per 2 x 2 cell block)
  bool anyStatus = St.x < 0.999;
  vec4 sn = anyStatus ? St + (vec4(fbm(p*1.7+11.0), fbm(p*1.7+23.0), fbm(p*1.7+37.0), fbm(p*1.7+51.0)) - 0.5) * 2.0 * sN : St;
  vec4 sDist = (sn - 0.5) / max(fwidth(sn), vec4(1e-5)) * PX;
  float cn = anyStatus ? Cr + (fbm(p*1.7+67.0) - 0.5) * 2.0 * sN : 0.0;
  float cDist = (cn - 0.5) / max(fwidth(cn), 1e-5) * PX;
  int s = 0; float best = sn.x;
  if (sn.y > best) { s = 1; best = sn.y; } if (sn.z > best) { s = 2; best = sn.z; } if (sn.w > best) { s = 3; best = sn.w; } if (cn > best) { s = 4; }
  float dS = s == 4 ? cDist : sDist[min(s, 3)];

  ivec2 ci = ivec2(floor(p));
  float phase = cellAt(ci).a;

  vec3 col;
  bool statusGround = s > 0 && (top == 0 || top == 2);
  if (top == 3) col = lavaMat(p, t);
  else if (top == 2) {
    col = grassMat(p);
    if (s == 1) col = frozenGround(col, p, t);
    else if (s == 2) col = burningGround(col, p, t, phase);
    else if (s == 3) col = corruptedGround(col, p, t, phase, 0.48);
  }
  else if (top == 1) col = canyonMat(p);
  else {
    col = waterMat(p, dOut, t);
    if (s == 1) col = frozenWater(col, p, t);
    else if (s == 3) {
      vec3 cw = corruptedGround(col, p, t, phase, 0.62) * vec3(0.86, 0.88, 1.02);
      col = mix(cw, vec3(0.24, 0.22, 0.30), 0.25);
    }
  }

  // cliffs below a higher layer to the north: canyon walls and low water banks
  float wy = -1.0; int higher = 0;
  bool gate = false;
  if (top < 2) for (int k = 0; k < 6; k++) {
    int lv = levelOf(cellAt(ci + ivec2(k % 3 - 1, k / 3 - 1)));
    if (lv > top && lv < 3) gate = true;
  }
  if (top < 2) {
    if (gate) {
      float WALL = top == 1 ? mix(0.1, 0.5, uTP[1].z) : 0.13;
      int found = 0;
      for (int i = 1; i <= 7; i++) {
        int tq = topAt(p - vec2(0.0, WALL * float(i) / 7.0));
        if (tq > top && tq < 3) { found = i; higher = tq; break; }
      }
      if (found > 0) {
        float lo = float(found - 1) / 7.0, hi = float(found) / 7.0;
        for (int k = 0; k < 4; k++) { float mid = 0.5 * (lo + hi); int tq = topAt(p - vec2(0.0, WALL * mid)); if (tq > top && tq < 3) hi = mid; else lo = mid; }
        wy = clamp(hi, 0.0, 1.0);
        if (top == 1) col = cliffMat(p, wy, vec3(0.76, 0.44, 0.20), vec3(0.42, 0.21, 0.09), 3.0);
        else {
          vec3 bt = higher == 1 ? vec3(0.70, 0.40, 0.19) : vec3(0.50, 0.38, 0.22);
          vec3 bb = higher == 1 ? vec3(0.42, 0.22, 0.10) : vec3(0.28, 0.20, 0.13);
          if (s == 1) { bt = mix(bt, vec3(0.86, 0.94, 1.0), 0.6); bb = mix(bb, vec3(0.55, 0.68, 0.78), 0.5); }
          if (s == 3) { bt = vec3(0.36, 0.32, 0.30); bb = vec3(0.20, 0.17, 0.18); }
          col = cliffMat(p, wy, bt, bb, 2.0);
          if (s != 1) {
            float fo = smoothstep(0.78, 0.92, wy) * (0.6 + 0.4 * sin(t * 2.0 + p.x * 9.0));
            col = mix(col, s == 3 ? vec3(0.50, 0.45, 0.58) : vec3(0.92, 0.98, 1.0), fo * min(1.0, 1.07 * uTP[0].z));
          }
        }
      }
    }
  }

  // drop shadow from a higher layer on the light side (west rims), not on cliff faces
  if (gate && wy < 0.0) {
    int t2 = topAt(p + vec2(-0.06, -0.05));
    if (t2 > top && t2 < 3) col *= 0.7;
  }
  // shoreline foam on the open edges of water
  if (top == 0 && wy < 0.0 && s != 1 && dLava > 0.4) {
    float f1 = 1.0 - aas(dOut - (0.045 + 0.025 * sin(t * 1.7 + (p.x + p.y) * 2.3)), PX * 1.5);
    float wave = fract(dOut * 5.0 - t * 0.25);
    float f2 = step(0.92, wave) * step(dOut, 0.32);
    col = mix(col, s == 3 ? vec3(0.50, 0.45, 0.58) : vec3(0.94, 0.99, 1.0), max(f1, f2 * 0.55) * min(1.0, 1.2 * uTP[0].z));
  }
  if (top == 0 && wy < 0.0 && s == 1) col = mix(col, vec3(0.93, 0.98, 1.0), (1.0 - aas(dOut - 0.04, PX * 1.5)) * 0.7);
  // lit lip on the edge of the high ground
  if (top == 2 && L.x - L.z > 0.01) {
    col = mix(col, col * 1.22 + 0.03, 1.0 - aas(dIn - 0.028, PX * 1.2));
    col = mix(col, col * 0.62, (1.0 - aas(dIn - 0.012, PX * 1.0)));
  }

  // lava: crust at its own edge, glow on the neighbours, cooled stones where it meets water, steam
  if (top == 3) {
    col = mix(col, vec3(0.20, 0.06, 0.03), (1.0 - aas(dIn - 0.05, PX * 1.5)) * 0.8);
  } else {
    float glow = smoothstep(0.0, 0.5, L.w) * (0.75 + 0.25 * sin(t * 2.0 + p.y));
    col += vec3(1.0, 0.42, 0.16) * glow * 0.8 * uTP[3].w;
  }
  float nonLava = max(1.0 - L.w, 1e-4);
  if (L.w > 0.0 && (1.0 - L.y) / nonLava > 0.5) {
    if (top == 0) {
      float steam = smoothstep(0.55, 0.85, fbm(p * 3.0 + vec2(0.2 * t, -0.5 * t)));
      col = mix(col, vec3(0.86, 0.88, 0.9), steam * smoothstep(0.0, 0.5, L.w) * 0.55);
    }
    float sdL = dist.w + (vnoise(p * 4.0) - 0.5) * 0.06;
    if ((top == 0 || top == 3) && sdL > -0.08 && sdL < 0.12) {
      float f1, f2; vec2 r, cid; worley(p * 6.0, f1, f2, r, cid);
      vec3 stone = mix(vec3(0.21, 0.18, 0.16), vec3(0.40, 0.35, 0.30), hash12(cid));
      stone *= 0.8 + 0.4 * clamp(dot(-r, LDIR) * 2.2, -1.0, 1.0);
      col = mix(stone, vec3(0.09, 0.08, 0.07), 1.0 - smoothstep(0.03, 0.11, f2 - f1));
    }
  }

  // status layer details
  if (statusGround && wy < 0.0) {
    if (s == 2 && top == 2) col = smoulder(col, p, t);
    if (s == 4) col = crystalline(col, p, t, phase);
    if (dS < 0.05 && dIn > 0.06) {
      vec3 rim = s == 1 ? vec3(0.88, 0.97, 1.0) : (s == 2 ? vec3(1.0, 0.48, 0.12) : (s == 3 ? vec3(0.42, 0.22, 0.55) : vec3(0.70, 0.90, 1.0)));
      col = mix(col, rim, (1.0 - aas(dS - 0.03, PX * 1.2)) * (s == 4 ? 0.3 : 0.55));
    }
  }

  // lava preview: heat on the tiles lava takes next, hottest on the row it takes first.
  // Lava cells count for the band's shape, so the band has no edge towards the lava and its heat reaches
  // the lava's own edge. The outer edge uses its own blend and noise. Inside the band the level is averaged
  // over preview cells only, so the band does not fade towards its edge. A preview row added by a running
  // lava flow fades in with the flow.
  {
    vec2 q = p - 0.5; vec2 fi = floor(q); vec2 f = q - fi; ivec2 i = ivec2(fi);
    vec4 wb = bw(f * f * (3.0 - 2.0 * f));
    float pb = max(uPrevEdge.x, 0.06);
    vec4 wt = bw(vec2(remapB(f.x, pb), remapB(f.y, pb)));
    float flowIn = clamp(uLavaFlow.y, 0.0, 1.0);
    float mask = 0.0, lsum = 0.0, wsum = 0.0;
    for (int k = 0; k < 4; k++) {
      vec4 cc = cellAt(i + ivec2(k & 1, k >> 1));
      float h = heatOf(cc);
      float mp = (h > 0.0 ? 1.0 : 0.0) * (rawR(cc) >= 16.0 ? flowIn : 1.0);
      float mm = levelOf(cc) == 3 ? 1.0 : mp;
      mask += wt[k] * mm; lsum += wb[k] * mp * h; wsum += wb[k] * mp;
    }
    if (uPrevEdge.y > 0.0) {
      float sw = max(0.5 - 0.75 * uPrevEdge.y, 0.05);
      mask = smoothstep(0.5 - sw, 0.5 + sw, mask + (fbm(p * 1.9 + 43.0) - 0.5) * 2.0 * uPrevEdge.y);
    }
    if (mask > 0.0 && wsum > 0.0 && top != 3) {
      float lvl = lsum / wsum;
      float k = mask * uHeat;
      float pulse = 0.75 + 0.25 * sin(t * 2.4 + p.x * 1.3);
      col = mix(col, col * vec3(1.08, 0.80, 0.56), 0.55 * k);
      col += vec3(1.0, 0.42, 0.12) * k * (0.14 + 0.34 * lvl) * pulse;
      float v = ridge(vnoise(p * 4.5 + 7.0));
      col = mix(col, vec3(1.0, 0.56, 0.16), aas(v - 0.94, PX * 2.0 + 0.005) * k * (0.3 + 0.7 * lvl) * pulse);
      vec2 eq = p * vec2(6.0, 3.0) + vec2(0.0, t * 0.5); vec2 eid = floor(eq);
      if (hash12(eid + 3.7) < 0.3) {
        vec2 er = (fract(eq) - vec2(0.3 + 0.4 * hash12(eid), 0.5)) / vec2(6.0, 3.0);
        float life = fract(eq.y);
        col = mix(col, vec3(1.0, 0.78, 0.35), cov(-(length(er) - 0.008)) * k * lvl * (1.0 - life));
      }
    }
  }

  // lava flow: scorched, glowing ground just ahead of the moving front
  if (uLavaFlow.y > 0.0 && top != 3 && p.y > uLavaFlow.x - 0.6) {
    float ahead = lavaFrontY(p.x) - p.y + (fbm(p * 3.1 + 17.0) - 0.5) * 0.12;
    float sc = (1.0 - smoothstep(0.0, 0.5, ahead)) * step(-0.3, ahead)
      * smoothstep(0.0, 0.08, uLavaFlow.y) * (1.0 - smoothstep(0.85, 1.0, uLavaFlow.y));
    float ch = aas(sc - 0.2 - 0.55 * burnN(p), PX * 2.0 + 0.01);
    col = mix(col, col * vec3(0.62, 0.5, 0.36), sc * 0.6);
    col = mix(col, vec3(0.15, 0.11, 0.09), ch * 0.92);
    col = mix(col, vec3(0.95, 0.36, 0.08), (1.0 - aas(abs(sc - 0.2 - 0.55 * burnN(p)) - 0.02, PX * 2.0 + 0.006)) * sc * 0.7);
    float rim = 1.0 - smoothstep(0.0, 0.12, ahead);
    col += vec3(1.0, 0.38, 0.08) * rim * sc * 0.8 * (0.8 + 0.2 * sin(t * 6.0 + p.x * 9.0));
    vec2 eq = p * vec2(7.0, 5.0) + vec2(0.0, t * 0.9); vec2 eid = floor(eq);
    if (hash12(eid + 9.3) < 0.35) {
      vec2 er = (fract(eq) - vec2(0.3 + 0.4 * hash12(eid), 0.5)) / vec2(7.0, 5.0);
      col = mix(col, vec3(1.0, 0.75, 0.32), cov(-(length(er) - 0.007)) * sc * (1.0 - fract(eq.y)));
    }
  }

  // fog: stylized clouds with a lit rim, casting a shadow on the revealed side
  vec2 fso = p + vec2(-0.12, -0.16);
  if (uFogSplit < 0.5) {
    float fe = F > 0.1 ? fogEdge(p) : -1.0;
    float fogA = aas(fe, 0.02);
    if (fogA < 1.0 && gatherFog(fso) > 0.1) {
      float fs = aas(fogEdge(fso), 0.03);
      col *= 1.0 - 0.64 * uTP[4].z * fs;
    }
    if (fogA > 0.0) col = mix(col, cloudColor(p, t, fe), fogA);
  } else {
    // the clouds are drawn by the fog pass above the grid, only their shadow falls on the terrain
    float fsc = 0.0;
    fogCloud(fso, fsc);
    col *= 1.0 - 0.64 * uTP[4].z * fsc;
  }

  // grid lines: one device pixel wide at every zoom level
  if (uGridA > 0.0) col = mix(col, vec3(0.0), gridLine(p) * uGridA);
  // outside the map the page background shows through
  outColor = inside ? vec4(clamp(col, 0.0, 1.0), 1.0) : vec4(0.0);
}
#endif`;

/** Fog pass: the same source with FOG_PASS defined. */
export const TERRAIN_FOG_FRAGMENT_SHADER = TERRAIN_FRAGMENT_SHADER.replace('#version 300 es\n', '#version 300 es\n#define FOG_PASS\n');

export const TERRAIN_UNIFORM_NAMES = [
  'uMap', 'uRes', 'uOff', 'uScale', 'uDpr', 'uGrid', 'uTime', 'uAnim',
  'uTP', 'uSE', 'uFrz', 'uBrn', 'uCor', 'uCry', 'uHeat', 'uGridA',
  'uPrevEdge', 'uLavaFlow', 'uFogSplit', 'uFogLift',
] as const;

export type TerrainUniformName = (typeof TERRAIN_UNIFORM_NAMES)[number];
