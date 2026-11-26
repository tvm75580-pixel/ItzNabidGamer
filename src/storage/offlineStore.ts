import {
  AppBackupPayload,
  AppSettings,
  isAuthorizedAdminIgn,
  PlayerRecord,
  UserIdentity,
} from '../types';

const DB_NAME = 'obsidian_tiers_offline_db';
const DB_VERSION = 1;
const STORE_KV = 'kv_store';

const KEY_PLAYERS = 'players_v3';
const KEY_LOGO = 'custom_logo_v3';

const LS_IDENTITY = 'obsidian_tiers_identity_v3';
const LS_SETTINGS = 'obsidian_tiers_settings_v3';
const LS_PLAYERS_FALLBACK = 'obsidian_tiers_players_fallback_v3';

export const DEFAULT_IDENTITY: UserIdentity = {
  ign: 'ItzNabidGamer',
  status: 'PRO',
  adminEnabled: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  lowPowerMode: false,
  forceSoftware3D: false,
  orgName: 'Obsidian Tiers',
  customLogoDataUrl: null,
};

function openDatabase(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_KV)) {
          db.createObjectStore(STORE_KV);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await openDatabase();
    if (!db) return null;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_KV, 'readonly');
        const store = tx.objectStore(STORE_KV);
        const req = store.get(key);
        req.onsuccess = () => {
          db.close();
          resolve((req.result as T) ?? null);
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(key: string, value: T): Promise<boolean> {
  try {
    const db = await openDatabase();
    if (!db) return false;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_KV, 'readwrite');
        const store = tx.objectStore(STORE_KV);
        store.put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve(true);
        };
        tx.onerror = () => {
          db.close();
          resolve(false);
        };
      } catch {
        db.close();
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

export function sanitizeIdentity(identity: Partial<UserIdentity> | null | undefined): UserIdentity {
  const ign = typeof identity?.ign === 'string' ? identity.ign.slice(0, 24) : DEFAULT_IDENTITY.ign;
  const status = identity?.status === 'NOOB' ? 'NOOB' : 'PRO';
  // Enforce strict admin lock rule at storage boundary as well
  const adminEnabled = isAuthorizedAdminIgn(ign) ? Boolean(identity?.adminEnabled) : false;
  return { ign, status, adminEnabled };
}

export function loadIdentitySync(): UserIdentity {
  try {
    const raw = localStorage.getItem(LS_IDENTITY);
    if (!raw) return DEFAULT_IDENTITY;
    return sanitizeIdentity(JSON.parse(raw));
  } catch {
    return DEFAULT_IDENTITY;
  }
}

export function saveIdentitySync(identity: UserIdentity): void {
  try {
    const safe = sanitizeIdentity(identity);
    localStorage.setItem(LS_IDENTITY, JSON.stringify(safe));
  } catch {
    // Storage unavailable or private browsing quota exceeded
  }
}

export async function loadSettingsAsync(): Promise<AppSettings> {
  let base = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) {
      const parsed = JSON.parse(raw);
      base = {
        lowPowerMode: Boolean(parsed.lowPowerMode),
        forceSoftware3D: Boolean(parsed.forceSoftware3D),
        orgName:
          typeof parsed.orgName === 'string' && parsed.orgName.trim()
            ? parsed.orgName.trim().slice(0, 32)
            : DEFAULT_SETTINGS.orgName,
        customLogoDataUrl:
          typeof parsed.customLogoDataUrl === 'string' ? parsed.customLogoDataUrl : null,
      };
    }
  } catch {
    // ignore
  }

  // Prefer IndexedDB copy of logo for large base64 images
  const idbLogo = await idbGet<string | null>(KEY_LOGO);
  if (typeof idbLogo === 'string' && idbLogo.startsWith('data:image/')) {
    base.customLogoDataUrl = idbLogo;
  }
  return base;
}

export async function saveSettingsAsync(settings: AppSettings): Promise<void> {
  try {
    const storedInIdb = await idbSet(KEY_LOGO, settings.customLogoDataUrl);
    const lsCopy: AppSettings = {
      ...settings,
      // Avoid blowing up 5MB localStorage quota if IndexedDB already persisted the logo
      customLogoDataUrl: storedInIdb ? null : settings.customLogoDataUrl,
    };
    localStorage.setItem(LS_SETTINGS, JSON.stringify(lsCopy));
  } catch {
    // ignore storage errors gracefully
  }
}

