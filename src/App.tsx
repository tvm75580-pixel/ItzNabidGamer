import React, { useEffect, useMemo, useState } from 'react';
import {
  Crown,
  Lock,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  User,
  WifiOff,
} from 'lucide-react';
import { IdentitySettingsModal } from './components/IdentitySettingsModal';
import { PlayerAvatar3D } from './components/PlayerAvatar3D';
import { PlayerEditorModal } from './components/PlayerEditorModal';
import { PlayerProfileModal } from './components/PlayerProfileModal';
import { createSeedPlayers } from './engine/defaultSkins';
import { clearThumbnailCache } from './engine/minecraft3d';
import {
  buildBackupJson,
  DEFAULT_SETTINGS,
  loadIdentitySync,
  loadPlayersAsync,
  loadSettingsAsync,
  parseBackupJson,
  sanitizeIdentity,
  saveIdentitySync,
  savePlayersAsync,
  saveSettingsAsync,
} from './storage/offlineStore';
import {
  ADMIN_IGN,
  AppSettings,
  calculatePlayerPoints,
  GameMode,
  getCombatTitle,
  getTierSortWeight,
  isAuthorizedAdminIgn,
  PLAYABLE_MODES,
  PlayableMode,
  PlayerRecord,
  PlayerStatus,
  RegionCode,
  TIER_STYLES,
  TierRank,
  UserIdentity,
} from './types';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const REGIONS: ('ALL' | RegionCode)[] = ['ALL', 'AS', 'NA', 'EU', 'OC', 'SA'];

const HEADER_QUICK_MODES: { id: GameMode; label: string }[] = [
  { id: 'overall', label: 'Overall' },
  { id: 'crystal', label: 'Crystal' },
  { id: 'sword', label: 'Sword' },
  { id: 'nethpot', label: 'NethPot' },
  { id: 'mace', label: 'Mace' },
];

