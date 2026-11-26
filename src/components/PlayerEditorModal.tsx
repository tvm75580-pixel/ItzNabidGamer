import React, { useEffect, useState } from 'react';
import { Upload, X, Save, Sparkles } from 'lucide-react';
import { detectSkinModelFromImage, generateProceduralSkin } from '../engine/defaultSkins';
import {
  ALL_TIERS,
  PLAYABLE_MODES,
  PlayableMode,
  PlayerRecord,
  PlayerStatus,
  RegionCode,
  SkinModel,
  TierRank,
} from '../types';
import { MinecraftViewport3D } from './MinecraftViewport3D';

interface PlayerEditorModalProps {
  open: boolean;
  initialPlayer: PlayerRecord | null;
  lowPowerMode: boolean;
  forceSoftware3D: boolean;
  onClose: () => void;
  onSave: (player: PlayerRecord) => void;
}

const REGIONS: RegionCode[] = ['AS', 'NA', 'EU', 'OC', 'SA'];

const DEFAULT_TIERS: Record<PlayableMode, TierRank> = {
  crystal: 'HT3',
  sword: 'HT3',
  nethpot: 'LT3',
  uhc: 'HT4',
  axe: 'LT4',
  smp: 'HT4',
  mace: 'UNRANKED',
};

const PRESET_PALETTES = [
  {
    name: 'Molten Gold',
    palette: {
      skin: '#f1c29b',
      skinShade: '#d4a078',
      hair: '#14171f',
      hairAccent: '#252b3b',
      eyes: '#eab308',
      suitDark: '#0b0e14',
      suitMid: '#1f232e',
      accent: '#eab308',
      trim: '#f97316',
      boots: '#090b10',
      crown: true,
    },
  },
  {
    name: 'Crimson Vanguard',
    palette: {
      skin: '#e8b994',
      skinShade: '#ca9873',
      hair: '#241418',
      hairAccent: '#451a1f',
      eyes: '#ef4444',
      suitDark: '#120f12',
      suitMid: '#2a1518',
      accent: '#ef4444',
      trim: '#f97316',
      boots: '#0b090b',
      visor: '#ef4444',
    },
  },
  {
    name: 'Obsidian Ember',
    palette: {
      skin: '#d9a784',
      skinShade: '#b88563',
      hair: '#18181b',
      hairAccent: '#3f3f46',
      eyes: '#f97316',
      suitDark: '#0d1017',
      suitMid: '#1e2433',
      accent: '#f97316',
      trim: '#eab308',
      boots: '#090b10',
      scarf: true,
    },
  },
];

