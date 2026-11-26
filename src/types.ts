export type GameMode =
  | 'overall'
  | 'crystal'
  | 'sword'
  | 'nethpot'
  | 'uhc'
  | 'axe'
  | 'smp'
  | 'mace';

export type PlayableMode = Exclude<GameMode, 'overall'>;

export type TierRank =
  | 'HT1'
  | 'LT1'
  | 'HT2'
  | 'LT2'
  | 'HT3'
  | 'LT3'
  | 'HT4'
  | 'LT4'
  | 'HT5'
  | 'LT5'
  | 'UNRANKED';

export type SkinModel = 'classic' | 'slim';

export type PlayerStatus = 'PRO' | 'NOOB';

export type RegionCode = 'AS' | 'NA' | 'EU' | 'OC' | 'SA';

export type CharacterPose = 'idle' | 'combat' | 'walk' | 'showcase';

export interface PlayerRecord {
  id: string;
  ign: string;
  region: RegionCode;
  status: PlayerStatus;
  skinModel: SkinModel;
  /** Data URL (64x64 or 64x32 PNG) stored offline in IndexedDB / backup JSON */
  skinDataUrl: string;
  /** Optional custom tag or clan name */
  clan?: string;
  /** Short competitive bio or note */
  bio?: string;
  tiers: Record<PlayableMode, TierRank>;
  updatedAt: number;
}

export interface UserIdentity {
  ign: string;
  status: PlayerStatus;
  adminEnabled: boolean;
}

export interface AppSettings {
  lowPowerMode: boolean;
  forceSoftware3D: boolean;
  orgName: string;
  customLogoDataUrl: string | null;
}

export interface AppBackupPayload {
  version: number;
  exportedAt: string;
  players: PlayerRecord[];
  identity: UserIdentity;
  settings: AppSettings;
}

export const ADMIN_IGN = 'ItzNabidGamer';

export function isAuthorizedAdminIgn(ign: string): boolean {
  return ign.trim().toLowerCase() === ADMIN_IGN.toLowerCase();
}

export const PLAYABLE_MODES: { id: PlayableMode; label: string; short: string; desc: string }[] = [
  { id: 'crystal', label: 'Crystal', short: 'CPVP', desc: 'End Crystal & Anchor Combat' },
  { id: 'sword', label: 'Sword', short: 'SWD', desc: 'Classic Diamond Sword Duels' },
  { id: 'nethpot', label: 'NethPot', short: 'NPOT', desc: 'Netherite Splash Potion' },
  { id: 'uhc', label: 'UHC', short: 'UHC', desc: 'Ultra Hardcore Rod & Bow' },
  { id: 'axe', label: 'Axe', short: 'AXE', desc: 'Axe & Shield Precision' },
  { id: 'smp', label: 'SMP', short: 'SMP', desc: 'Survival Kit & Pearl PvP' },
  { id: 'mace', label: 'Mace', short: 'MACE', desc: 'Wind Charge & Mace Smash' },
];

export const ALL_TIERS: TierRank[] = [
  'HT1',
  'LT1',
  'HT2',
  'LT2',
  'HT3',
  'LT3',
  'HT4',
  'LT4',
  'HT5',
  'LT5',
  'UNRANKED',
];

export const TIER_POINTS: Record<TierRank, number> = {
  HT1: 60,
  LT1: 45,
  HT2: 30,
  LT2: 20,
  HT3: 10,
  LT3: 6,
  HT4: 4,
  LT4: 3,
  HT5: 2,
  LT5: 1,
  UNRANKED: 0,
};

/** Strictly Obsidian Carbon, Crimson & Molten Gold spectrum — ZERO purple */
export const TIER_STYLES: Record<
  TierRank,
  { text: string; bg: string; border: string; accent: string; group: number }
> = {
  HT1: {
    text: '#fef08a',
    bg: 'rgba(234, 179, 8, 0.16)',
    border: 'rgba(234, 179, 8, 0.55)',
    accent: '#eab308',
    group: 1,
  },
  LT1: {
    text: '#fde047',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.4)',
    accent: '#f59e0b',
    group: 1,
  },
  HT2: {
    text: '#fdba74',
    bg: 'rgba(249, 115, 22, 0.16)',
    border: 'rgba(249, 115, 22, 0.52)',
    accent: '#f97316',
    group: 2,
  },
  LT2: {
    text: '#fb923c',
    bg: 'rgba(234, 88, 12, 0.12)',
    border: 'rgba(234, 88, 12, 0.4)',
    accent: '#ea580c',
    group: 2,
  },
  HT3: {
    text: '#fca5a5',
    bg: 'rgba(239, 68, 68, 0.16)',
    border: 'rgba(239, 68, 68, 0.52)',
    accent: '#ef4444',
    group: 3,
  },
  LT3: {
    text: '#f87171',
    bg: 'rgba(220, 38, 38, 0.12)',
    border: 'rgba(220, 38, 38, 0.38)',
    accent: '#dc2626',
    group: 3,
  },
  HT4: {
    text: '#cbd5e1',
    bg: 'rgba(148, 163, 184, 0.14)',
    border: 'rgba(148, 163, 184, 0.36)',
    accent: '#94a3b8',
    group: 4,
  },
  LT4: {
    text: '#94a3b8',
    bg: 'rgba(100, 116, 139, 0.12)',
    border: 'rgba(100, 116, 139, 0.3)',
    accent: '#64748b',
    group: 4,
  },
  HT5: {
    text: '#a1a1aa',
    bg: 'rgba(82, 82, 91, 0.16)',
    border: 'rgba(82, 82, 91, 0.35)',
    accent: '#71717a',
    group: 5,
  },
  LT5: {
    text: '#71717a',
    bg: 'rgba(63, 63, 70, 0.14)',
    border: 'rgba(63, 63, 70, 0.32)',
    accent: '#52525b',
    group: 5,
  },
  UNRANKED: {
    text: '#475569',
    bg: 'rgba(15, 18, 25, 0.5)',
    border: '#232938',
    accent: '#334155',
    group: 99,
  },
};

export function calculatePlayerPoints(tiers: Record<PlayableMode, TierRank>): number {
  return PLAYABLE_MODES.reduce((sum, mode) => sum + (TIER_POINTS[tiers[mode.id]] ?? 0), 0);
}

export function getCombatTitle(points: number): string {
  if (points >= 250) return 'Combat Grandmaster';
  if (points >= 170) return 'Combat Master';
  if (points >= 110) return 'Combat Ace';
  if (points >= 55) return 'Combat Specialist';
  if (points >= 20) return 'Combat Challenger';
  return 'Combat Rookie';
}

export function getTierSortWeight(tier: TierRank): number {
  const idx = ALL_TIERS.indexOf(tier);
  return idx === -1 ? 999 : idx;
}