export default function App() {
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [identity, setIdentity] = useState<UserIdentity>(() => loadIdentitySync());
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  // Navigation & Filters
  const [activeMode, setActiveMode] = useState<GameMode>('overall');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PlayerStatus>('ALL');
  const [regionFilter, setRegionFilter] = useState<'ALL' | RegionCode>('ALL');

  // Modals
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerRecord | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Offline & PWA install state
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Strict Admin Lock computation
  const isAdminUnlocked = isAuthorizedAdminIgn(identity.ign);
  const isAdminOn = isAdminUnlocked && identity.adminEnabled;

  // Hydrate offline IndexedDB + localStorage safely on boot
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [storedPlayers, storedSettings] = await Promise.all([
          loadPlayersAsync(),
          loadSettingsAsync(),
        ]);
        if (!active) return;

        if (storedPlayers && storedPlayers.length > 0) {
          setPlayers(storedPlayers);
        } else {
          const seeded = createSeedPlayers();
          setPlayers(seeded);
          await savePlayersAsync(seeded);
        }
        setSettings(storedSettings);
      } catch {
        if (active) {
          setPlayers(createSeedPlayers());
        }
      } finally {
        if (active) setHydrated(true);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  // Online / Offline & PWA install listeners
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => setDeferredPrompt(null);

    const ua = navigator.userAgent.toLowerCase();
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsIOS(!isStandalone && /iphone|ipad|ipod/.test(ua));

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    window.setTimeout(() => {
      setToastMessage((curr) => (curr === msg ? null : curr));
    }, 3200);
  };

  // Persist identity with strict Admin Lock enforcement
  const updateIdentity = (next: UserIdentity) => {
    const safe = sanitizeIdentity(next);
    setIdentity(safe);
    saveIdentitySync(safe);
  };

  const updateSettings = (next: AppSettings) => {
    const engineChanged = next.forceSoftware3D !== settings.forceSoftware3D;
    setSettings(next);
    saveSettingsAsync(next);
    if (engineChanged) {
      clearThumbnailCache();
    }
  };

  const persistPlayers = (next: PlayerRecord[]) => {
    setPlayers(next);
    savePlayersAsync(next);
  };

  const handleInlineIgnChange = (value: string) => {
    const trimmedClean = value.slice(0, 24);
    const unlocked = isAuthorizedAdminIgn(trimmedClean);
    updateIdentity({
      ...identity,
      ign: trimmedClean,
      adminEnabled: unlocked ? identity.adminEnabled : false,
    });
  };

  const handleToggleAdmin = () => {
    if (!isAdminUnlocked) return;
    const nextAdmin = !identity.adminEnabled;
    updateIdentity({
      ...identity,
      adminEnabled: nextAdmin,
    });
    showToast(nextAdmin ? 'Admin Mode enabled.' : 'Switched to Viewer Mode.');
  };

  const handleSavePlayer = (record: PlayerRecord) => {
    if (!isAdminOn) return;
    const exists = players.some((p) => p.id === record.id);
    const next = exists
      ? players.map((p) => (p.id === record.id ? record : p))
      : [...players, record];
    persistPlayers(next);
    setEditorOpen(false);
    setEditingPlayer(null);
    showToast(exists ? `Updated ${record.ign}.` : `Added ${record.ign} to roster.`);
  };

  const handleDeletePlayer = (player: PlayerRecord) => {
    if (!isAdminOn) return;
    const next = players.filter((p) => p.id !== player.id);
    persistPlayers(next);
    setSelectedPlayerId(null);
    showToast(`Removed ${player.ign} from roster.`);
  };

  const handleExportJson = () => {
    try {
      const json = buildBackupJson(players, identity, settings);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `obsidian-tiers-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Exported offline JSON backup.');
    } catch {
      showToast('Could not export JSON backup.');
    }
  };

  const handleImportJson = (raw: string): boolean => {
    if (!isAdminOn) return false;
    const parsed = parseBackupJson(raw);
    if (!parsed) return false;
    clearThumbnailCache();
    persistPlayers(parsed.players);
    updateSettings(parsed.settings);
    showToast(`Imported ${parsed.players.length} players from backup.`);
    return true;
  };

  const handleResetDefaultRoster = () => {
    if (!isAdminOn) return;
    clearThumbnailCache();
    const seeded = createSeedPlayers();
    persistPlayers(seeded);
    showToast('Default esports roster restored.');
  };

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } catch {
      // ignore
    }
  };

  // Ranked players sorted by Total Points (descending)
  const overallRankedPlayers = useMemo(() => {
    return [...players]
      .map((p) => ({
        player: p,
        points: calculatePlayerPoints(p.tiers),
      }))
      .sort((a, b) => b.points - a.points || a.player.ign.localeCompare(b.player.ign));
  }, [players]);

  const rankById = useMemo(() => {
    const map = new Map<string, number>();
    overallRankedPlayers.forEach((entry, idx) => map.set(entry.player.id, idx + 1));
    return map;
  }, [overallRankedPlayers]);

  // Filtered roster for current search/status/region
  const filteredRanked = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return overallRankedPlayers.filter(({ player }) => {
      if (statusFilter !== 'ALL' && player.status !== statusFilter) return false;
      if (regionFilter !== 'ALL' && player.region !== regionFilter) return false;
      if (q) {
        const hay = `${player.ign} ${player.clan || ''} ${player.region}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [overallRankedPlayers, searchQuery, statusFilter, regionFilter]);

  // Mode-specific 5-tier columns (Tier 1..5)
  const modeTierColumns = useMemo(() => {
    if (activeMode === 'overall') return [];
    const mode = activeMode as PlayableMode;
    const groups: { tierNum: number; label: string; accent: string; entries: { player: PlayerRecord; tier: TierRank; points: number }[] }[] = [
      { tierNum: 1, label: 'Tier 1', accent: '#eab308', entries: [] },
      { tierNum: 2, label: 'Tier 2', accent: '#f97316', entries: [] },
      { tierNum: 3, label: 'Tier 3', accent: '#ef4444', entries: [] },
      { tierNum: 4, label: 'Tier 4', accent: '#94a3b8', entries: [] },
      { tierNum: 5, label: 'Tier 5', accent: '#71717a', entries: [] },
    ];

    for (const item of filteredRanked) {
      const tier = item.player.tiers[mode];
      const groupNum = TIER_STYLES[tier]?.group ?? 99;
      if (groupNum >= 1 && groupNum <= 5) {
        groups[groupNum - 1].entries.push({
          player: item.player,
          tier,
          points: item.points,
        });
      }
    }

    for (const g of groups) {
      g.entries.sort(
        (a, b) =>
          getTierSortWeight(a.tier) - getTierSortWeight(b.tier) ||
          b.points - a.points ||
          a.player.ign.localeCompare(b.player.ign)
      );
    }

    return groups;
  }, [activeMode, filteredRanked]);

  const selectedPlayer = useMemo(
    () => players.find((p) => p.id === selectedPlayerId) || null,
    [players, selectedPlayerId]
  );

  const topThree = overallRankedPlayers.slice(0, 3);
  const podiumDisplayOrder =
    topThree.length === 3 ? [topThree[1], topThree[0], topThree[2]] : topThree;

  return (
    <div className="min-h-dvh bg-[#06070a] text-[#f1f5f9]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 border-b border-[#232938] bg-[#06070a]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          {/* Zone 1: Brand Title + Optional Circular Logo (single line) */}
          <button
            type="button"
            onClick={() => setActiveMode('overall')}
            className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] rounded-md"
          >
            {settings.customLogoDataUrl ? (
              <img
                src={settings.customLogoDataUrl}
                alt={settings.orgName}
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full border border-[#eab308]/50 object-cover shrink-0"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#f97316]/50 bg-[#0f1219] shrink-0">
                <Crown className="h-4 w-4 text-[#eab308]" />
              </span>
            )}
            <span className="font-display text-lg font-bold tracking-tight text-white">
              {settings.orgName}
            </span>
          </button>

          {/* Zone 2: 5 concise single-line text nav links */}
          <nav
            aria-label="Primary gamemodes"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {HEADER_QUICK_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveMode(m.id)}
                className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors border-b-2 ${
                  activeMode === m.id
                    ? 'border-[#f97316] text-white'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                isAdminOn
                  ? 'border-[#eab308]/70 bg-[#eab308]/15 text-[#fde047] hover:bg-[#eab308]/25'
                  : 'border-[#232938] bg-[#0f1219] text-slate-200 hover:border-[#f97316]/60 hover:text-white'
              }`}
            >
              {isAdminOn ? (
                <ShieldCheck className="h-3.5 w-3.5 text-[#eab308]" />
              ) : (
                <Settings2 className="h-3.5 w-3.5 text-[#f97316]" />
              )}
              <span className="max-w-[120px] truncate">{identity.ign.trim() || 'Set IGN'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 pt-6 sm:px-6">
        {/* Workspace Identity & Strict Admin Lock Control Bar */}
        <section
          aria-label="Identity and Admin Controls"
          className="rounded-xl border border-[#232938] bg-[#0f1219] p-4"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              {/* Inline IGN Input */}
              <div className="flex items-center gap-2 rounded-lg border border-[#232938] bg-[#06070a] px-3 py-1.5">
                <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <label htmlFor="toolbar-ign" className="sr-only">
                  Your Minecraft IGN
                </label>
                <input
                  id="toolbar-ign"
                  type="text"
                  value={identity.ign}
                  onChange={(e) => handleInlineIgnChange(e.target.value)}
                  placeholder="Enter IGN..."
                  className="w-36 sm:w-44 bg-transparent text-xs font-semibold text-white placeholder-slate-500 focus:outline-none"
                />
              </div>

              {/* Inline User Status PRO / NOOB Switch */}
              <div
                className="flex items-center rounded-lg border border-[#232938] bg-[#06070a] p-0.5"
                role="group"
                aria-label="Your player status"
              >
                {(['PRO', 'NOOB'] as PlayerStatus[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => updateIdentity({ ...identity, status: st })}
                    className={`rounded-md px-2.5 py-1 text-xs font-bold whitespace-nowrap transition-colors ${
                      identity.status === st
                        ? st === 'PRO'
                          ? 'bg-[#f97316] text-[#06070a]'
                          : 'bg-[#ef4444] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              {/* Strict Admin Mode ON/OFF Toggle — Locked unless IGN === ItzNabidGamer */}
              <button
                type="button"
                role="switch"
                aria-checked={isAdminOn}
                aria-disabled={!isAdminUnlocked}
                disabled={!isAdminUnlocked}
                onClick={handleToggleAdmin}
                title={
                  isAdminUnlocked
                    ? 'Toggle Admin Mode ON or OFF'
                    : `Locked: Only ${ADMIN_IGN} can unlock Admin Mode`
                }
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                  !isAdminUnlocked
                    ? 'cursor-not-allowed border-[#232938] bg-[#06070a] text-slate-500 opacity-60'
                    : isAdminOn
                      ? 'cursor-pointer border-[#eab308] bg-[#eab308] text-[#06070a] hover:bg-[#facc15]'
                      : 'cursor-pointer border-[#f97316]/60 bg-[#06070a] text-[#fdba74] hover:border-[#f97316]'
                }`}
              >
                {isAdminUnlocked ? (
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <Lock className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>
                  {isAdminOn
                    ? 'Admin Mode: ON'
                    : isAdminUnlocked
                      ? 'Admin Mode: OFF'
                      : 'Admin Locked (Viewer)'}
                </span>
              </button>
            </div>

            {/* Right Actions: Admin Add Player + Offline Settings */}
            <div className="flex flex-wrap items-center gap-2.5">
              {isAdminOn && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPlayer(null);
                    setEditorOpen(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 py-2 text-xs font-bold text-[#06070a] hover:bg-[#fb923c] whitespace-nowrap transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Player
                </button>
              )}

              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 rounded-lg border border-[#232938] bg-[#06070a] px-3 py-2 text-xs font-semibold text-slate-300 hover:border-[#f97316]/60 hover:text-white whitespace-nowrap transition-colors"
              >
                <SlidersHorizontal className="h-3.5 w-3.5 text-[#eab308]" />
                Storage & Backup
              </button>
            </div>
          </div>
        </section>

        {/* Championship 3D Podium Showcase (Overall View) */}
        {activeMode === 'overall' && topThree.length > 0 && (
          <section aria-label="Top 3 Championship Podium" className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white [text-wrap:balance]">
                  Competitive Minecraft PvP Rankings
                </h1>
                <p className="mt-1 text-sm text-slate-400">
                  {players.length} ranked competitors · 7 gamemodes · Click any 3D fighter to
                  inspect in 360°
                </p>
              </div>
              <div className="text-xs text-slate-400 font-mono-num">
                HT1 60 · LT1 45 · HT2 30 · LT2 20 · HT3 10
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-end">
              {podiumDisplayOrder.map((entry) => {
                const rank = rankById.get(entry.player.id) ?? 1;
                const isFirst = rank === 1;
                const accentColor =
                  rank === 1 ? '#eab308' : rank === 2 ? '#f97316' : '#ef4444';

                return (
                  <button
                    key={entry.player.id}
                    type="button"
                    onClick={() => setSelectedPlayerId(entry.player.id)}
                    className={`group relative flex flex-col items-center overflow-hidden rounded-xl border bg-[#0f1219] p-5 text-left transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] ${
                      isFirst
                        ? 'border-[#eab308]/55 md:min-h-[340px]'
                        : 'border-[#232938] hover:border-[#f97316]/45 md:min-h-[304px]'
                    }`}
                  >
                    {/* Top Rank + Points Header */}
                    <div className="flex w-full items-center justify-between">
                      <span
                        className="font-mono-num text-sm font-bold"
                        style={{ color: accentColor }}
                      >
                        #{rank} {isFirst ? 'CHAMPION' : 'PODIUM'}
                      </span>
                      <span className="font-mono-num text-sm font-bold text-white">
                        {entry.points} pts
                      </span>
                    </div>

                    {/* Full-Body 3D Character Render */}
                    <div className="obsidian-stage-glow my-2 flex h-44 w-full items-center justify-center">
                      <PlayerAvatar3D
                        skinDataUrl={entry.player.skinDataUrl}
                        model={entry.player.skinModel}
                        ign={entry.player.ign}
                        variant="full"
                        forceSoftware2D={settings.forceSoftware3D}
                        className={isFirst ? 'h-44 w-36' : 'h-40 w-32'}
                      />
                    </div>

                    {/* Clean Unboxed Player Metadata */}
                    <div className="w-full border-t border-[#232938] pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-display text-lg font-bold text-white group-hover:text-[#fde047] transition-colors">
                          {entry.player.clan ? (
                            <span className="mr-1.5 font-mono-num text-sm text-[#f97316]">
                              [{entry.player.clan}]
                            </span>
                          ) : null}
                          {entry.player.ign}
                        </span>
                        <span
                          className={`text-xs font-bold shrink-0 ${
                            entry.player.status === 'PRO' ? 'text-[#f97316]' : 'text-slate-400'
                          }`}
                        >
                          {entry.player.status}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                        <span>{getCombatTitle(entry.points)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{entry.player.region}</span>
                        <span aria-hidden="true">·</span>
                        <span>{entry.player.skinModel === 'slim' ? 'Slim 3px' : 'Steve 4px'}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Gamemode Tabs + Search & Filter Bar */}
        <section className="mt-8 space-y-3">
          {/* All Gamemode Selector Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setActiveMode('overall')}
              className={`rounded-lg border px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                activeMode === 'overall'
                  ? 'border-[#f97316] bg-[#f97316] text-[#06070a]'
                  : 'border-[#232938] bg-[#0f1219] text-slate-300 hover:border-slate-600 hover:text-white'
              }`}
            >
              Overall
            </button>
            {PLAYABLE_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setActiveMode(m.id)}
                className={`rounded-lg border px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                  activeMode === m.id
                    ? 'border-[#f97316] bg-[#f97316] text-[#06070a]'
                    : 'border-[#232938] bg-[#0f1219] text-slate-300 hover:border-slate-600 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Search, Status & Region Filter Row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search player IGN, clan, or region..."
                className="w-full rounded-lg border border-[#232938] bg-[#0f1219] py-2 pr-3 pl-9 text-sm text-white placeholder-slate-500 focus:border-[#f97316] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter */}
              <div className="flex items-center rounded-lg border border-[#232938] bg-[#0f1219] p-1">
                {(['ALL', 'PRO', 'NOOB'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStatusFilter(st)}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${
                      statusFilter === st
                        ? 'bg-[#1f2636] text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st === 'ALL' ? 'All Status' : st}
                  </button>
                ))}
              </div>

              {/* Region Filter */}
              <div className="flex items-center rounded-lg border border-[#232938] bg-[#0f1219] p-1">
                {REGIONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRegionFilter(r)}
                    className={`rounded-md px-2 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${
                      regionFilter === r
                        ? 'bg-[#1f2636] text-[#eab308]'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {r === 'ALL' ? 'Global' : r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Main View Area: Overall Leaderboard OR 5-Column Mode Tier Matrix */}
        {!hydrated ? (
          <div className="mt-6 space-y-2.5">
            {[1, 2, 3, 4].map((n) => (
              <div
                key={n}
                className="h-20 rounded-xl border border-[#232938] bg-[#0f1219] animate-pulse"
              />
            ))}
          </div>
        ) : activeMode === 'overall' ? (
          <section aria-label="Overall Ranked Roster" className="mt-5">
            {filteredRanked.length === 0 ? (
              <div className="rounded-xl border border-[#232938] bg-[#0f1219] p-10 text-center">
                <Trophy className="mx-auto h-8 w-8 text-slate-600" />
                <p className="mt-3 text-sm font-semibold text-slate-200">
                  No ranked players match your current filters.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Try clearing your search or status filter{isAdminOn ? ', or add a new player' : ''}.
                </p>
                {isAdminOn && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPlayer(null);
                      setEditorOpen(true);
                    }}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#f97316] px-4 py-2 text-xs font-bold text-[#06070a] hover:bg-[#fb923c]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Player
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-[#232938] bg-[#0f1219]">
                {/* Desktop Column Header */}
                <div className="hidden lg:grid lg:grid-cols-12 items-center gap-4 border-b border-[#232938] bg-[#0b0e14] px-5 py-3 text-xs font-semibold text-slate-400">
                  <div className="col-span-1">Rank</div>
                  <div className="col-span-4">Player (3D)</div>
                  <div className="col-span-1 text-right">Points</div>
                  <div className="col-span-6">Gamemode Tiers</div>
                </div>

                <div className="divide-y divide-[#232938]">
                  {filteredRanked.map(({ player, points }) => {
                    const rank = rankById.get(player.id) ?? 0;
                    const rankColor =
                      rank === 1
                        ? '#eab308'
                        : rank === 2
                          ? '#f97316'
                          : rank === 3
                            ? '#ef4444'
                            : '#94a3b8';

                    return (
                      <div
                        key={player.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedPlayerId(player.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedPlayerId(player.id);
                          }
                        }}
                        className="grid grid-cols-1 gap-3 px-4 py-3.5 hover:bg-[#151a24] transition-colors cursor-pointer lg:grid-cols-12 lg:items-center lg:gap-4 lg:px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f97316]"
                      >
                        {/* Rank + 3D Bust + Name */}
                        <div className="flex items-center gap-3.5 lg:col-span-5">
                          <div
                            className="w-9 font-mono-num text-base font-bold shrink-0"
                            style={{ color: rankColor }}
                          >
                            #{rank}
                          </div>

                          <div className="h-14 w-14 overflow-hidden rounded-lg border border-[#232938] bg-[#06070a] shrink-0">
                            <PlayerAvatar3D
                              skinDataUrl={player.skinDataUrl}
                              model={player.skinModel}
                              ign={player.ign}
                              variant="bust"
                              forceSoftware2D={settings.forceSoftware3D}
                              className="h-full w-full"
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate font-display text-base font-bold text-white">
                                {player.clan ? (
                                  <span className="mr-1.5 font-mono-num text-xs text-[#f97316]">
                                    [{player.clan}]
                                  </span>
                                ) : null}
                                {player.ign}
                              </span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                              <span>{getCombatTitle(points)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{player.region}</span>
                              <span aria-hidden="true">·</span>
                              <span
                                className={
                                  player.status === 'PRO'
                                    ? 'font-semibold text-[#f97316]'
                                    : 'font-semibold text-slate-400'
                                }
                              >
                                {player.status}
                              </span>
                            </div>
                          </div>

                          {/* Mobile Points */}
                          <div className="text-right lg:hidden shrink-0">
                            <div className="font-mono-num text-base font-bold text-[#eab308]">
                              {points}
                            </div>
                            <div className="text-[11px] text-slate-500">pts</div>
                          </div>
                        </div>

                        {/* Desktop Points */}
                        <div className="hidden lg:block lg:col-span-1 text-right">
                          <span className="font-mono-num text-base font-bold text-[#eab308]">
                            {points}
                          </span>
                        </div>

                        {/* Per-Mode Tiers Matrix */}
                        <div className="grid grid-cols-7 gap-1.5 lg:col-span-6">
                          {PLAYABLE_MODES.map((m) => {
                            const tier = player.tiers[m.id];
                            const st = TIER_STYLES[tier];
                            return (
                              <div
                                key={m.id}
                                className="flex flex-col items-center justify-center rounded-md border px-1 py-1.5 text-center"
                                style={{
                                  backgroundColor: st.bg,
                                  borderColor: st.border,
                                }}
                                title={`${m.label}: ${tier}`}
                              >
                                <span className="text-[9px] font-semibold tracking-wider text-slate-400">
                                  {m.short}
                                </span>
                                <span
                                  className="font-mono-num text-[11px] font-bold"
                                  style={{ color: st.text }}
                                >
                                  {tier === 'UNRANKED' ? '—' : tier}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        ) : (
          /* Mode-Specific 5-Column Esports Tier Board */
          <section aria-label={`${activeMode} Tier Matrix`} className="mt-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-bold text-white">
                {PLAYABLE_MODES.find((m) => m.id === activeMode)?.label} Tier Board
              </h2>
              <span className="text-xs text-slate-400">
                {PLAYABLE_MODES.find((m) => m.id === activeMode)?.desc}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {modeTierColumns.map((col) => (
                <div
                  key={col.tierNum}
                  className="flex flex-col overflow-hidden rounded-xl border border-[#232938] bg-[#0f1219]"
                >
                  <div
                    className="flex items-center justify-between border-b border-[#232938] bg-[#0b0e14] px-3.5 py-2.5"
                    style={{ borderTop: `2px solid ${col.accent}` }}
                  >
                    <span
                      className="font-display text-sm font-bold"
                      style={{ color: col.accent }}
                    >
                      {col.label}
                    </span>
                    <span className="font-mono-num text-xs text-slate-400">
                      {col.entries.length}
                    </span>
                  </div>

                  <div className="flex-1 divide-y divide-[#232938]/70">
                    {col.entries.length === 0 ? (
                      <div className="px-3.5 py-8 text-center text-xs text-slate-600">
                        No players ranked
                      </div>
                    ) : (
                      col.entries.map(({ player, tier }) => {
                        const isHigh = tier.startsWith('HT');
                        const st = TIER_STYLES[tier];
                        return (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => setSelectedPlayerId(player.id)}
                            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-[#151a24] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#f97316]"
                          >
                            <div className="h-10 w-10 overflow-hidden rounded-md border border-[#232938] bg-[#06070a] shrink-0">
                              <PlayerAvatar3D
                                skinDataUrl={player.skinDataUrl}
                                model={player.skinModel}
                                ign={player.ign}
                                variant="bust"
                                forceSoftware2D={settings.forceSoftware3D}
                                className="h-full w-full"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-bold text-white">
                                {player.ign}
                              </div>
                              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                <span>{player.region}</span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    player.status === 'PRO'
                                      ? 'text-[#f97316] font-semibold'
                                      : 'text-slate-500'
                                  }
                                >
                                  {player.status}
                                </span>
                              </div>
                            </div>
                            <span
                              className="font-mono-num rounded px-1.5 py-0.5 text-[10px] font-bold shrink-0"
                              style={{
                                color: st.text,
                                backgroundColor: st.bg,
                                border: `1px solid ${st.border}`,
                              }}
                            >
                              {isHigh ? 'HIGH' : 'LOW'}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-[#232938] bg-[#06070a] py-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 text-xs text-slate-500 sm:px-6">
          <span>
            {settings.orgName} · Offline-first 3D Minecraft Competitive Tier System
          </span>
          <span>
            Admin lock restricted to {ADMIN_IGN} · Pure WebGL & Canvas 2D-3D fallback
          </span>
        </div>
      </footer>

      {/* Interactive 3D Player Profile Modal */}
      <PlayerProfileModal
        player={selectedPlayer}
        overallRank={selectedPlayer ? rankById.get(selectedPlayer.id) ?? 0 : 0}
        adminActive={isAdminOn}
        lowPowerMode={settings.lowPowerMode}
        forceSoftware3D={settings.forceSoftware3D}
        onClose={() => setSelectedPlayerId(null)}
        onEdit={(p) => {
          setSelectedPlayerId(null);
          setEditingPlayer(p);
          setEditorOpen(true);
        }}
        onDelete={handleDeletePlayer}
      />

      {/* Admin Player Create / Edit Modal */}
      <PlayerEditorModal
        open={editorOpen && isAdminOn}
        initialPlayer={editingPlayer}
        lowPowerMode={settings.lowPowerMode}
        forceSoftware3D={settings.forceSoftware3D}
        onClose={() => {
          setEditorOpen(false);
          setEditingPlayer(null);
        }}
        onSave={handleSavePlayer}
      />

      {/* Identity, Strict Admin Lock, Brand Logo & Offline Backup Modal */}
      <IdentitySettingsModal
        open={settingsOpen}
        identity={identity}
        settings={settings}
        canInstallPWA={Boolean(deferredPrompt)}
        isIOS={isIOS}
        onClose={() => setSettingsOpen(false)}
        onUpdateIdentity={updateIdentity}
        onUpdateSettings={updateSettings}
        onExportJson={handleExportJson}
        onImportJson={handleImportJson}
        onResetDefaultRoster={handleResetDefaultRoster}
        onInstallPWA={handleInstallPWA}
      />

      {/* Real Offline Connectivity Indicator */}
      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-lg border border-[#eab308]/50 bg-[#0f1219] px-3.5 py-2 text-xs font-semibold text-[#fde047] shadow-lg"
        >
          <WifiOff className="h-3.5 w-3.5 text-[#eab308]" />
          <span>Offline Mode — Local IndexedDB & cache active</span>
        </div>
      )}

      {/* Action Feedback Toast */}
      {toastMessage && (
        <div
          role="status"
          className="fixed right-4 bottom-4 z-40 rounded-lg border border-[#f97316]/60 bg-[#0f1219] px-4 py-2.5 text-xs font-semibold text-white shadow-xl"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
}