export const PlayerEditorModal: React.FC<PlayerEditorModalProps> = ({
  open,
  initialPlayer,
  lowPowerMode,
  forceSoftware3D,
  onClose,
  onSave,
}) => {
  const [ign, setIgn] = useState('');
  const [region, setRegion] = useState<RegionCode>('AS');
  const [status, setStatus] = useState<PlayerStatus>('PRO');
  const [skinModel, setSkinModel] = useState<SkinModel>('classic');
  const [skinDataUrl, setSkinDataUrl] = useState('');
  const [clan, setClan] = useState('');
  const [bio, setBio] = useState('');
  const [tiers, setTiers] = useState<Record<PlayableMode, TierRank>>({ ...DEFAULT_TIERS });
  const [uploadError, setUploadError] = useState('');

  useEffect(() => {
    if (!open) return;
    setUploadError('');
    if (initialPlayer) {
      setIgn(initialPlayer.ign);
      setRegion(initialPlayer.region);
      setStatus(initialPlayer.status);
      setSkinModel(initialPlayer.skinModel);
      setSkinDataUrl(initialPlayer.skinDataUrl);
      setClan(initialPlayer.clan || '');
      setBio(initialPlayer.bio || '');
      setTiers({ ...initialPlayer.tiers });
    } else {
      setIgn('');
      setRegion('AS');
      setStatus('PRO');
      setSkinModel('slim');
      setSkinDataUrl(generateProceduralSkin(PRESET_PALETTES[0].palette, 'slim'));
      setClan('');
      setBio('');
      setTiers({ ...DEFAULT_TIERS });
    }
  }, [open, initialPlayer]);

  if (!open) return null;

  const handleSkinUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError('');
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadError('Please upload a valid Minecraft PNG skin file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) return;
      const img = new Image();
      img.onload = () => {
        const isValidSquare = img.width === img.height && img.width >= 64;
        const isLegacy = img.width === img.height * 2 && img.width >= 64;
        if (!isValidSquare && !isLegacy) {
          setUploadError(
            `Expected a 64×64 (or 64×32 legacy / 128×128 HD) Minecraft skin sheet. Got ${img.width}×${img.height}.`
          );
          return;
        }
        const detected = detectSkinModelFromImage(img);
        setSkinModel(detected);
        setSkinDataUrl(result);
      };
      img.onerror = () => setUploadError('Could not decode image file.');
      img.src = result;
    };
    reader.readAsDataURL(file);
  };

  const applyPresetSkin = (idx: number) => {
    const preset = PRESET_PALETTES[idx];
    if (!preset) return;
    setSkinDataUrl(generateProceduralSkin(preset.palette, skinModel));
    setUploadError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = ign.trim();
    if (!trimmed) return;

    const record: PlayerRecord = {
      id: initialPlayer?.id || `pl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ign: trimmed.slice(0, 20),
      region,
      status,
      skinModel,
      skinDataUrl:
        skinDataUrl || generateProceduralSkin(PRESET_PALETTES[0].palette, skinModel),
      clan: clan.trim().toUpperCase().slice(0, 8) || undefined,
      bio: bio.trim().slice(0, 160) || undefined,
      tiers,
      updatedAt: Date.now(),
    };
    onSave(record);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="editor-modal-title"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-xl border border-[#232938] bg-[#0f1219] p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#232938] pb-4">
          <h2 id="editor-modal-title" className="text-xl font-bold text-white">
            {initialPlayer ? `Edit Player — ${initialPlayer.ign}` : 'Add Ranked Player'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close editor"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#232938] bg-[#06070a] text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Live 3D Skin Preview + Upload */}
          <div className="space-y-3 lg:col-span-5">
            <MinecraftViewport3D
              skinDataUrl={skinDataUrl}
              model={skinModel}
              lowPowerMode={lowPowerMode}
              forceSoftware3D={forceSoftware3D}
              compact
            />

            {/* Skin Model Toggle (Exact Steve 4px vs Slim 3px) */}
            <div>
              <span className="block text-xs font-medium text-slate-400 mb-1.5">
                Arm Geometry Model
              </span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSkinModel('classic')}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    skinModel === 'classic'
                      ? 'border-[#f97316] bg-[#f97316]/15 text-[#fdba74]'
                      : 'border-[#232938] bg-[#06070a] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Steve (4px Classic)
                </button>
                <button
                  type="button"
                  onClick={() => setSkinModel('slim')}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                    skinModel === 'slim'
                      ? 'border-[#f97316] bg-[#f97316]/15 text-[#fdba74]'
                      : 'border-[#232938] bg-[#06070a] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Alex (3px Slim)
                </button>
              </div>
            </div>

            {/* Upload PNG Skin */}
            <div>
              <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#334155] bg-[#06070a] px-4 py-2.5 text-xs font-semibold text-slate-200 hover:border-[#f97316] hover:text-[#fdba74] transition-colors">
                <Upload className="h-4 w-4 text-[#f97316]" />
                <span>Upload 64×64 / 64×32 Minecraft Skin PNG</span>
                <input
                  type="file"
                  accept="image/png,image/webp"
                  onChange={handleSkinUpload}
                  className="hidden"
                />
              </label>
              {uploadError && <p className="mt-1.5 text-xs text-[#ef4444]">{uploadError}</p>}
            </div>

            {/* Quick Offline Procedural Presets */}
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1.5">
                <Sparkles className="h-3.5 w-3.5 text-[#eab308]" />
                <span>Offline Procedural Kits</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {PRESET_PALETTES.map((p, idx) => (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => applyPresetSkin(idx)}
                    className="rounded-md border border-[#232938] bg-[#06070a] px-2 py-1.5 text-[11px] font-medium text-slate-300 hover:border-[#eab308]/60 hover:text-[#fde047] transition-colors truncate"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Identity, Status & Tier Inputs */}
          <div className="space-y-4 lg:col-span-7">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="player-ign" className="block text-xs font-medium text-slate-400">
                  Minecraft IGN
                </label>
                <input
                  id="player-ign"
                  type="text"
                  required
                  maxLength={20}
                  value={ign}
                  onChange={(e) => setIgn(e.target.value)}
                  placeholder="e.g. ItzNabidGamer"
                  className="mt-1.5 w-full rounded-lg border border-[#232938] bg-[#06070a] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-[#f97316] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="player-clan" className="block text-xs font-medium text-slate-400">
                  Clan Tag (Optional)
                </label>
                <input
                  id="player-clan"
                  type="text"
                  maxLength={8}
                  value={clan}
                  onChange={(e) => setClan(e.target.value)}
                  placeholder="e.g. OBS"
                  className="mt-1.5 w-full rounded-lg border border-[#232938] bg-[#06070a] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-[#f97316] focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="block text-xs font-medium text-slate-400">Region</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {REGIONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRegion(r)}
                      className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                        region === r
                          ? 'border-[#eab308] bg-[#eab308]/15 text-[#fde047]'
                          : 'border-[#232938] bg-[#06070a] text-slate-400 hover:text-white'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-slate-400">Player Status</span>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(['PRO', 'NOOB'] as PlayerStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`rounded-md border px-3 py-1.5 text-xs font-bold transition-colors ${
                        status === st
                          ? st === 'PRO'
                            ? 'border-[#f97316] bg-[#f97316]/20 text-[#fdba74]'
                            : 'border-[#ef4444] bg-[#ef4444]/15 text-[#fca5a5]'
                          : 'border-[#232938] bg-[#06070a] text-slate-400 hover:text-white'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="player-bio" className="block text-xs font-medium text-slate-400">
                Scouting Note / Bio
              </label>
              <input
                id="player-bio"
                type="text"
                maxLength={160}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Combat specialty, tournament highlights..."
                className="mt-1.5 w-full rounded-lg border border-[#232938] bg-[#06070a] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-[#f97316] focus:outline-none"
              />
            </div>

            {/* Per-mode tier assignment */}
            <div>
              <span className="block text-xs font-medium text-slate-400 mb-2">
                Gamemode Tiers (HT1 = 60pts down to LT5 = 1pt)
              </span>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {PLAYABLE_MODES.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-lg border border-[#232938] bg-[#06070a] p-2.5"
                  >
                    <label
                      htmlFor={`tier-${m.id}`}
                      className="block text-[11px] font-semibold text-slate-300"
                    >
                      {m.label}
                    </label>
                    <select
                      id={`tier-${m.id}`}
                      value={tiers[m.id]}
                      onChange={(e) =>
                        setTiers((prev) => ({
                          ...prev,
                          [m.id]: e.target.value as TierRank,
                        }))
                      }
                      className="mt-1 w-full rounded border border-[#232938] bg-[#0f1219] px-2 py-1 text-xs font-mono-num font-bold text-white focus:border-[#f97316] focus:outline-none"
                    >
                      {ALL_TIERS.map((t) => (
                        <option key={t} value={t}>
                          {t === 'UNRANKED' ? 'Unranked' : t}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-[#232938] pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#232938] bg-[#06070a] px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-lg bg-[#f97316] px-5 py-2 text-xs font-bold text-[#06070a] hover:bg-[#fb923c] transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                {initialPlayer ? 'Save Changes' : 'Add to Roster'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
