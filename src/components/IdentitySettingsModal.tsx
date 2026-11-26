import React, { useRef, useState } from 'react';
import {
  Download,
  Lock,
  ShieldCheck,
  Upload,
  X,
  RotateCcw,
  Image as ImageIcon,
  Smartphone,
  Cpu,
} from 'lucide-react';
import {
  ADMIN_IGN,
  AppSettings,
  isAuthorizedAdminIgn,
  PlayerStatus,
  UserIdentity,
} from '../types';

interface IdentitySettingsModalProps {
  open: boolean;
  identity: UserIdentity;
  settings: AppSettings;
  canInstallPWA: boolean;
  isIOS: boolean;
  onClose: () => void;
  onUpdateIdentity: (next: UserIdentity) => void;
  onUpdateSettings: (next: AppSettings) => void;
  onExportJson: () => void;
  onImportJson: (raw: string) => boolean;
  onResetDefaultRoster: () => void;
  onInstallPWA: () => void;
}

export const IdentitySettingsModal: React.FC<IdentitySettingsModalProps> = ({
  open,
  identity,
  settings,
  canInstallPWA,
  isIOS,
  onClose,
  onUpdateIdentity,
  onUpdateSettings,
  onExportJson,
  onImportJson,
  onResetDefaultRoster,
  onInstallPWA,
}) => {
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const isAdminUnlocked = isAuthorizedAdminIgn(identity.ign);
  const isAdminOn = isAdminUnlocked && identity.adminEnabled;

  const handleIgnChange = (value: string) => {
    const trimmedClean = value.slice(0, 24);
    const unlocked = isAuthorizedAdminIgn(trimmedClean);
    onUpdateIdentity({
      ...identity,
      ign: trimmedClean,
      // Strictly enforce viewer mode (false) for any non-matching IGN
      adminEnabled: unlocked ? identity.adminEnabled : false,
    });
  };

  const handleToggleAdmin = () => {
    // Hard guard: impossible to toggle ON unless IGN equals ItzNabidGamer (case-insensitive, trimmed)
    if (!isAdminUnlocked) return;
    onUpdateIdentity({
      ...identity,
      adminEnabled: !identity.adminEnabled,
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isAdminOn) return;
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (dataUrl) {
        onUpdateSettings({ ...settings, customLogoDataUrl: dataUrl });
        setFeedback({ kind: 'ok', text: 'Circular brand logo updated and stored offline.' });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const ok = onImportJson(text);
      setFeedback(
        ok
          ? { kind: 'ok', text: 'Backup imported successfully to local offline database.' }
          : { kind: 'err', text: 'Invalid JSON backup file. No data was modified.' }
      );
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="identity-settings-title"
      onClick={onClose}
    >
      <div
        className="relative max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-[#232938] bg-[#0f1219] p-5 sm:p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#232938] pb-4">
          <div>
            <h2 id="identity-settings-title" className="text-xl font-bold text-white">
              Identity, Admin Lock & Offline Storage
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              All preferences, skins, rankings, and custom logos persist locally offline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#232938] bg-[#06070a] text-slate-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-6">
          {/* 1. User IGN & Status */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Player Identity</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-7">
                <label htmlFor="self-ign-input" className="block text-xs text-slate-400">
                  Your Minecraft IGN
                </label>
                <input
                  id="self-ign-input"
                  type="text"
                  value={identity.ign}
                  onChange={(e) => handleIgnChange(e.target.value)}
                  placeholder="Enter your IGN..."
                  className="mt-1.5 w-full rounded-lg border border-[#232938] bg-[#06070a] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-[#f97316] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-5">
                <span className="block text-xs text-slate-400">Your Status</span>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {(['PRO', 'NOOB'] as PlayerStatus[]).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => onUpdateIdentity({ ...identity, status: st })}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
                        identity.status === st
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
          </section>

          {/* 2. Strict Admin Mode ON/OFF Toggle */}
          <section className="rounded-lg border border-[#232938] bg-[#06070a] p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {isAdminUnlocked ? (
                    <ShieldCheck className="h-4 w-4 text-[#eab308] shrink-0" />
                  ) : (
                    <Lock className="h-4 w-4 text-[#ef4444] shrink-0" />
                  )}
                  <h3 className="text-sm font-bold text-white">Admin Mode</h3>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {isAdminUnlocked
                    ? `Authorized as ${ADMIN_IGN}. Toggle Admin Mode ON to manage players, skins, tiers, and brand logo, or OFF to preview Viewer Mode.`
                    : `Locked in Viewer Mode. Admin controls unlock exclusively when IGN matches "${ADMIN_IGN}".`}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isAdminOn}
                aria-disabled={!isAdminUnlocked}
                disabled={!isAdminUnlocked}
                onClick={handleToggleAdmin}
                className={`relative inline-flex h-10 min-w-[126px] items-center justify-between rounded-lg border px-3 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  !isAdminUnlocked
                    ? 'cursor-not-allowed border-[#232938] bg-[#0f1219] text-slate-500 opacity-60'
                    : isAdminOn
                      ? 'cursor-pointer border-[#eab308] bg-[#eab308] text-[#06070a] hover:bg-[#facc15]'
                      : 'cursor-pointer border-[#f97316]/60 bg-[#0f1219] text-[#fdba74] hover:border-[#f97316]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {!isAdminUnlocked && <Lock className="h-3.5 w-3.5" />}
                  {isAdminOn ? 'Admin: ON' : isAdminUnlocked ? 'Admin: OFF' : 'Locked'}
                </span>
                <span
                  aria-hidden="true"
                  className={`ml-2 inline-block h-3.5 w-6 rounded-full p-0.5 transition-colors ${
                    isAdminOn ? 'bg-[#06070a]/30' : 'bg-[#232938]'
                  }`}
                >
                  <span
                    className={`block h-2.5 w-2.5 rounded-full transition-transform ${
                      isAdminOn
                        ? 'translate-x-2.5 bg-[#06070a]'
                        : 'translate-x-0 bg-slate-500'
                    }`}
                  />
                </span>
              </button>
            </div>
          </section>

          {/* 3. Custom Circular Brand Logo (Admin Only) */}
          <section className="space-y-3 border-t border-[#232938] pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-200">
                Brand & Optional Circular Logo
              </h3>
              {!isAdminOn && (
                <span className="text-xs text-slate-500">Requires Admin Mode ON</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-[#232938] bg-[#06070a] shrink-0">
                {settings.customLogoDataUrl ? (
                  <img
                    src={settings.customLogoDataUrl}
                    alt="Custom organization logo"
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <ImageIcon className="h-5 w-5 text-slate-600" />
                )}
              </div>

              <div className="flex-1 min-w-[180px] space-y-2">
                <input
                  type="text"
                  disabled={!isAdminOn}
                  maxLength={32}
                  value={settings.orgName}
                  onChange={(e) =>
                    onUpdateSettings({ ...settings, orgName: e.target.value || 'Obsidian Tiers' })
                  }
                  placeholder="League / Organization Name"
                  className="w-full rounded-lg border border-[#232938] bg-[#06070a] px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50 focus:border-[#f97316] focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <label
                    className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isAdminOn
                        ? 'cursor-pointer border-[#232938] bg-[#06070a] text-slate-200 hover:border-[#f97316]'
                        : 'cursor-not-allowed border-[#232938] bg-[#06070a] text-slate-500 opacity-50'
                    }`}
                  >
                    <Upload className="h-3.5 w-3.5 text-[#f97316]" />
                    <span>Upload Circular Logo</span>
                    <input
                      type="file"
                      accept="image/*"
                      disabled={!isAdminOn}
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                  </label>
                  {settings.customLogoDataUrl && isAdminOn && (
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ ...settings, customLogoDataUrl: null })}
                      className="rounded-md border border-[#232938] px-2.5 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
                    >
                      Clear Logo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 4. Low-End Mobile Optimization & 3D Renderer Controls */}
          <section className="space-y-3 border-t border-[#232938] pt-5">
            <h3 className="text-sm font-semibold text-slate-200">
              Mobile Performance & 3D Engine
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ ...settings, lowPowerMode: !settings.lowPowerMode })
                }
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  settings.lowPowerMode
                    ? 'border-[#eab308]/60 bg-[#eab308]/10'
                    : 'border-[#232938] bg-[#06070a] hover:border-slate-700'
                }`}
              >
                <Smartphone
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    settings.lowPowerMode ? 'text-[#eab308]' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className="text-xs font-semibold text-white">
                    Low-Power Mobile Mode: {settings.lowPowerMode ? 'ON' : 'OFF'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Caps canvas DPR to 1.0 and throttles 3D FPS to preserve battery and RAM.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({ ...settings, forceSoftware3D: !settings.forceSoftware3D })
                }
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                  settings.forceSoftware3D
                    ? 'border-[#f97316]/60 bg-[#f97316]/10'
                    : 'border-[#232938] bg-[#06070a] hover:border-slate-700'
                }`}
              >
                <Cpu
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    settings.forceSoftware3D ? 'text-[#f97316]' : 'text-slate-400'
                  }`}
                />
                <div>
                  <div className="text-xs font-semibold text-white">
                    Pure Canvas 2D-3D Fallback: {settings.forceSoftware3D ? 'FORCED' : 'AUTO'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    Uses zero WebGL contexts. Automatically activates if GPU WebGL is unavailable.
                  </div>
                </div>
              </button>
            </div>
          </section>

          {/* 5. Offline JSON Backup Export / Import & PWA Install */}
          <section className="space-y-3 border-t border-[#232938] pt-5">
            <h3 className="text-sm font-semibold text-slate-200">
              Offline Backup & App Install
            </h3>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onExportJson}
                className="flex items-center gap-1.5 rounded-lg border border-[#232938] bg-[#06070a] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-[#f97316] transition-colors"
              >
                <Download className="h-3.5 w-3.5 text-[#eab308]" />
                Export JSON Backup
              </button>

              <button
                type="button"
                disabled={!isAdminOn}
                onClick={() => importInputRef.current?.click()}
                className={`flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors ${
                  isAdminOn
                    ? 'border-[#232938] bg-[#06070a] text-slate-200 hover:border-[#f97316]'
                    : 'cursor-not-allowed border-[#232938] bg-[#06070a] text-slate-500 opacity-50'
                }`}
              >
                <Upload className="h-3.5 w-3.5 text-[#f97316]" />
                Import JSON Backup
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                className="hidden"
              />

              {canInstallPWA && (
                <button
                  type="button"
                  onClick={onInstallPWA}
                  className="flex items-center gap-1.5 rounded-lg bg-[#f97316] px-3.5 py-2 text-xs font-bold text-[#06070a] hover:bg-[#fb923c] transition-colors"
                >
                  Install Offline App
                </button>
              )}

              {!canInstallPWA && isIOS && (
                <button
                  type="button"
                  onClick={() => setShowIOSGuide((s) => !s)}
                  className="rounded-lg border border-[#232938] bg-[#06070a] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:border-[#f97316]"
                >
                  Install on iOS
                </button>
              )}

              {isAdminOn && (
                <button
                  type="button"
                  onClick={() => {
                    if (!confirmReset) {
                      setConfirmReset(true);
                      return;
                    }
                    onResetDefaultRoster();
                    setConfirmReset(false);
                    setFeedback({ kind: 'ok', text: 'Default roster restored.' });
                  }}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-[#ef4444]/40 bg-[#ef4444]/10 px-3 py-2 text-xs font-semibold text-[#fca5a5] hover:bg-[#ef4444]/20 transition-colors"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {confirmReset ? 'Click Again to Confirm Reset' : 'Reset Roster'}
                </button>
              )}
            </div>

            {showIOSGuide && (
              <p className="rounded-lg border border-[#232938] bg-[#06070a] p-3 text-xs text-slate-300">
                In Safari, tap the <strong>Share</strong> icon and choose{' '}
                <strong>Add to Home Screen</strong> to launch Obsidian Tiers offline in standalone
                mode.
              </p>
            )}

            {feedback && (
              <p
                className={`text-xs font-medium ${
                  feedback.kind === 'ok' ? 'text-[#eab308]' : 'text-[#ef4444]'
                }`}
              >
                {feedback.text}
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
