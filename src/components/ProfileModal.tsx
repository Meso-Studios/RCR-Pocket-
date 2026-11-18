import React, { useState } from 'react';
import {
  HapticsSettings,
  MatchInviteConfig,
  PlayerInfo,
  PlayerProfile,
  Song,
} from '../game/types';
import {
  ACTIVE_RIVAL_PROFILES,
  DEFAULT_OWNER_EMAIL,
  ROYALTY_FREE_SONGS,
  isUserAdmin,
} from '../game/constants';
import { triggerHapticFeedback } from '../game/haptics';
import {
  User,
  Swords,
  ShieldCheck,
  Trophy,
  Sparkles,
  Flame,
  Zap,
  Crown,
  X,
  Check,
  Skull,
  Music,
  Edit3,
} from 'lucide-react';

interface ProfileModalProps {
  playerInfo: PlayerInfo;
  user: any;
  customAdmins: string[];
  knownProfiles: PlayerProfile[];
  onUpdateProfile: (nextProfile: PlayerProfile) => void;
  onSend1v1Invite: (invite: MatchInviteConfig) => void;
  onClose: () => void;
  haptics?: HapticsSettings;
}

const AVATAR_OPTIONS = [
  { id: 'Sparkles', label: 'NEON STAR', color: '#00f0ff' },
  { id: 'Flame', label: 'CRIMSON FIRE', color: '#ff0055' },
  { id: 'Zap', label: 'VOLTAGE', color: '#f59e0b' },
  { id: 'Crown', label: 'ROYAL CROWN', color: '#a855f7' },
];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  playerInfo,
  user,
  customAdmins,
  knownProfiles,
  onUpdateProfile,
  onSend1v1Invite,
  onClose,
  haptics,
}) => {
  const defaultProfile: PlayerProfile = playerInfo.profile || {
    id: user?.uid || 'local_owner',
    displayName: user?.displayName || 'MARIN_RHYTHM',
    email: user?.email || DEFAULT_OWNER_EMAIL,
    avatarIcon: 'Crown',
    bannerColor: '#00f0ff',
    titleBadge: 'RHYTHM ARCHITECT',
    bio: '8-Lane Velocity & Hold-Note Specialist.',
    tracksCleared: (playerInfo.completedLevels?.length || 0) + 18,
    bestAccuracy: 99.2,
    versusWins: 14,
    versusMatches: 17,
    horseWins: 9,
  };

  const [activeTab, setActiveTab] = useState<'my_profile' | 'rivals'>('my_profile');
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(defaultProfile.displayName);
  const [emailInput, setEmailInput] = useState(defaultProfile.email || DEFAULT_OWNER_EMAIL);
  const [titleBadge, setTitleBadge] = useState(defaultProfile.titleBadge);
  const [bio, setBio] = useState(defaultProfile.bio);
  const [avatarIcon, setAvatarIcon] = useState(defaultProfile.avatarIcon);
  const [bannerColor, setBannerColor] = useState(defaultProfile.bannerColor);

  // 1v1 Invite builder state
  const [selectedRival, setSelectedRival] = useState<PlayerProfile>(
    knownProfiles[0] || ACTIVE_RIVAL_PROFILES[0]
  );
  const [inviteMode, setInviteMode] = useState<'online_vs' | 'horse'>('online_vs');
  const [allowedDeaths, setAllowedDeaths] = useState<1 | 2 | 3>(2);
  const [selectedSongId, setSelectedSongId] = useState<string>(String(ROYALTY_FREE_SONGS[0].id));

  const isAdmin = isUserAdmin(user?.email || defaultProfile.email, customAdmins);

  // Merge known profiles with active rival profiles without duplicates
  const allRivals: PlayerProfile[] = [...ACTIVE_RIVAL_PROFILES];
  for (const kp of knownProfiles) {
    if (kp.email !== defaultProfile.email && !allRivals.some((r) => r.id === kp.id || r.email === kp.email)) {
      allRivals.push(kp);
    }
  }

  const handleSaveProfile = () => {
    const updated: PlayerProfile = {
      ...defaultProfile,
      displayName: displayName.trim() || 'RHYTHM_PLAYER',
      email: emailInput.trim() || DEFAULT_OWNER_EMAIL,
      titleBadge: titleBadge.trim() || 'RHYTHM RUNNER',
      bio: bio.trim() || 'Ready for 1v1 rhythm duels.',
      avatarIcon,
      bannerColor,
      isAdmin: isUserAdmin(emailInput.trim(), customAdmins),
      lastActiveAt: Date.now(),
    };
    onUpdateProfile(updated);
    setEditing(false);
    triggerHapticFeedback('perfect', haptics);
  };

  const renderAvatarIcon = (iconName?: string, className = 'w-6 h-6') => {
    switch (iconName) {
      case 'Flame':
        return <Flame className={className} />;
      case 'Zap':
        return <Zap className={className} />;
      case 'Crown':
        return <Crown className={className} />;
      default:
        return <Sparkles className={className} />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 select-none">
      <div className="rc-panel w-full max-w-4xl border-2 border-cyan-400/50 shadow-[0_0_55px_rgba(0,240,255,0.28)] p-4 sm:p-5 max-h-[92vh] overflow-y-auto custom-scrollbar rc-modal-enter">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3 mb-4 border-b border-white/15">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-cyan-300">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-wider uppercase text-white">
                  PLAYER PROFILES & 1V1 ARENA INVITES
                </h2>
                {isAdmin && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> ADMIN
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-300">
                Customize your rhythm card, inspect players, and send direct 1v1 Versus or H.O.R.S.E. invites (1–3 allowed deaths)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setActiveTab('my_profile');
                triggerHapticFeedback('menu', haptics);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                activeTab === 'my_profile'
                  ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                  : 'bg-slate-900 border-white/15 text-slate-300 hover:border-white/30'
              }`}
            >
              MY PROFILE
            </button>
            <button
              onClick={() => {
                setActiveTab('rivals');
                triggerHapticFeedback('menu', haptics);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider border transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'rivals'
                  ? 'bg-fuchsia-500/25 border-fuchsia-400 text-fuchsia-200'
                  : 'bg-slate-900 border-white/15 text-slate-300 hover:border-white/30'
              }`}
            >
              <Swords className="w-3.5 h-3.5" /> PLAYERS & 1V1 INVITE ({allRivals.length})
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-white/10 hover:bg-rose-500/20 border border-white/20 hover:border-rose-400/50 flex items-center justify-center text-slate-200 hover:text-rose-300 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {activeTab === 'my_profile' ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Left Banner Card */}
            <div className="md:col-span-5 bg-slate-900/90 border border-white/15 rounded-2xl overflow-hidden flex flex-col justify-between">
              <div>
                <div
                  className="h-20 w-full relative flex items-end p-3"
                  style={{
                    background: `linear-gradient(135deg, ${bannerColor}55, #090d16 90%)`,
                    borderBottom: `2px solid ${bannerColor}66`,
                  }}
                >
                  <div
                    className="w-14 h-14 rounded-2xl bg-slate-950 border-2 flex items-center justify-center shadow-lg translate-y-5"
                    style={{ borderColor: bannerColor, color: bannerColor }}
                  >
                    {renderAvatarIcon(avatarIcon, 'w-7 h-7')}
                  </div>
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded bg-black/60 border border-white/20 text-[10px] font-black text-cyan-300">
                      LVL {playerInfo.level}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-black/60 border border-amber-400/40 text-[10px] font-black text-amber-300">
                      {playerInfo.coins.toLocaleString()} CR
                    </span>
                  </div>
                </div>

                <div className="pt-7 px-4 pb-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black text-white tracking-wider">
                      {defaultProfile.displayName}
                    </h3>
                    <button
                      onClick={() => setEditing(!editing)}
                      className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-cyan-500/20 border border-white/20 text-[10px] font-black uppercase tracking-wider text-cyan-200 flex items-center gap-1 cursor-pointer"
                    >
                      <Edit3 className="w-3 h-3" /> {editing ? 'CANCEL' : 'EDIT'}
                    </button>
                  </div>
                  <div
                    className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border"
                    style={{
                      backgroundColor: `${bannerColor}20`,
                      borderColor: `${bannerColor}60`,
                      color: bannerColor,
                    }}
                  >
                    {defaultProfile.titleBadge}
                  </div>
                  <p className="text-xs text-slate-300 mt-2.5 leading-relaxed">
                    {defaultProfile.bio}
                  </p>
                  <div className="mt-3 pt-2.5 border-t border-white/10 text-[10px] text-slate-400 flex items-center justify-between">
                    <span>ACCOUNT: {defaultProfile.email}</span>
                    <span className={isAdmin ? 'text-amber-300 font-black' : 'text-slate-400'}>
                      {isAdmin ? 'ADMIN ACCESS' : 'PLAYER'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Invite Rivals CTA */}
              <div className="p-3 bg-slate-950/80 border-t border-white/10 flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-300">
                  Ready for a code-free 1v1 match?
                </span>
                <button
                  onClick={() => setActiveTab('rivals')}
                  className="px-3 py-1.5 rounded-lg bg-fuchsia-500/25 hover:bg-fuchsia-500/35 border border-fuchsia-400 text-fuchsia-200 text-[11px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5"
                >
                  <Swords className="w-3.5 h-3.5" /> INVITE PLAYER
                </button>
              </div>
            </div>

            {/* Right Stats or Edit Form */}
            <div className="md:col-span-7 flex flex-col gap-3">
              {editing ? (
                <div className="bg-slate-900/90 border border-cyan-400/40 rounded-2xl p-4 space-y-3">
                  <div className="text-xs font-black uppercase tracking-wider text-cyan-300">
                    EDIT PROFILE CARD & ACCOUNT IDENTITY
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                        DISPLAY NAME
                      </label>
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-white/20 text-xs font-bold text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                        TITLE BADGE
                      </label>
                      <input
                        type="text"
                        value={titleBadge}
                        onChange={(e) => setTitleBadge(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-white/20 text-xs font-bold text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                      ACCOUNT EMAIL (Admins see Admin Studio & Track Rating controls)
                    </label>
                    <input
                      type="email"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-white/20 text-xs font-bold text-cyan-200"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                      BIO / STATUS
                    </label>
                    <input
                      type="text"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-white/20 text-xs text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {AVATAR_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => {
                          setAvatarIcon(opt.id);
                          setBannerColor(opt.color);
                        }}
                        className={`p-2 rounded-xl border text-center cursor-pointer transition-all ${
                          avatarIcon === opt.id
                            ? 'bg-white/15 border-cyan-400 text-white'
                            : 'bg-slate-950 border-white/10 text-slate-400'
                        }`}
                      >
                        <div className="flex justify-center mb-1" style={{ color: opt.color }}>
                          {renderAvatarIcon(opt.id, 'w-5 h-5')}
                        </div>
                        <div className="text-[10px] font-black">{opt.label}</div>
                      </button>
                    ))}
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setEditing(false)}
                      className="px-3 py-1.5 rounded-lg bg-white/10 text-xs font-black text-slate-300 cursor-pointer"
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={handleSaveProfile}
                      className="px-4 py-1.5 rounded-lg bg-cyan-400 text-slate-950 text-xs font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                    >
                      <Check className="w-4 h-4" /> SAVE PROFILE
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="bg-slate-900/90 border border-white/15 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      TRACKS CLEARED
                    </div>
                    <div className="text-xl font-black text-cyan-300 mt-1">
                      {defaultProfile.tracksCleared}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Solo & Featured Runs</div>
                  </div>
                  <div className="bg-slate-900/90 border border-white/15 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      PEAK ACCURACY
                    </div>
                    <div className="text-xl font-black text-emerald-300 mt-1">
                      {(defaultProfile.bestAccuracy ?? 98.5).toFixed(1)}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">S+ Rhythm Rating</div>
                  </div>
                  <div className="bg-slate-900/90 border border-white/15 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      1V1 VERSUS RECORD
                    </div>
                    <div className="text-xl font-black text-fuchsia-300 mt-1">
                      {defaultProfile.versusWins ?? 0}W /{' '}
                      {Math.max(0, (defaultProfile.versusMatches ?? 0) - (defaultProfile.versusWins ?? 0))}L
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">GD-Style Head-to-Head</div>
                  </div>
                  <div className="bg-slate-900/90 border border-white/15 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      H.O.R.S.E. VICTORIES
                    </div>
                    <div className="text-xl font-black text-amber-300 mt-1">
                      {defaultProfile.horseWins ?? 0} WINS
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Phrase Recording Duels</div>
                  </div>
                  <div className="bg-slate-900/90 border border-white/15 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      TOTAL XP EARNED
                    </div>
                    <div className="text-xl font-black text-white mt-1">
                      {playerInfo.xp.toLocaleString()} XP
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Level {playerInfo.level} Console</div>
                  </div>
                  <div className="bg-slate-900/90 border border-white/15 rounded-xl p-3">
                    <div className="text-[10px] font-black uppercase text-slate-400">
                      UNLOCKED COSMETICS
                    </div>
                    <div className="text-xl font-black text-sky-300 mt-1">
                      {(playerInfo.unlockedItems || playerInfo.unlockedSkins || []).length}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Skins, Trails & FX</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Rivals Directory & Direct 1v1 Invite Launcher */
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            {/* Players List */}
            <div className="md:col-span-6 space-y-2 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                ONLINE PLAYERS & RIVALS — CLICK TO INSPECT & INVITE
              </div>
              {allRivals.map((rival) => {
                const isSelected = selectedRival?.id === rival.id;
                return (
                  <button
                    key={rival.id}
                    onClick={() => {
                      setSelectedRival(rival);
                      triggerHapticFeedback('menu', haptics);
                    }}
                    className={`w-full p-3 rounded-xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 border-cyan-400 shadow-[0_0_18px_rgba(0,240,255,0.2)]'
                        : 'bg-slate-950/80 border-white/10 hover:border-white/25'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl bg-slate-900 border flex items-center justify-center shrink-0"
                        style={{ borderColor: rival.bannerColor, color: rival.bannerColor }}
                      >
                        {renderAvatarIcon(rival.avatarIcon, 'w-5 h-5')}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-white truncate">
                            {rival.displayName}
                          </span>
                          <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                        </div>
                        <div className="text-[10px] font-bold text-cyan-300 truncate">
                          {rival.titleBadge}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{rival.bio}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <div className="text-[10px] font-black text-fuchsia-300">
                        {rival.versusWins}W VS
                      </div>
                      <div className="text-[10px] text-emerald-300 font-bold">
                        {rival.bestAccuracy}% ACC
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Selected Player Profile & 1v1 Invite Builder */}
            <div className="md:col-span-6 bg-slate-900/95 border border-fuchsia-400/40 rounded-2xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-11 h-11 rounded-xl bg-slate-950 border-2 flex items-center justify-center"
                      style={{
                        borderColor: selectedRival.bannerColor,
                        color: selectedRival.bannerColor,
                      }}
                    >
                      {renderAvatarIcon(selectedRival.avatarIcon, 'w-6 h-6')}
                    </div>
                    <div>
                      <div className="text-sm font-black text-white">
                        {selectedRival.displayName}
                      </div>
                      <div className="text-[10px] font-black text-cyan-300">
                        {selectedRival.titleBadge}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-black text-emerald-300">ONLINE NOW</div>
                    <div className="text-[10px] text-slate-400">
                      {selectedRival.tracksCleared} Clears • {selectedRival.horseWins} H.O.R.S.E. Wins
                    </div>
                  </div>
                </div>

                {/* Mode Picker */}
                <div className="mb-3">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 block mb-1.5">
                    1. SELECT 1V1 DUEL MODE (NO LOBBY CODES REQUIRED)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setInviteMode('online_vs')}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        inviteMode === 'online_vs'
                          ? 'bg-cyan-500/25 border-cyan-400 text-white'
                          : 'bg-slate-950 border-white/10 text-slate-400'
                      }`}
                    >
                      <div className="text-xs font-black uppercase text-cyan-300 flex items-center gap-1">
                        <Swords className="w-3.5 h-3.5" /> ONLINE VERSUS
                      </div>
                      <div className="text-[10px] text-slate-300 mt-0.5">
                        GD Versus style live race — survive inside your allowed deaths!
                      </div>
                    </button>
                    <button
                      onClick={() => setInviteMode('horse')}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        inviteMode === 'horse'
                          ? 'bg-amber-500/25 border-amber-400 text-white'
                          : 'bg-slate-950 border-white/10 text-slate-400'
                      }`}
                    >
                      <div className="text-xs font-black uppercase text-amber-300 flex items-center gap-1">
                        <Trophy className="w-3.5 h-3.5" /> H.O.R.S.E. DUEL
                      </div>
                      <div className="text-[10px] text-slate-300 mt-0.5">
                        Record custom rhythm phrases & force your rival to match them!
                      </div>
                    </button>
                  </div>
                </div>

                {/* Allowed Deaths (1-3) */}
                <div className="mb-3">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 block mb-1.5">
                    2. CUSTOM ALLOWED DEATHS (1 – 3 LIVES BEFORE ELIMINATION)
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([1, 2, 3] as const).map((deaths) => (
                      <button
                        key={deaths}
                        onClick={() => setAllowedDeaths(deaths)}
                        className={`py-2 px-3 rounded-xl border font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          allowedDeaths === deaths
                            ? 'bg-rose-500/30 border-rose-400 text-rose-200 shadow-[0_0_15px_rgba(244,63,94,0.3)]'
                            : 'bg-slate-950 border-white/15 text-slate-400 hover:border-white/30'
                        }`}
                      >
                        <Skull className="w-3.5 h-3.5" />
                        {deaths} {deaths === 1 ? 'DEATH' : 'DEATHS'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Track Selector */}
                <div className="mb-4">
                  <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 block mb-1.5">
                    3. SELECT ARENA TRACK
                  </label>
                  <div className="relative">
                    <Music className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <select
                      value={selectedSongId}
                      onChange={(e) => setSelectedSongId(e.target.value)}
                      className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-white/20 text-xs font-black text-white"
                    >
                      {ROYALTY_FREE_SONGS.map((s: Song) => (
                        <option key={s.id} value={s.id}>
                          {s.title} — {s.artist} ({s.difficulty} • {s.bpm} BPM)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  triggerHapticFeedback('heavy', haptics);
                  onSend1v1Invite({
                    mode: inviteMode,
                    allowedDeaths,
                    targetProfile: selectedRival,
                    songId: selectedSongId,
                  });
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-400 via-fuchsia-400 to-rose-400 text-slate-950 font-black text-xs sm:text-sm uppercase tracking-widest shadow-[0_0_25px_rgba(0,240,255,0.4)] hover:brightness-110 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Swords className="w-4 h-4" />
                INVITE {selectedRival.displayName} TO 1V1 ({allowedDeaths} {allowedDeaths === 1 ? 'DEATH' : 'DEATHS'})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
