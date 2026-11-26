import React, { useEffect } from 'react';
import { X, Pencil, Trash2, Trophy } from 'lucide-react';
import {
  calculatePlayerPoints,
  getCombatTitle,
  PLAYABLE_MODES,
  PlayerRecord,
  TIER_POINTS,
  TIER_STYLES,
} from '../types';
import { MinecraftViewport3D } from './MinecraftViewport3D';

interface PlayerProfileModalProps {
  player: PlayerRecord | null;
  overallRank: number;
  adminActive: boolean;
  lowPowerMode: boolean;
  forceSoftware3D: boolean;
  onClose: () => void;
  onEdit: (player: PlayerRecord) => void;
  onDelete: (player: PlayerRecord) => void;
}

export const PlayerProfileModal: React.FC<PlayerProfileModalProps> = ({
  player,
  overallRank,
  adminActive,
  lowPowerMode,
  forceSoftware3D,
  onClose,
  onEdit,
  onDelete,
}) => {
  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [player, onClose]);

  if (!player) return null;

  const totalPoints = calculatePlayerPoints(player.tiers);
  const combatTitle = getCombatTitle(totalPoints);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92dvh] w-full max-w-4xl overflow-y-auto rounded-xl border border-[#232938] bg-[#0f1219] p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-start justify-between gap-4 border-b border-[#232938] pb-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-400">
              <span className="font-mono-num font-bold text-[#eab308]">Rank #{overallRank}</span>
              <span aria-hidden="true">·</span>
              <span>{combatTitle}</span>
              <span aria-hidden="true">·</span>
              <span>Region {player.region}</span>
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
            <h2
              id="profile-modal-title"
              className="mt-1 truncate text-2xl sm:text-3xl font-bold text-white"
            >
              {player.clan ? (
                <span className="mr-2 text-[#f97316] font-mono-num text-xl">[{player.clan}]</span>
              ) : null}
              {player.ign}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {adminActive && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(player)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#f97316]/50 bg-[#f97316]/15 px-3 py-2 text-xs font-semibold text-[#fdba74] hover:bg-[#f97316]/25 whitespace-nowrap transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(player)}
                  className="flex items-center gap-1.5 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-xs font-semibold text-[#fca5a5] hover:bg-[#ef4444]/20 whitespace-nowrap transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close player profile"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#232938] bg-[#06070a] text-slate-400 hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Two-column body: Interactive 3D Stage + Tier Breakdown */}
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <MinecraftViewport3D
              skinDataUrl={player.skinDataUrl}
              model={player.skinModel}
              lowPowerMode={lowPowerMode}
              forceSoftware3D={forceSoftware3D}
              initialPose="combat"
            />
          </div>

          <div className="flex flex-col justify-between gap-5 lg:col-span-7">
            <div>
              {/* Points & Summary row */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-[#232938] bg-[#06070a] p-3.5">
                  <div className="text-xs text-slate-400">Total Points</div>
                  <div className="mt-1 flex items-baseline gap-1.5 font-mono-num text-2xl font-bold text-[#eab308]">
                    <Trophy className="h-4 w-4 text-[#f97316] shrink-0" />
                    {totalPoints}
                  </div>
                </div>
                <div className="rounded-lg border border-[#232938] bg-[#06070a] p-3.5">
                  <div className="text-xs text-slate-400">Player Status</div>
                  <div
                    className={`mt-1 font-display text-2xl font-bold ${
                      player.status === 'PRO' ? 'text-[#f97316]' : 'text-slate-300'
                    }`}
                  >
                    {player.status}
                  </div>
                </div>
                <div className="rounded-lg border border-[#232938] bg-[#06070a] p-3.5">
                  <div className="text-xs text-slate-400">Skin Rig</div>
                  <div className="mt-1 font-display text-xl font-bold text-slate-100">
                    {player.skinModel === 'slim' ? 'Slim (3px)' : 'Classic (4px)'}
                  </div>
                </div>
              </div>

              {player.bio && (
                <p className="mt-4 text-sm leading-relaxed text-slate-300">{player.bio}</p>
              )}

              {/* Gamemode Tier Grid */}
              <div className="mt-5">
                <h3 className="text-sm font-semibold text-slate-200">Gamemode Tier Breakdown</h3>
                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {PLAYABLE_MODES.map((mode) => {
                    const tier = player.tiers[mode.id];
                    const style = TIER_STYLES[tier];
                    const pts = TIER_POINTS[tier];
                    return (
                      <div
                        key={mode.id}
                        className="flex items-center justify-between rounded-lg border border-[#232938] bg-[#06070a] px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-200 truncate">
                            {mode.label}
                          </div>
                          <div className="font-mono-num text-[11px] text-slate-500">{pts} pts</div>
                        </div>
                        <span
                          className="font-mono-num rounded px-2 py-0.5 text-xs font-bold shrink-0"
                          style={{
                            color: style.text,
                            backgroundColor: style.bg,
                            border: `1px solid ${style.border}`,
                          }}
                        >
                          {tier === 'UNRANKED' ? '—' : tier}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="border-t border-[#232938] pt-3 text-xs text-slate-500">
              Last updated {new Date(player.updatedAt).toLocaleDateString()} · Saved locally in
              offline browser storage
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
