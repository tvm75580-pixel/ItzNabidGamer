import { PlayerRecord, SkinModel } from '../types';

interface SkinPalette {
  skin: string;
  skinShade: string;
  hair: string;
  hairAccent: string;
  eyes: string;
  suitDark: string;
  suitMid: string;
  accent: string;
  trim: string;
  boots: string;
  visor?: string;
  crown?: boolean;
  scarf?: boolean;
}

/**
 * Procedurally paints an authentic, crisp 64x64 Minecraft skin with full 3D outer layers
 * (hat/crown/visor, jacket collar/armor trim, sleeve gauntlets, boot cuffs).
 * Runs 100% offline with zero network calls and strictly avoids purple hues.
 */
export function generateProceduralSkin(
  palette: SkinPalette,
  model: SkinModel = 'classic'
): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 64, 64);

    const px = (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    };

    const armW = model === 'slim' ? 3 : 4;

    // 1. HEAD INNER (ox=0, oy=0, 8x8x8)
    // Fill entire head UV block with skin base
    px(8, 0, 16, 8, palette.hair); // top + bottom
    px(0, 8, 32, 8, palette.skin); // right, front, left, back
    // Hair back & sides
    px(24, 8, 8, 8, palette.hair);
    px(0, 8, 8, 4, palette.hair);
    px(0, 12, 3, 4, palette.hair);
    px(16, 8, 8, 4, palette.hair);
    px(21, 12, 3, 4, palette.hair);
    // Hair bangs on front (8..16, 8..16)
    px(8, 8, 8, 2, palette.hair);
    px(8, 10, 1, 2, palette.hair);
    px(15, 10, 1, 2, palette.hair);
    // Subtle chin/cheek shading
    px(8, 15, 8, 1, palette.skinShade);
    px(11, 14, 2, 1, palette.skinShade);
    // Eyes (front face at x=8..15, y=8..15)
    px(9, 12, 2, 1, '#f8fafc');
    px(10, 12, 1, 1, palette.eyes);
    px(13, 12, 2, 1, '#f8fafc');
    px(13, 12, 1, 1, palette.eyes);

    // 2. HEAD OUTER LAYER / HAT (ox=32, oy=0, 8x8x8)
    // Textured hair tuft + tactical esports crown/visor
    px(40, 0, 8, 8, palette.hairAccent);
    px(41, 1, 6, 6, palette.hair);
    // Side hair framing
    px(32, 8, 8, 3, palette.hairAccent);
    px(48, 8, 8, 3, palette.hairAccent);
    px(56, 8, 8, 5, palette.hairAccent);
    // Front bangs 3D overhang
    px(40, 8, 8, 2, palette.hairAccent);
    px(40, 10, 2, 1, palette.hairAccent);
    px(46, 10, 2, 1, palette.hairAccent);

    if (palette.crown) {
      // Molten gold esports crown on outer hat layer
      px(40, 8, 8, 1, palette.trim);
      px(40, 9, 8, 1, palette.accent);
      px(41, 8, 1, 1, '#fef08a');
      px(43, 8, 2, 1, '#fef08a');
      px(46, 8, 1, 1, '#fef08a');
      px(32, 8, 8, 2, palette.accent);
      px(48, 8, 8, 2, palette.accent);
      px(56, 8, 8, 2, palette.accent);
    }

    if (palette.visor) {
      // Tactical glowing visor bar across brow/eyes
      px(40, 11, 8, 1, palette.suitDark);
      px(41, 12, 6, 1, palette.visor);
      px(33, 11, 7, 2, palette.suitDark);
      px(48, 11, 7, 2, palette.suitDark);
    }

    if (palette.scarf) {
      // Lower face tactical mask / collar
      px(40, 14, 8, 2, palette.accent);
      px(42, 14, 4, 1, palette.trim);
      px(32, 14, 8, 2, palette.suitDark);
      px(48, 14, 8, 2, palette.suitDark);
    }

    // 3. TORSO INNER (ox=16, oy=16, 8x12x4)
    px(20, 16, 16, 4, palette.suitDark); // top/bottom
    px(16, 20, 24, 12, palette.suitDark); // sides/front/back
    // Front chest plate (20..28, 20..32)
    px(21, 21, 6, 9, palette.suitMid);
    // Chest emblem V-stripe
    px(22, 22, 4, 2, palette.accent);
    px(23, 24, 2, 3, palette.trim);
    // Belt
    px(16, 30, 24, 2, palette.boots);
    px(23, 30, 2, 2, palette.trim);
    // Back emblem (32..40, 20..32)
    px(34, 22, 4, 5, palette.accent);
    px(35, 23, 2, 3, palette.trim);

    // 4. TORSO OUTER / JACKET (ox=16, oy=32, 8x12x4)
    // Open tactical esports jacket panels + collar
    px(20, 36, 2, 11, palette.suitMid);
    px(26, 36, 2, 11, palette.suitMid);
    px(21, 36, 1, 10, palette.accent);
    px(26, 36, 1, 10, palette.accent);
    // Collar rim
    px(20, 36, 8, 1, palette.trim);
    // Back jacket trim
    px(32, 36, 8, 2, palette.suitMid);
    px(33, 37, 6, 1, palette.accent);
    px(32, 45, 8, 2, palette.suitMid);
    // Side panels
    px(16, 36, 4, 11, palette.suitMid);
    px(28, 36, 4, 11, palette.suitMid);

    // 5. RIGHT ARM INNER (ox=40, oy=16, armW x 12 x 4)
    const armBlockW = 4 + armW + 4 + armW;
    px(44, 16, armW * 2, 4, palette.suitDark);
    px(40, 20, armBlockW, 12, palette.suitDark);
    // Hand skin
    px(40, 29, armBlockW, 3, palette.skin);
    px(44, 16 + 0, armW, 4, palette.suitMid); // shoulder top
    // Forearm accent stripe
    px(40, 27, armBlockW, 2, palette.accent);

    // 6. RIGHT SLEEVE OUTER (ox=40, oy=32)
    px(44, 32, armW, 4, palette.suitMid);
    px(40, 36, armBlockW, 4, palette.suitMid); // shoulder pauldron
    px(40, 39, armBlockW, 1, palette.trim);
    px(40, 44, armBlockW, 2, palette.accent); // wrist cuff

    // 7. LEFT ARM INNER (ox=32, oy=48)
    px(36, 48, armW * 2, 4, palette.suitDark);
    px(32, 52, armBlockW, 12, palette.suitDark);
    px(32, 61, armBlockW, 3, palette.skin);
    px(32, 59, armBlockW, 2, palette.accent);

    // 8. LEFT SLEEVE OUTER (ox=48, oy=48)
    px(52, 48, armW, 4, palette.suitMid);
    px(48, 52, armBlockW, 4, palette.suitMid);
    px(48, 55, armBlockW, 1, palette.trim);
    px(48, 60, armBlockW, 2, palette.accent);

    // 9. RIGHT LEG INNER (ox=0, oy=16, 4x12x4)
    px(4, 16, 8, 4, palette.suitDark);
    px(0, 20, 16, 12, palette.suitDark);
    px(0, 28, 16, 4, palette.boots);
    px(4, 24, 4, 2, palette.suitMid); // knee pad

    // 10. RIGHT PANT OUTER (ox=0, oy=32)
    px(0, 36, 16, 3, palette.suitMid);
    px(0, 44, 16, 3, palette.boots);
    px(0, 44, 16, 1, palette.trim); // boot trim

    // 11. LEFT LEG INNER (ox=16, oy=48, 4x12x4)
    px(20, 48, 8, 4, palette.suitDark);
    px(16, 52, 16, 12, palette.suitDark);
    px(16, 60, 16, 4, palette.boots);
    px(20, 56, 4, 2, palette.suitMid);

    // 12. LEFT PANT OUTER (ox=0, oy=48)
    px(0, 52, 16, 3, palette.suitMid);
    px(0, 60, 16, 3, palette.boots);
    px(0, 60, 16, 1, palette.trim);

    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}