export async function loadPlayersAsync(): Promise<PlayerRecord[] | null> {
  const fromIdb = await idbGet<PlayerRecord[]>(KEY_PLAYERS);
  if (Array.isArray(fromIdb) && fromIdb.length > 0) {
    return fromIdb;
  }
  try {
    const raw = localStorage.getItem(LS_PLAYERS_FALLBACK);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function savePlayersAsync(players: PlayerRecord[]): Promise<void> {
  const ok = await idbSet(KEY_PLAYERS, players);
  if (!ok) {
    try {
      localStorage.setItem(LS_PLAYERS_FALLBACK, JSON.stringify(players));
    } catch {
      // ignore if quota exceeded
    }
  } else {
    // Also mirror lightweight copy when possible so instant fallback exists
    try {
      const json = JSON.stringify(players);
      if (json.length < 2_500_000) {
        localStorage.setItem(LS_PLAYERS_FALLBACK, json);
      }
    } catch {
      // ignore
    }
  }
}

export function buildBackupJson(
  players: PlayerRecord[],
  identity: UserIdentity,
  settings: AppSettings
): string {
  const payload: AppBackupPayload = {
    version: 3,
    exportedAt: new Date().toISOString(),
    players,
    identity: sanitizeIdentity(identity),
    settings,
  };
  return JSON.stringify(payload, null, 2);
}

export function parseBackupJson(rawText: string): AppBackupPayload | null {
  try {
    const data = JSON.parse(rawText);
    if (!data || !Array.isArray(data.players)) return null;
    const validPlayers: PlayerRecord[] = data.players
      .filter(
        (p: unknown): p is PlayerRecord =>
          Boolean(p) &&
          typeof p === 'object' &&
          typeof (p as PlayerRecord).id === 'string' &&
          typeof (p as PlayerRecord).ign === 'string' &&
          typeof (p as PlayerRecord).tiers === 'object'
      )
      .map((p: PlayerRecord) => ({
        id: p.id,
        ign: p.ign.trim().slice(0, 20),
        region: ['AS', 'NA', 'EU', 'OC', 'SA'].includes(p.region) ? p.region : 'AS',
        status: p.status === 'NOOB' ? 'NOOB' : 'PRO',
        skinModel: p.skinModel === 'slim' ? 'slim' : 'classic',
        skinDataUrl: typeof p.skinDataUrl === 'string' ? p.skinDataUrl : '',
        clan: typeof p.clan === 'string' ? p.clan.slice(0, 12) : undefined,
        bio: typeof p.bio === 'string' ? p.bio.slice(0, 160) : undefined,
        tiers: {
          crystal: p.tiers.crystal || 'UNRANKED',
          sword: p.tiers.sword || 'UNRANKED',
          nethpot: p.tiers.nethpot || 'UNRANKED',
          uhc: p.tiers.uhc || 'UNRANKED',
          axe: p.tiers.axe || 'UNRANKED',
          smp: p.tiers.smp || 'UNRANKED',
          mace: p.tiers.mace || 'UNRANKED',
        },
        updatedAt: typeof p.updatedAt === 'number' ? p.updatedAt : Date.now(),
      }));

    if (validPlayers.length === 0) return null;

    return {
      version: 3,
      exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : new Date().toISOString(),
      players: validPlayers,
      identity: sanitizeIdentity(data.identity),
      settings: {
        lowPowerMode: Boolean(data.settings?.lowPowerMode),
        forceSoftware3D: Boolean(data.settings?.forceSoftware3D),
        orgName:
          typeof data.settings?.orgName === 'string' && data.settings.orgName.trim()
            ? data.settings.orgName.trim().slice(0, 32)
            : DEFAULT_SETTINGS.orgName,
        customLogoDataUrl:
          typeof data.settings?.customLogoDataUrl === 'string' &&
          data.settings.customLogoDataUrl.startsWith('data:image/')
            ? data.settings.customLogoDataUrl
            : null,
      },
    };
  } catch {
    return null;
  }
}
