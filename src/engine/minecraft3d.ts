import { CharacterPose, SkinModel } from '../types';

/**
 * Pure WebGL1 + Canvas 2D Software 3D Minecraft Character Renderer
 * - Exact Steve (4px) and Slim (3px) geometry matching
 * - Full 3D outer layers (Hat, Jacket, Sleeves, Pants) with crisp alpha cutoff
 * - Zero head-drop / tilt glitch: neck pivot locked strictly at (0, 24, 0) flush on torso
 * - Supports 64x64 modern, 128x128+ HD, and 64x32 legacy Minecraft skin sheets
 * - Safe DPR capping (<= 1.5), context-loss recovery, and zero-WebGL Canvas 2D fallback
 * - Shared offscreen thumbnail baker so ranked lists never exceed mobile WebGL context limits
 */

type Mat4 = Float32Array;
type Vec3 = [number, number, number];

interface PartSpec {
  id: string;
  pivot: Vec3;
  offset: Vec3;
  size: Vec3;
  texOrigin: [number, number];
  texDims: [number, number, number];
  isOuter: boolean;
  inflate: number;
  limb: 'head' | 'body' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
}

interface FaceDef {
  verts: [Vec3, Vec3, Vec3, Vec3];
  normal: Vec3;
  uv: [number, number, number, number]; // [u0, v0, u1, v1] normalized 0..1
}

// ---------- Minimal 4x4 Matrix Math (Column-Major for WebGL) ----------