/**
 * Automatically detects whether an uploaded 64x64 Minecraft skin PNG is Slim (3px) or Classic (4px)
 * by inspecting the unused column on the classic right arm (x=54..55, y=20..31).
 */
export function detectSkinModelFromImage(img: HTMLImageElement): SkinModel {
  try {
    if (img.width === 64 && img.height === 32) {
      return 'classic';
    }
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (!ctx) return 'classic';
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, 64, 64);

    // In 64x64 Slim skins, right-arm back face ends at x=53 (40 + 4 + 3 + 4 + 3 = 54),
    // leaving x=54 and x=55 completely transparent at y=20..31.
    const data = ctx.getImageData(54, 20, 2, 12).data;
    let opaquePixels = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 20) opaquePixels++;
    }
    return opaquePixels === 0 ? 'slim' : 'classic';
  } catch {
    return 'classic';
  }
}

export function createSeedPlayers(): PlayerRecord[] {
  const now = Date.now();
  return [
    {
      id: 'pl-itznabidgamer',
      ign: 'ItzNabidGamer',
      region: 'AS',
      status: 'PRO',
      skinModel: 'slim',
      clan: 'OBS',
      bio: 'Founder & Grandmaster Crystal / Sword duelist. Reigning Obsidian circuit #1.',
      skinDataUrl: generateProceduralSkin(
        {
          skin: '#f1c29b',
          skinShade: '#d9a17a',
          hair: '#14171f',
          hairAccent: '#1f2430',
          eyes: '#f97316',
          suitDark: '#0b0e14',
          suitMid: '#181e2c',
          accent: '#f97316',
          trim: '#eab308',
          boots: '#090b10',
          crown: true,
          scarf: true,
        },
        'slim'
      ),
      tiers: {
        crystal: 'HT1',
        sword: 'HT1',
        nethpot: 'LT1',
        uhc: 'HT1',
        axe: 'HT2',
        smp: 'LT1',
        mace: 'HT1',
      },
      updatedAt: now,
    },
    {
      id: 'pl-kaze-crimson',
      ign: 'KazeBlade',
      region: 'NA',
      status: 'PRO',
      skinModel: 'classic',
      clan: 'CRSN',
      bio: 'High-CPS NethPot & Sword specialist known for relentless sprint-reset combos.',
      skinDataUrl: generateProceduralSkin(
        {
          skin: '#ecc09f',
          skinShade: '#cfa07d',
          hair: '#291518',
          hairAccent: '#451a1f',
          eyes: '#ef4444',
          suitDark: '#121216',
          suitMid: '#261418',
          accent: '#ef4444',
          trim: '#f97316',
          boots: '#0e0c0f',
          visor: '#ef4444',
        },
        'classic'
      ),
      tiers: {
        crystal: 'LT1',
        sword: 'HT1',
        nethpot: 'HT1',
        uhc: 'LT1',
        axe: 'HT2',
        smp: 'HT2',
        mace: 'LT2',
      },
      updatedAt: now - 1000,
    },
    {
      id: 'pl-solaris-gold',
      ign: 'SolarisX',
      region: 'EU',
      status: 'PRO',
      skinModel: 'slim',
      clan: 'APEX',
      bio: 'Precision Crystal anchor & Mace air-combo tactician with 94% scrim winrate.',
      skinDataUrl: generateProceduralSkin(
        {
          skin: '#f6d2b4',
          skinShade: '#ddb18e',
          hair: '#d97706',
          hairAccent: '#eab308',
          eyes: '#eab308',
          suitDark: '#141311',
          suitMid: '#272219',
          accent: '#eab308',
          trim: '#fef08a',
          boots: '#11100d',
          crown: true,
        },
        'slim'
      ),
      tiers: {
        crystal: 'HT1',
        sword: 'LT1',
        nethpot: 'HT2',
        uhc: 'HT2',
        axe: 'LT1',
        smp: 'HT2',
        mace: 'HT1',
      },
      updatedAt: now - 2000,
    },
    {
      id: 'pl-ironclad-v',
      ign: 'ValkorIron',
      region: 'EU',
      status: 'PRO',
      skinModel: 'classic',
      clan: 'FORGE',
      bio: 'Dominant Axe & Shield heavyweight and veteran UHC finalist.',
      skinDataUrl: generateProceduralSkin(
        {
          skin: '#d9a784',
          skinShade: '#be8a68',
          hair: '#334155',
          hairAccent: '#475569',
          eyes: '#f59e0b',
          suitDark: '#111620',
          suitMid: '#273244',
          accent: '#94a3b8',
          trim: '#f97316',
          boots: '#0f131b',
          visor: '#f59e0b',
        },
        'classic'
      ),
      tiers: {
        crystal: 'HT2',
        sword: 'HT2',
        nethpot: 'LT2',
        uhc: 'HT1',
        axe: 'HT1',
        smp: 'HT3',
        mace: 'HT2',
      },
      updatedAt: now - 3000,
    },
    {
      id: 'pl-pyro-drift',
      ign: 'PyroDrift',
      region: 'AS',
      status: 'PRO',
      skinModel: 'slim',
      clan: 'OBS',
      bio: 'Aggressive SMP kit rusher and wind-charge Mace climber.',
      skinDataUrl: generateProceduralSkin(
        {
          skin: '#e7b993',
          skinShade: '#cb9973',
          hair: '#7c2d12',
          hairAccent: '#c2410c',
          eyes: '#f97316',
          suitDark: '#17110e',
          suitMid: '#2c1b13',
          accent: '#f97316',
          trim: '#ef4444',
          boots: '#110d0b',
          scarf: true,
        },
        'slim'
      ),
      tiers: {
        crystal: 'LT2',
        sword: 'HT2',
        nethpot: 'HT2',
        uhc: 'LT2',
        axe: 'HT3',
        smp: 'HT1',
        mace: 'LT1',
      },
      updatedAt: now - 4000,
    },
    {
      id: 'pl-warden-ash',
      ign: 'AshBreaker',
      region: 'NA',
      status: 'PRO',
      skinModel: 'classic',
      clan: 'ASH',
      bio: 'Consistent all-rounder across Sword, UHC, and Axe brackets.',
      skinDataUrl: generateProceduralSkin(
        {
          skin: '#c6906b',
          skinShade: '#a67452',
          hair: '#18181b',
          hairAccent: '#27272a',
          eyes: '#22c55e',
          suitDark: '#0f1412',
          suitMid: '#1d2b24',
          accent: '#10b981',
          trim: '#eab308',
          boots: '#0a0e0c',
          visor: '#22c55e',
        },
        'classic'
      ),
      tiers: {
        crystal: 'HT3',
        sword: 'LT2',
        nethpot: 'HT3',
        uhc: 'HT2',
        axe: 'LT2',
        smp: 'HT3',
        mace: 'HT3',
      },
      updatedAt: now - 5000,
    },
    {
      id: 'pl-ember-fox',
      ign: 'EmberKitsune',
      region: 'OC',
      status: 'NOOB',
      skinModel: 'slim',
      clan: 'KIT',
      bio: 'Rising challenger grinding Sword and SMP ladders from LT4 to HT3.',
      skinDataUrl: generateProceduralSkin(
        {
          skin: '#f5ccb0',
          skinShade: '#dcaf92',
          hair: '#b91c1c',
          hairAccent: '#ef4444',
          eyes: '#eab308',
          suitDark: '#191214',
          suitMid: '#2e1c20',
          accent: '#ea580c',
          trim: '#fde047',
          boots: '#120d0e',
          scarf: true,
        },
        'slim'
      ),
      tiers: {
        crystal: 'LT3',
        sword: 'HT3',
        nethpot: 'LT4',
        uhc: 'HT4',
        axe: 'LT4',
        smp: 'HT3',
        mace: 'HT4',
      },
      updatedAt: now - 6000,
    },
    {
      id: 'pl-cobble-kid',
      ign: 'CobbleSpark',
      region: 'SA',
      status: 'NOOB',
      skinModel: 'classic',
      bio: 'Fresh qualifier entering regional Axe and UHC open brackets.',
      skinDataUrl: generateProceduralSkin(
        {
          skin: '#e8bc99',
          skinShade: '#c99b77',
          hair: '#422006',
          hairAccent: '#713f12',
          eyes: '#38bdf8',
          suitDark: '#161922',
          suitMid: '#262d3d',
          accent: '#d97706',
          trim: '#94a3b8',
          boots: '#10131a',
        },
        'classic'
      ),
      tiers: {
        crystal: 'LT5',
        sword: 'HT4',
        nethpot: 'HT5',
        uhc: 'LT4',
        axe: 'HT4',
        smp: 'LT5',
        mace: 'UNRANKED',
      },
      updatedAt: now - 7000,
    },
  ];
}