function mat4Identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4];
    const b1 = b[c * 4 + 1];
    const b2 = b[c * 4 + 2];
    const b3 = b[c * 4 + 3];
    out[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

function mat4Translate(x: number, y: number, z: number): Mat4 {
  const m = mat4Identity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

function mat4RotateX(rad: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

function mat4RotateY(rad: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

function mat4RotateZ(rad: number): Mat4 {
  const m = mat4Identity();
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

function mat4Perspective(fovRad: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1.0 / Math.tan(fovRad / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

function transformPoint(m: Mat4, p: Vec3): [number, number, number, number] {
  const x = p[0],
    y = p[1],
    z = p[2];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}

function transformNormal(m: Mat4, n: Vec3): Vec3 {
  const x = m[0] * n[0] + m[4] * n[1] + m[8] * n[2];
  const y = m[1] * n[0] + m[5] * n[1] + m[9] * n[2];
  const z = m[2] * n[0] + m[6] * n[1] + m[10] * n[2];
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

// ---------- Minecraft Skin Sheet Normalization ----------

const skinCanvasCache = new Map<string, HTMLCanvasElement>();

function copyFlippedRect(
  src: HTMLCanvasElement,
  dstCtx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number
) {
  dstCtx.save();
  dstCtx.translate(dx + sw, dy);
  dstCtx.scale(-1, 1);
  dstCtx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
  dstCtx.restore();
}

export function loadNormalizedSkinCanvas(skinDataUrl: string): Promise<HTMLCanvasElement> {
  const cached = skinCanvasCache.get(skinDataUrl);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    if (!skinDataUrl) {
      reject(new Error('Empty skin URL'));
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const isLegacy64x32 = img.width === img.height * 2;
        const size = isLegacy64x32 ? Math.max(64, img.width) : Math.max(64, Math.min(256, img.width));
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No 2D context'));
          return;
        }
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, size, size);

        if (isLegacy64x32) {
          // Convert 64x32 legacy sheet to modern 64x64 layout
          const half = size / 2;
          ctx.drawImage(img, 0, 0, size, half);
          const s = size / 64;
          // Mirror right leg (0,16,16,16) into left leg (16,48,16,16)
          copyFlippedRect(canvas, ctx, 4 * s, 16 * s, 4 * s, 4 * s, 20 * s, 48 * s); // top
          copyFlippedRect(canvas, ctx, 8 * s, 16 * s, 4 * s, 4 * s, 24 * s, 48 * s); // bottom
          copyFlippedRect(canvas, ctx, 0 * s, 20 * s, 4 * s, 12 * s, 24 * s, 52 * s); // right->left
          copyFlippedRect(canvas, ctx, 4 * s, 20 * s, 4 * s, 12 * s, 20 * s, 52 * s); // front
          copyFlippedRect(canvas, ctx, 8 * s, 20 * s, 4 * s, 12 * s, 16 * s, 52 * s); // left->right
          copyFlippedRect(canvas, ctx, 12 * s, 20 * s, 4 * s, 12 * s, 28 * s, 52 * s); // back

          // Mirror right arm (40,16,16,16) into left arm (32,48,16,16)
          copyFlippedRect(canvas, ctx, 44 * s, 16 * s, 4 * s, 4 * s, 36 * s, 48 * s);
          copyFlippedRect(canvas, ctx, 48 * s, 16 * s, 4 * s, 4 * s, 40 * s, 48 * s);
          copyFlippedRect(canvas, ctx, 40 * s, 20 * s, 4 * s, 12 * s, 40 * s, 52 * s);
          copyFlippedRect(canvas, ctx, 44 * s, 20 * s, 4 * s, 12 * s, 36 * s, 52 * s);
          copyFlippedRect(canvas, ctx, 48 * s, 20 * s, 4 * s, 12 * s, 32 * s, 52 * s);
          copyFlippedRect(canvas, ctx, 52 * s, 20 * s, 4 * s, 12 * s, 44 * s, 52 * s);
        } else {
          ctx.drawImage(img, 0, 0, size, size);
        }

        // LRU cap to keep mobile memory footprint tiny
        if (skinCanvasCache.size > 48) {
          const firstKey = skinCanvasCache.keys().next().value;
          if (firstKey) skinCanvasCache.delete(firstKey);
        }
        skinCanvasCache.set(skinDataUrl, canvas);
        resolve(canvas);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Failed to load skin texture'));
    img.src = skinDataUrl;
  });
}

// ---------- Exact Minecraft Skeleton & UV Builder ----------

function getCharacterParts(model: SkinModel, showOuter: boolean): PartSpec[] {
  const armW = model === 'slim' ? 3 : 4;
  // Exact flush shoulder alignment: torso half-width is 4, arm half-width is armW/2
  const shoulderX = 4 + armW / 2;

  const parts: PartSpec[] = [
    // Inner Base Layer
    {
      id: 'torso',
      pivot: [0, 18, 0],
      offset: [0, 0, 0],
      size: [8, 12, 4],
      texOrigin: [16, 16],
      texDims: [8, 12, 4],
      isOuter: false,
      inflate: 0,
      limb: 'body',
    },
    {
      // Neck anchored firmly at (0, 24, 0) flush on top of torso (y=24) -> ZERO head drop
      id: 'head',
      pivot: [0, 24, 0],
      offset: [0, 4, 0],
      size: [8, 8, 8],
      texOrigin: [0, 0],
      texDims: [8, 8, 8],
      isOuter: false,
      inflate: 0,
      limb: 'head',
    },
    {
      id: 'rightArm',
      pivot: [-shoulderX, 22, 0],
      offset: [0, -4, 0],
      size: [armW, 12, 4],
      texOrigin: [40, 16],
      texDims: [armW, 12, 4],
      isOuter: false,
      inflate: 0,
      limb: 'rightArm',
    },
    {
      id: 'leftArm',
      pivot: [shoulderX, 22, 0],
      offset: [0, -4, 0],
      size: [armW, 12, 4],
      texOrigin: [32, 48],
      texDims: [armW, 12, 4],
      isOuter: false,
      inflate: 0,
      limb: 'leftArm',
    },
    {
      id: 'rightLeg',
      pivot: [-2, 12, 0],
      offset: [0, -6, 0],
      size: [4, 12, 4],
      texOrigin: [0, 16],
      texDims: [4, 12, 4],
      isOuter: false,
      inflate: 0,
      limb: 'rightLeg',
    },
    {
      id: 'leftLeg',
      pivot: [2, 12, 0],
      offset: [0, -6, 0],
      size: [4, 12, 4],
      texOrigin: [16, 48],
      texDims: [4, 12, 4],
      isOuter: false,
      inflate: 0,
      limb: 'leftLeg',
    },
  ];

  if (showOuter) {
    parts.push(
      {
        id: 'jacket',
        pivot: [0, 18, 0],
        offset: [0, 0, 0],
        size: [8, 12, 4],
        texOrigin: [16, 32],
        texDims: [8, 12, 4],
        isOuter: true,
        inflate: 0.28,
        limb: 'body',
      },
      {
        id: 'hat',
        pivot: [0, 24, 0],
        offset: [0, 4, 0],
        size: [8, 8, 8],
        texOrigin: [32, 0],
        texDims: [8, 8, 8],
        isOuter: true,
        inflate: 0.45,
        limb: 'head',
      },
      {
        id: 'rightSleeve',
        pivot: [-shoulderX, 22, 0],
        offset: [0, -4, 0],
        size: [armW, 12, 4],
        texOrigin: [40, 32],
        texDims: [armW, 12, 4],
        isOuter: true,
        inflate: 0.28,
        limb: 'rightArm',
      },
      {
        id: 'leftSleeve',
        pivot: [shoulderX, 22, 0],
        offset: [0, -4, 0],
        size: [armW, 12, 4],
        texOrigin: [48, 48],
        texDims: [armW, 12, 4],
        isOuter: true,
        inflate: 0.28,
        limb: 'leftArm',
      },
      {
        id: 'rightPant',
        pivot: [-2, 12, 0],
        offset: [0, -6, 0],
        size: [4, 12, 4],
        texOrigin: [0, 32],
        texDims: [4, 12, 4],
        isOuter: true,
        inflate: 0.28,
        limb: 'rightLeg',
      },
      {
        id: 'leftPant',
        pivot: [2, 12, 0],
        offset: [0, -6, 0],
        size: [4, 12, 4],
        texOrigin: [0, 48],
        texDims: [4, 12, 4],
        isOuter: true,
        inflate: 0.28,
        limb: 'leftLeg',
      }
    );
  }

  return parts;
}

function buildBoxFaces(part: PartSpec): FaceDef[] {
  const [sx, sy, sz] = part.size;
  const inf = part.inflate;
  const hx = sx / 2 + inf;
  const hy = sy / 2 + inf;
  const hz = sz / 2 + inf;
  const [cx, cy, cz] = part.offset;
  const [ox, oy] = part.texOrigin;
  const [W, H, D] = part.texDims;

  const eps = 0.0004;
  const uvRect = (u: number, v: number, w: number, h: number): [number, number, number, number] => [
    u / 64 + eps,
    v / 64 + eps,
    (u + w) / 64 - eps,
    (v + h) / 64 - eps,
  ];

  return [
    // Front (+Z)
    {
      verts: [
        [cx - hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz + hz],
      ],
      normal: [0, 0, 1],
      uv: uvRect(ox + D, oy + D, W, H),
    },
    // Back (-Z)
    {
      verts: [
        [cx + hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
      ],
      normal: [0, 0, -1],
      uv: uvRect(ox + D + W + D, oy + D, W, H),
    },
    // Character's Right (-X, viewer's left)
    {
      verts: [
        [cx - hx, cy + hy, cz - hz],
        [cx - hx, cy + hy, cz + hz],
        [cx - hx, cy - hy, cz + hz],
        [cx - hx, cy - hy, cz - hz],
      ],
      normal: [-1, 0, 0],
      uv: uvRect(ox, oy + D, D, H),
    },
    // Character's Left (+X, viewer's right)
    {
      verts: [
        [cx + hx, cy + hy, cz + hz],
        [cx + hx, cy + hy, cz - hz],
        [cx + hx, cy - hy, cz - hz],
        [cx + hx, cy - hy, cz + hz],
      ],
      normal: [1, 0, 0],
      uv: uvRect(ox + D + W, oy + D, D, H),
    },
    // Top (+Y)
    {
      verts: [
        [cx - hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz - hz],
        [cx + hx, cy + hy, cz + hz],
        [cx - hx, cy + hy, cz + hz],
      ],
      normal: [0, 1, 0],
      uv: uvRect(ox + D, oy, W, D),
    },
    // Bottom (-Y)
    {
      verts: [
        [cx - hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz + hz],
        [cx + hx, cy - hy, cz - hz],
        [cx - hx, cy - hy, cz - hz],
      ],
      normal: [0, -1, 0],
      uv: uvRect(ox + D + W, oy, W, D),
    },
  ];
}

function getLimbMatrix(part: PartSpec, pose: CharacterPose, timeSec: number): Mat4 {
  const [px, py, pz] = part.pivot;
  let rx = 0;
  let ry = 0;
  let rz = 0;

  if (pose === 'idle') {
    const breath = Math.sin(timeSec * 2.1);
    if (part.limb === 'head') {
      // Strictly tiny natural yaw only — zero head drop or tilt glitch
      ry = Math.sin(timeSec * 0.9) * 0.08;
    } else if (part.limb === 'rightArm') {
      rx = breath * 0.04;
      rz = -0.05 - breath * 0.015;
    } else if (part.limb === 'leftArm') {
      rx = -breath * 0.04;
      rz = 0.05 + breath * 0.015;
    }
  } else if (pose === 'combat') {
    const pulse = Math.sin(timeSec * 3.0);
    if (part.limb === 'head') {
      ry = -0.14;
      rx = 0.03;
    } else if (part.limb === 'rightArm') {
      rx = -0.75 + pulse * 0.05;
      rz = -0.12;
    } else if (part.limb === 'leftArm') {
      rx = -0.35 - pulse * 0.04;
      rz = 0.16;
    } else if (part.limb === 'rightLeg') {
      rx = -0.18;
    } else if (part.limb === 'leftLeg') {
      rx = 0.2;
    }
  } else if (pose === 'walk') {
    const swing = Math.sin(timeSec * 5.2);
    if (part.limb === 'head') {
      ry = Math.sin(timeSec * 1.3) * 0.07;
    } else if (part.limb === 'rightArm') {
      rx = swing * 0.62;
      rz = -0.04;
    } else if (part.limb === 'leftArm') {
      rx = -swing * 0.62;
      rz = 0.04;
    } else if (part.limb === 'rightLeg') {
      rx = -swing * 0.58;
    } else if (part.limb === 'leftLeg') {
      rx = swing * 0.58;
    }
  } else if (pose === 'showcase') {
    const breath = Math.sin(timeSec * 2.0);
    if (part.limb === 'rightArm') {
      rx = -0.18 + breath * 0.03;
      rz = -0.08;
    } else if (part.limb === 'leftArm') {
      rx = 0.12 - breath * 0.03;
      rz = 0.08;
    } else if (part.limb === 'rightLeg') {
      rx = 0.08;
    } else if (part.limb === 'leftLeg') {
      rx = -0.08;
    }
  }

  let m = mat4Translate(px, py, pz);
  if (ry !== 0) m = mat4Multiply(m, mat4RotateY(ry));
  if (rx !== 0) m = mat4Multiply(m, mat4RotateX(rx));
  if (rz !== 0) m = mat4Multiply(m, mat4RotateZ(rz));
  return m;
}

export interface RenderOptions {
  model: SkinModel;
  pose: CharacterPose;
  yaw: number;
  pitch: number;
  zoom: number;
  showOuter: boolean;
  timeSec: number;
  cameraY?: number;
  fovDeg?: number;
}

// ---------- WebGL1 Hardware Renderer ----------

const VS_SRC = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUv;
uniform mat4 uMvp;
uniform mat4 uModel;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  gl_Position = uMvp * vec4(aPos, 1.0);
  vUv = aUv;
  vNormal = normalize(mat3(uModel) * aNormal);
}
`;

const FS_SRC = `
precision mediump float;
varying vec2 vUv;
varying vec3 vNormal;
uniform sampler2D uTex;
void main() {
  vec4 texColor = texture2D(uTex, vUv);
  if (texColor.a < 0.12) discard;
  vec3 n = normalize(vNormal);
  vec3 keyDir = normalize(vec3(0.45, 0.72, 0.85));
  vec3 fillDir = normalize(vec3(-0.65, 0.2, 0.45));
  float keyDiff = max(dot(n, keyDir), 0.0);
  float fillDiff = max(dot(n, fillDir), 0.0);
  float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 2.2) * 0.18;
  vec3 light = vec3(0.56) + vec3(0.48, 0.45, 0.42) * keyDiff + vec3(0.14, 0.16, 0.2) * fillDiff + vec3(0.28, 0.15, 0.06) * rim;
  gl_FragColor = vec4(clamp(texColor.rgb * light, 0.0, 1.0), texColor.a);
}
`;

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

interface PartBuffer {
  part: PartSpec;
  vbo: WebGLBuffer;
  vertCount: number;
}

export class MinecraftWebGLRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private buffers = new Map<string, PartBuffer[]>();
  private locPos = -1;
  private locNormal = -1;
  private locUv = -1;
  private locMvp: WebGLUniformLocation | null = null;
  private locModel: WebGLUniformLocation | null = null;
  private locTex: WebGLUniformLocation | null = null;
  private currentSkinCanvas: HTMLCanvasElement | null = null;
  private isDisposed = false;
  private contextLost = false;
  private onContextLostHandler: (e: Event) => void;
  private onContextRestoredHandler: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.onContextLostHandler = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
    };
    this.onContextRestoredHandler = () => {
      this.contextLost = false;
      this.initGL();
      if (this.currentSkinCanvas) {
        this.setSkinCanvas(this.currentSkinCanvas);
      }
    };
    this.canvas.addEventListener('webglcontextlost', this.onContextLostHandler);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestoredHandler);
    this.initGL();
  }

  public isReady(): boolean {
    return Boolean(this.gl && this.program && !this.contextLost && !this.isDisposed);
  }

  private initGL(): void {
    try {
      const gl =
        (this.canvas.getContext('webgl', {
          alpha: true,
          antialias: true,
          depth: true,
          preserveDrawingBuffer: true,
          powerPreference: 'low-power',
        }) as WebGLRenderingContext | null) ||
        (this.canvas.getContext('experimental-webgl', {
          alpha: true,
          antialias: false,
          depth: true,
          preserveDrawingBuffer: true,
        }) as WebGLRenderingContext | null);

      if (!gl) {
        this.gl = null;
        return;
      }

      const vs = compileShader(gl, gl.VERTEX_SHADER, VS_SRC);
      const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS_SRC);
      if (!vs || !fs) {
        this.gl = null;
        return;
      }

      const prog = gl.createProgram();
      if (!prog) {
        this.gl = null;
        return;
      }
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        gl.deleteProgram(prog);
        this.gl = null;
        return;
      }

      this.gl = gl;
      this.program = prog;
      this.locPos = gl.getAttribLocation(prog, 'aPos');
      this.locNormal = gl.getAttribLocation(prog, 'aNormal');
      this.locUv = gl.getAttribLocation(prog, 'aUv');
      this.locMvp = gl.getUniformLocation(prog, 'uMvp');
      this.locModel = gl.getUniformLocation(prog, 'uModel');
      this.locTex = gl.getUniformLocation(prog, 'uTex');

      this.texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.buffers.clear();
    } catch {
      this.gl = null;
    }
  }

  private getOrBuildBuffers(model: SkinModel, showOuter: boolean): PartBuffer[] {
    const key = `${model}_${showOuter ? '1' : '0'}`;
    const existing = this.buffers.get(key);
    if (existing) return existing;
    const gl = this.gl;
    if (!gl) return [];

    const parts = getCharacterParts(model, showOuter);
    const created: PartBuffer[] = [];

    for (const part of parts) {
      const faces = buildBoxFaces(part);
      // 6 faces * 2 triangles * 3 verts * 8 floats (pos3 + norm3 + uv2)
      const data = new Float32Array(faces.length * 6 * 8);
      let idx = 0;

      for (const f of faces) {
        const [v0, v1, v2, v3] = f.verts;
        const [nx, ny, nz] = f.normal;
        const [u0, t0, u1, t1] = f.uv;
        const tris: [Vec3, number, number][] = [
          [v0, u0, t0],
          [v3, u0, t1],
          [v2, u1, t1],
          [v0, u0, t0],
          [v2, u1, t1],
          [v1, u1, t0],
        ];
        for (const [v, u, tv] of tris) {
          data[idx++] = v[0];
          data[idx++] = v[1];
          data[idx++] = v[2];
          data[idx++] = nx;
          data[idx++] = ny;
          data[idx++] = nz;
          data[idx++] = u;
          data[idx++] = tv;
        }
      }

      const vbo = gl.createBuffer();
      if (vbo) {
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        created.push({ part, vbo, vertCount: faces.length * 6 });
      }
    }

    this.buffers.set(key, created);
    return created;
  }

  public setSkinCanvas(skinCanvas: HTMLCanvasElement): void {
    this.currentSkinCanvas = skinCanvas;
    const gl = this.gl;
    if (!gl || !this.texture || this.contextLost) return;
    try {
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, skinCanvas);
    } catch {
      // ignore upload error
    }
  }

  public render(opts: RenderOptions): boolean {
    const gl = this.gl;
    if (!gl || !this.program || !this.texture || this.contextLost || !this.currentSkinCanvas) {
      return false;
    }

    try {
      const w = this.canvas.width;
      const h = this.canvas.height;
      if (w === 0 || h === 0) return false;

      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.uniform1i(this.locTex, 0);

      const fovRad = ((opts.fovDeg ?? 36) * Math.PI) / 180;
      const proj = mat4Perspective(fovRad, w / h, 1, 220);

      const camY = opts.cameraY ?? 16.5;
      const dist = 54 / Math.max(0.45, opts.zoom);

      // View matrix: orbit cleanly around character focal point (0, camY, 0)
      let root = mat4Translate(0, 0, -dist);
      root = mat4Multiply(root, mat4RotateX(opts.pitch));
      root = mat4Multiply(root, mat4RotateY(opts.yaw));
      root = mat4Multiply(root, mat4Translate(0, -camY, 0));

      const partBuffers = this.getOrBuildBuffers(opts.model, opts.showOuter);
      const stride = 8 * 4;

      // Pass 1: Inner solid body parts (cull backfaces)
      // Pass 2: Outer 3D layers (disable cull so transparent helmet/jacket interiors look real)
      for (let pass = 0; pass < 2; pass++) {
        const wantOuter = pass === 1;
        if (wantOuter) {
          gl.disable(gl.CULL_FACE);
        } else {
          gl.enable(gl.CULL_FACE);
          gl.cullFace(gl.BACK);
        }

        for (const pb of partBuffers) {
          if (pb.part.isOuter !== wantOuter) continue;

          const limbM = getLimbMatrix(pb.part, opts.pose, opts.timeSec);
          const worldRot = mat4Multiply(
            mat4RotateX(opts.pitch),
            mat4Multiply(mat4RotateY(opts.yaw), limbM)
          );
          const mv = mat4Multiply(root, limbM);
          const mvp = mat4Multiply(proj, mv);

          gl.uniformMatrix4fv(this.locMvp, false, mvp);
          gl.uniformMatrix4fv(this.locModel, false, worldRot);

          gl.bindBuffer(gl.ARRAY_BUFFER, pb.vbo);
          gl.enableVertexAttribArray(this.locPos);
          gl.vertexAttribPointer(this.locPos, 3, gl.FLOAT, false, stride, 0);
          gl.enableVertexAttribArray(this.locNormal);
          gl.vertexAttribPointer(this.locNormal, 3, gl.FLOAT, false, stride, 3 * 4);
          gl.enableVertexAttribArray(this.locUv);
          gl.vertexAttribPointer(this.locUv, 2, gl.FLOAT, false, stride, 6 * 4);

          gl.drawArrays(gl.TRIANGLES, 0, pb.vertCount);
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onContextLostHandler);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestoredHandler);
    try {
      const gl = this.gl;
      if (gl) {
        for (const list of this.buffers.values()) {
          for (const pb of list) {
            gl.deleteBuffer(pb.vbo);
          }
        }
        this.buffers.clear();
        if (this.texture) gl.deleteTexture(this.texture);
        if (this.program) gl.deleteProgram(this.program);
        const ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
      }
    } catch {
      // ignore cleanup errors
    }
    this.gl = null;
    this.program = null;
    this.texture = null;
  }
}

// ---------- Pure Canvas 2D 3D-Projected Software Fallback Renderer ----------

interface ProjectedFace {
  pts: [number, number][];
  depth: number;
  isOuter: boolean;
  shade: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  x0: number,
  y0: number,
  u0: number,
  v0: number,
  x1: number,
  y1: number,
  u1: number,
  v1: number,
  x2: number,
  y2: number,
  u2: number,
  v2: number
) {
  const denom = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
  if (Math.abs(denom) < 1e-6) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.clip();

  const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / denom;
  const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / denom;
  const c = ((u1 - u0) * (x2 - x0) - (u2 - u0) * (x1 - x0)) / denom;
  const d = ((u1 - u0) * (y2 - y0) - (u2 - u0) * (y1 - y0)) / denom;
  const e = x0 - a * u0 - c * v0;
  const f = y0 - b * u0 - d * v0;

  ctx.transform(a, b, c, d, e, f);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

/**
 * Pure Canvas 2D 3D software rasterizer for zero-WebGL / low-end fallback.
 * Uses painter's algorithm depth sorting + affine crisp pixel-art mapping.
 */
export function renderMinecraftSoftware2D(
  canvas: HTMLCanvasElement,
  skinCanvas: HTMLCanvasElement,
  opts: RenderOptions
): boolean {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) return false;

    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;

    const fovRad = ((opts.fovDeg ?? 36) * Math.PI) / 180;
    const proj = mat4Perspective(fovRad, w / h, 1, 220);
    const camY = opts.cameraY ?? 16.5;
    const dist = 54 / Math.max(0.45, opts.zoom);

    let root = mat4Translate(0, 0, -dist);
    root = mat4Multiply(root, mat4RotateX(opts.pitch));
    root = mat4Multiply(root, mat4RotateY(opts.yaw));
    root = mat4Multiply(root, mat4Translate(0, -camY, 0));

    const parts = getCharacterParts(opts.model, opts.showOuter);
    const drawList: ProjectedFace[] = [];
    const texSize = skinCanvas.width;

    for (const part of parts) {
      const limbM = getLimbMatrix(part, opts.pose, opts.timeSec);
      const mv = mat4Multiply(root, limbM);
      const mvp = mat4Multiply(proj, mv);
      const faces = buildBoxFaces(part);

      for (const face of faces) {
        const screenPts: [number, number][] = [];
        let zSum = 0;
        let clipped = false;

        for (const v of face.verts) {
          const [cx, cy, cz, cw] = transformPoint(mvp, v);
          if (cw <= 0.1) {
            clipped = true;
            break;
          }
          const ndcX = cx / cw;
          const ndcY = cy / cw;
          screenPts.push([(ndcX * 0.5 + 0.5) * w, (0.5 - ndcY * 0.5) * h]);
          const [, , vz] = transformPoint(mv, v);
          zSum += vz;
        }
        if (clipped || screenPts.length !== 4) continue;

        // 2D screen cross product for backface culling
        const [p0, p1, p2] = screenPts;
        const cross = (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]);
        if (!part.isOuter && cross <= 0) continue;

        const wn = transformNormal(mv, face.normal);
        const keyDot = Math.max(0, wn[0] * 0.4 + wn[1] * 0.65 + wn[2] * 0.78);
        const shade = Math.min(1, 0.56 + keyDot * 0.44);

        const [u0, v0, u1, v1] = face.uv;
        drawList.push({
          pts: screenPts,
          depth: zSum / 4 + (part.isOuter ? 0.15 : 0),
          isOuter: part.isOuter,
          shade,
          sx: u0 * texSize,
          sy: v0 * texSize,
          sw: (u1 - u0) * texSize,
          sh: (v1 - v0) * texSize,
        });
      }
    }

    // Painter's sort: farthest negative Z drawn first
    drawList.sort((a, b) => a.depth - b.depth);

    for (const f of drawList) {
      const [p0, p1, p2, p3] = f.pts;
      const u0 = f.sx;
      const v0 = f.sy;
      const u1 = f.sx + f.sw;
      const v1 = f.sy + f.sh;

      drawTexturedTriangle(
        ctx,
        skinCanvas,
        p0[0],
        p0[1],
        u0,
        v0,
        p1[0],
        p1[1],
        u1,
        v0,
        p2[0],
        p2[1],
        u1,
        v1
      );
      drawTexturedTriangle(
        ctx,
        skinCanvas,
        p0[0],
        p0[1],
        u0,
        v0,
        p2[0],
        p2[1],
        u1,
        v1,
        p3[0],
        p3[1],
        u0,
        v1
      );

      // Subtle directional shading veil (only darken shadow faces slightly)
      if (!f.isOuter && f.shade < 0.92) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(p0[0], p0[1]);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.lineTo(p3[0], p3[1]);
        ctx.closePath();
        ctx.fillStyle = `rgba(6, 7, 10, ${(1 - f.shade) * 0.58})`;
        ctx.fill();
        ctx.restore();
      }
    }

    return true;
  } catch {
    return false;
  }
}

// ---------- Shared Offscreen 3D Thumbnail Baker (Low-End Mobile Safe) ----------

let sharedGlCanvas: HTMLCanvasElement | null = null;
let sharedGlRenderer: MinecraftWebGLRenderer | null = null;
let shared2dCanvas: HTMLCanvasElement | null = null;
const thumbnailCache = new Map<string, string>();

function hashQuick(str: string): string {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += Math.max(1, Math.floor(str.length / 128))) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${str.length}_${(h >>> 0).toString(36)}`;
}

export async function bake3DCharacterSnapshot(params: {
  skinDataUrl: string;
  model: SkinModel;
  variant: 'bust' | 'full';
  forceSoftware2D?: boolean;
}): Promise<string> {
  const { skinDataUrl, model, variant, forceSoftware2D = false } = params;
  const cacheKey = `${hashQuick(skinDataUrl)}|${model}|${variant}|${forceSoftware2D ? '2d' : 'gl'}`;
  const cached = thumbnailCache.get(cacheKey);
  if (cached) return cached;

  const skinCanvas = await loadNormalizedSkinCanvas(skinDataUrl);

  const width = variant === 'bust' ? 160 : 210;
  const height = variant === 'bust' ? 160 : 260;

  const renderOpts: RenderOptions =
    variant === 'bust'
      ? {
          model,
          pose: 'showcase',
          yaw: 0.42,
          pitch: 0.14,
          zoom: 1.55,
          showOuter: true,
          timeSec: 0,
          cameraY: 23.2,
          fovDeg: 32,
        }
      : {
          model,
          pose: 'combat',
          yaw: 0.36,
          pitch: 0.1,
          zoom: 1.04,
          showOuter: true,
          timeSec: 0.4,
          cameraY: 16.2,
          fovDeg: 36,
        };

  let dataUrl = '';

  if (!forceSoftware2D) {
    try {
      if (!sharedGlCanvas) {
        sharedGlCanvas = document.createElement('canvas');
      }
      sharedGlCanvas.width = width;
      sharedGlCanvas.height = height;
      if (!sharedGlRenderer || !sharedGlRenderer.isReady()) {
        sharedGlRenderer?.dispose();
        sharedGlRenderer = new MinecraftWebGLRenderer(sharedGlCanvas);
      }
      if (sharedGlRenderer.isReady()) {
        sharedGlRenderer.setSkinCanvas(skinCanvas);
        const ok = sharedGlRenderer.render(renderOpts);
        if (ok) {
          dataUrl = sharedGlCanvas.toDataURL('image/png');
        }
      }
    } catch {
      dataUrl = '';
    }
  }

  // Automatic pure Canvas 2D 3D fallback if WebGL failed or software mode requested
  if (!dataUrl) {
    if (!shared2dCanvas) {
      shared2dCanvas = document.createElement('canvas');
    }
    shared2dCanvas.width = width;
    shared2dCanvas.height = height;
    renderMinecraftSoftware2D(shared2dCanvas, skinCanvas, renderOpts);
    dataUrl = shared2dCanvas.toDataURL('image/png');
  }

  if (thumbnailCache.size > 80) {
    const first = thumbnailCache.keys().next().value;
    if (first) thumbnailCache.delete(first);
  }
  thumbnailCache.set(cacheKey, dataUrl);
  return dataUrl;
}

export function clearThumbnailCache(): void {
  thumbnailCache.clear();
}
