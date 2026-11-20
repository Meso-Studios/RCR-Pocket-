import React, { useEffect, useRef, useState } from 'react';
import {
  HapticsSettings,
  MatchInviteConfig,
  MessagingWaitlistEntry,
  PlayerInfo,
  PlayerProfile,
  ProfileDirectMessage,
  Song,
} from '../game/types';
import {
  MESSAGING_WAITLIST_STORAGE_KEY,
  PROFILE_MESSAGES_STORAGE_KEY,
  REAL_PROFILES_STORAGE_KEY,
  ROYALTY_FREE_SONGS,
  isUserAdmin,
} from '../game/constants';
import { triggerHapticFeedback } from '../game/haptics';
import { db } from '../firebaseClient';
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
  Camera,
  Trash2,
  MessageSquare,
  Send,
  Clock,
  Lock,
  UserPlus,
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
  { id: 'Sparkles', label: 'NEON STAR', color: '#36e2ff' },
  { id: 'Flame', label: 'CRIMSON FIRE', color: '#ff2e88' },
  { id: 'Zap', label: 'VOLTAGE', color: '#facc15' },
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
  // Generate a stable per-device UID so guests never collide or default to "Marin"
  const [deviceUid] = useState<string>(() => {
    try {
      const existing = localStorage.getItem('rhythm_canvas_device_uid_v1');
      if (existing) return existing;
      const created = `player_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem('rhythm_canvas_device_uid_v1', created);
      return created;
    } catch {
      return 'player_local';
    }
  });

  const savedProfile = playerInfo.profile;
  const isLegacyUncreatedMarinDefault =
    savedProfile &&
    !savedProfile.createdProfile &&
    (savedProfile.displayName === 'Marin' || savedProfile.displayName === 'MARIN_RHYTHM') &&
    user?.email?.toLowerCase() !== 'palazzolomarin93@gmail.com';

  const effectiveProfile: PlayerProfile =
    savedProfile && !isLegacyUncreatedMarinDefault
      ? savedProfile
      : {
          id: user?.uid || deviceUid,
          uid: user?.uid || deviceUid,
          displayName: user?.displayName || '',
          email: user?.email || '',
          avatarIcon: 'Sparkles',
          avatarPhotoUrl: '',
          bannerColor: '#36e2ff',
          titleBadge: 'RHYTHM CHALLENGER',
          bio: 'Custom Rhythm Canvas Player',
          tracksCleared: playerInfo.completedLevels?.length || 0,
          bestAccuracy: 0,
          versusWins: 0,
          versusMatches: 0,
          horseWins: 0,
          createdProfile: Boolean(user?.displayName),
          messagingWaitlistStatus: 'none',
        };

  const hasCreatedProfile = Boolean(
    effectiveProfile.createdProfile && effectiveProfile.displayName.trim().length > 0
  );

  const [activeTab, setActiveTab] = useState<'my_profile' | 'rivals' | 'messages'>('my_profile');
  const [editing, setEditing] = useState<boolean>(!hasCreatedProfile);
  const [displayName, setDisplayName] = useState(effectiveProfile.displayName || '');
  const [emailInput, setEmailInput] = useState(effectiveProfile.email || user?.email || '');
  const [titleBadge, setTitleBadge] = useState(effectiveProfile.titleBadge || 'RHYTHM CHALLENGER');
  const [bio, setBio] = useState(effectiveProfile.bio || '');
  const [avatarIcon, setAvatarIcon] = useState(effectiveProfile.avatarIcon || 'Sparkles');
  const [avatarPhotoUrl, setAvatarPhotoUrl] = useState(effectiveProfile.avatarPhotoUrl || '');
  const [bannerColor, setBannerColor] = useState(effectiveProfile.bannerColor || '#36e2ff');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Real profiles directory (NO fake profiles)
  const [storedRealProfiles, setStoredRealProfiles] = useState<PlayerProfile[]>(() => {
    try {
      const raw = localStorage.getItem(REAL_PROFILES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Waitlist entries
  const [waitlistEntries, setWaitlistEntries] = useState<MessagingWaitlistEntry[]>(() => {
    try {
      const raw = localStorage.getItem(MESSAGING_WAITLIST_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [waitlistReason, setWaitlistReason] = useState('');
  const [waitlistNotice, setWaitlistNotice] = useState<string | null>(null);

  // Direct messages
  const [messages, setMessages] = useState<ProfileDirectMessage[]>(() => {
    try {
      const raw = localStorage.getItem(PROFILE_MESSAGES_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });
  const [messageInput, setMessageInput] = useState('');

  // Load real profiles, waitlist, and messages from Firestore when available
  useEffect(() => {
    let cancelled = false;
    const syncData = async () => {
      if (!db) return;
      try {
        const wlSnap = await db.collection('system').doc('messaging_waitlist').get();
        if (!cancelled && wlSnap && wlSnap.exists) {
          const list = wlSnap.data()?.entries;
          if (Array.isArray(list)) {
            setWaitlistEntries(list);
            localStorage.setItem(MESSAGING_WAITLIST_STORAGE_KEY, JSON.stringify(list));
          }
        }
      } catch {
        // offline fallback uses localStorage
      }
      try {
        const msgSnap = await db.collection('system').doc('profile_messages').get();
        if (!cancelled && msgSnap && msgSnap.exists) {
          const list = msgSnap.data()?.messages;
          if (Array.isArray(list)) {
            setMessages(list);
            localStorage.setItem(PROFILE_MESSAGES_STORAGE_KEY, JSON.stringify(list));
          }
        }
      } catch {
        // offline fallback
      }
      try {
        const profSnap = await db.collection('system').doc('real_profiles').get();
        if (!cancelled && profSnap && profSnap.exists) {
          const list = profSnap.data()?.profiles;
          if (Array.isArray(list)) {
            setStoredRealProfiles(list);
            localStorage.setItem(REAL_PROFILES_STORAGE_KEY, JSON.stringify(list));
          }
        }
      } catch {
        // offline fallback
      }
    };
    syncData();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentUid = user?.uid || effectiveProfile.uid || effectiveProfile.id || deviceUid;
  const effectiveEmail = (user?.email || effectiveProfile.email || emailInput || '').trim();
  const isAdmin = isUserAdmin(effectiveEmail, customAdmins);

  // Build real players list (filtering out any legacy fake rival IDs and current player)
  const FAKE_IDS = new Set([
    'usr-kuro-01',
    'usr-miku-02',
    'usr-vortex-03',
    'usr-aether-04',
    'rival_kuro_tekk',
    'rival_miku_diva',
    'rival_vortex_x',
    'rival_aether_wave',
  ]);

  const realOtherProfiles: PlayerProfile[] = [];
  const mergedSource = [...knownProfiles, ...storedRealProfiles];
  for (const kp of mergedSource) {
    if (!kp || !kp.displayName || !kp.displayName.trim()) continue;
    const kpId = String(kp.uid || kp.id || '');
    if (FAKE_IDS.has(kpId)) continue;
    if (kpId === currentUid) continue;
    if (
      effectiveEmail &&
      kp.email &&
      kp.email.trim().toLowerCase() === effectiveEmail.toLowerCase()
    ) {
      continue;
    }
    if (
      !realOtherProfiles.some(
        (r) =>
          (r.uid && r.uid === kp.uid) ||
          (r.id && r.id === kp.id) ||
          (r.email && kp.email && r.email.toLowerCase() === kp.email.toLowerCase()) ||
          r.displayName.toLowerCase() === kp.displayName.toLowerCase()
      )
    ) {
      realOtherProfiles.push(kp);
    }
  }

  const [selectedRival, setSelectedRival] = useState<PlayerProfile | null>(
    realOtherProfiles[0] || null
  );
  const [inviteMode, setInviteMode] = useState<'online_vs' | 'horse'>('online_vs');
  const [allowedDeaths, setAllowedDeaths] = useState<1 | 2 | 3>(2);
  const [selectedSongId, setSelectedSongId] = useState<string>(String(ROYALTY_FREE_SONGS[0].id));

  useEffect(() => {
    if (!selectedRival && realOtherProfiles.length > 0) {
      setSelectedRival(realOtherProfiles[0]);
    }
  }, [realOtherProfiles.length]);

  // Determine waitlist status for current user
  const myWaitlistEntry = waitlistEntries.find(
    (e) =>
      e.uid === currentUid ||
      (effectiveEmail && e.email && e.email.toLowerCase() === effectiveEmail.toLowerCase())
  );
  const hasMessagingAccess =
    isAdmin ||
    myWaitlistEntry?.status === 'approved' ||
    effectiveProfile.messagingWaitlistStatus === 'approved';

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please upload a valid image file (PNG, JPG, WEBP, GIF).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Compress & resize to 160x160 square avatar so it stores cleanly in localStorage & Firestore
        const canvas = document.createElement('canvas');
        const size = 160;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.84);
          setAvatarPhotoUrl(dataUrl);
          triggerHapticFeedback('menu', haptics);
        } else if (typeof reader.result === 'string') {
          setAvatarPhotoUrl(reader.result);
        }
      };
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    const cleanName = displayName.trim();
    if (!cleanName) {
      setPhotoError('Please enter your Display Name to create your profile.');
      return;
    }
    const cleanEmail = emailInput.trim();
    const updated: PlayerProfile = {
      ...effectiveProfile,
      id: currentUid,
      uid: currentUid,
      displayName: cleanName,
      email: cleanEmail || undefined,
      titleBadge: titleBadge.trim() || 'RHYTHM CHALLENGER',
      bio: bio.trim() || 'Custom Rhythm Canvas Player',
      avatarIcon,
      avatarPhotoUrl: avatarPhotoUrl || undefined,
      bannerColor,
      isAdmin: isUserAdmin(cleanEmail || user?.email, customAdmins),
      lastActiveAt: Date.now(),
      createdProfile: true,
      messagingWaitlistStatus: hasMessagingAccess
        ? 'approved'
        : myWaitlistEntry?.status === 'pending'
        ? 'pending'
        : effectiveProfile.messagingWaitlistStatus || 'none',
    };

    onUpdateProfile(updated);
    setEditing(false);
    setPhotoError(null);
    triggerHapticFeedback('perfect', haptics);

    // Save to real profiles registry so other players & admins can see this real profile
    const nextReal = [
      updated,
      ...storedRealProfiles.filter(
        (p) =>
          (p.uid || p.id) !== currentUid &&
          (!cleanEmail || !p.email || p.email.toLowerCase() !== cleanEmail.toLowerCase())
      ),
    ];
    setStoredRealProfiles(nextReal);
    try {
      localStorage.setItem(REAL_PROFILES_STORAGE_KEY, JSON.stringify(nextReal));
      if (db) {
        await db.collection('system').doc('real_profiles').set({ profiles: nextReal }, { merge: true });
      }
    } catch {
      // localStorage already updated
    }
  };

  const handleApplyWaitlist = async () => {
    if (!hasCreatedProfile && !displayName.trim()) {
      setWaitlistNotice('Please create and save your Profile Name in MY PROFILE first!');
      return;
    }
    const entry: MessagingWaitlistEntry = {
      uid: currentUid,
      displayName: (effectiveProfile.displayName || displayName || 'Player').trim(),
      email: effectiveEmail || undefined,
      avatarPhotoUrl: avatarPhotoUrl || effectiveProfile.avatarPhotoUrl,
      avatarEmoji: avatarIcon,
      reason: waitlistReason.trim() || 'Requesting access to Rhythm Canvas Profile Messaging.',
      status: isAdmin ? 'approved' : 'pending',
      appliedAt: Date.now(),
    };
    const nextList = [
      entry,
      ...waitlistEntries.filter(
        (e) =>
          e.uid !== currentUid &&
          (!effectiveEmail || !e.email || e.email.toLowerCase() !== effectiveEmail.toLowerCase())
      ),
    ];
    setWaitlistEntries(nextList);
    onUpdateProfile({
      ...effectiveProfile,
      displayName: entry.displayName,
      createdProfile: true,
      messagingWaitlistStatus: entry.status === 'approved' ? 'approved' : 'pending',
    });
    setWaitlistNotice('Waitlist application submitted! Admins can now approve you in Admin Studio.');
    triggerHapticFeedback('perfect', haptics);
    try {
      localStorage.setItem(MESSAGING_WAITLIST_STORAGE_KEY, JSON.stringify(nextList));
      if (db) {
        await db.collection('system').doc('messaging_waitlist').set({ entries: nextList }, { merge: true });
      }
    } catch {
      // localStorage updated
    }
  };

  const handleSendMessage = async () => {
    if (!hasMessagingAccess || !selectedRival || !messageInput.trim()) return;
    const targetUid = String(selectedRival.uid || selectedRival.id || selectedRival.displayName);
    const newMsg: ProfileDirectMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fromUid: currentUid,
      fromName: effectiveProfile.displayName || displayName || 'Player',
      fromPhotoUrl: avatarPhotoUrl || effectiveProfile.avatarPhotoUrl,
      toUid: targetUid,
      toName: selectedRival.displayName,
      text: messageInput.trim(),
      createdAt: Date.now(),
    };
    const nextMsgs = [...messages, newMsg].slice(-200);
    setMessages(nextMsgs);
    setMessageInput('');
    triggerHapticFeedback('hit', haptics);
    try {
      localStorage.setItem(PROFILE_MESSAGES_STORAGE_KEY, JSON.stringify(nextMsgs));
      if (db) {
        await db.collection('system').doc('profile_messages').set({ messages: nextMsgs }, { merge: true });
      }
    } catch {
      // localStorage updated
    }
  };

  const renderAvatar = (
    photoUrl?: string,
    iconName?: string,
    borderColor = '#36e2ff',
    sizeClass = 'w-14 h-14',
    iconClass = 'w-7 h-7'
  ) => {
    if (photoUrl) {
      return (
        <div
          className={`${sizeClass} rounded-xl bg-slate-950 border-2 overflow-hidden flex items-center justify-center shrink-0 shadow-[0_4px_0_rgba(0,0,0,0.65)]`}
          style={{ borderColor }}
        >
          <img
            src={photoUrl}
            alt="Player Avatar"
            className="w-full h-full object-cover"
          />
        </div>
      );
    }
    return (
      <div
        className={`${sizeClass} rounded-xl bg-slate-950 border-2 flex items-center justify-center shrink-0 shadow-[0_4px_0_rgba(0,0,0,0.65)]`}
        style={{ borderColor, color: borderColor }}
      >
        {iconName === 'Flame' ? (
          <Flame className={iconClass} />
        ) : iconName === 'Zap' ? (
          <Zap className={iconClass} />
        ) : iconName === 'Crown' ? (
          <Crown className={iconClass} />
        ) : (
          <Sparkles className={iconClass} />
        )}
      </div>
    );
  };

  const selectedRivalUid = selectedRival
    ? String(selectedRival.uid || selectedRival.id || selectedRival.displayName)
    : '';
  const activeConversation = messages.filter(
    (m) =>
      (m.fromUid === currentUid && m.toUid === selectedRivalUid) ||
      (m.fromUid === selectedRivalUid && m.toUid === currentUid)
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 select-none">
      <div className="rc-console-tray w-full max-w-4xl p-3 sm:p-4 max-h-[94vh] flex flex-col gap-3 overflow-hidden rc-modal-enter">
        {/* Top Dock Header — Same osu!-arcade console UI as the rest of the game */}
        <div className="rc-dock-rail px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#101830] border-2 border-[#36e2ff] flex items-center justify-center text-[#36e2ff] shadow-[0_3px_0_#060913]">
              <User className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black tracking-wider uppercase text-white">
                  PLAYER PROFILE & CONSOLE NETWORK
                </h2>
                {isAdmin && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border-2 border-amber-400 text-amber-300 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" /> ADMIN
                  </span>
                )}
              </div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-200/80">
                Create your custom profile & photo • Direct 1v1 Invites • Waitlist Messaging
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => {
                setActiveTab('my_profile');
                triggerHapticFeedback('menu', haptics);
              }}
              className={`rc-bevel-btn px-3 py-1.5 text-[11px] font-black uppercase tracking-wider cursor-pointer ${
                activeTab === 'my_profile' ? 'rc-tile-cyan' : 'rc-sub-dark text-slate-300'
              }`}
            >
              MY PROFILE
            </button>
            <button
              onClick={() => {
                setActiveTab('rivals');
                triggerHapticFeedback('menu', haptics);
              }}
              className={`rc-bevel-btn px-3 py-1.5 text-[11px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'rivals' ? 'rc-tile-pink' : 'rc-sub-dark text-slate-300'
              }`}
            >
              <Swords className="w-3.5 h-3.5" /> 1V1 PLAYERS ({realOtherProfiles.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('messages');
                triggerHapticFeedback('menu', haptics);
              }}
              className={`rc-bevel-btn px-3 py-1.5 text-[11px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'messages' ? 'rc-tile-gold' : 'rc-sub-dark text-slate-300'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" /> MESSAGES
              {hasMessagingAccess && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              )}
            </button>
            <button
              onClick={onClose}
              className="rc-bevel-btn rc-tile-red w-8 h-8 flex items-center justify-center text-white cursor-pointer"
              title="Close Profile Console"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Main Body Inset */}
        <div className="rc-console-inset p-3 sm:p-4 flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          {activeTab === 'my_profile' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left Console Identity Card */}
              <div className="md:col-span-5 rc-panel p-0 overflow-hidden flex flex-col justify-between border-2 border-[#36e2ff]/60">
                <div>
                  <div
                    className="h-24 w-full relative flex items-end p-3"
                    style={{
                      background: `linear-gradient(135deg, ${bannerColor}66, #0b1022 90%)`,
                      borderBottom: `3px solid ${bannerColor}`,
                    }}
                  >
                    <div className="translate-y-5">
                      {renderAvatar(
                        avatarPhotoUrl || effectiveProfile.avatarPhotoUrl,
                        avatarIcon,
                        bannerColor,
                        'w-16 h-16',
                        'w-8 h-8'
                      )}
                    </div>
                    <div className="ml-auto flex items-center gap-1.5">
                      <span className="rc-dock-well px-2.5 py-1 text-[10px] font-black text-cyan-300 tabular-nums">
                        LVL {playerInfo.level}
                      </span>
                      <span className="rc-dock-well px-2.5 py-1 text-[10px] font-black text-amber-300 tabular-nums">
                        {playerInfo.coins.toLocaleString()} CR
                      </span>
                    </div>
                  </div>

                  <div className="pt-8 px-4 pb-4">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base sm:text-lg font-black text-white tracking-wider truncate">
                        {hasCreatedProfile
                          ? effectiveProfile.displayName
                          : displayName.trim() || 'NEW RHYTHM PLAYER'}
                      </h3>
                      <button
                        onClick={() => setEditing(!editing)}
                        className="rc-bevel-btn rc-sub-teal px-2.5 py-1 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <Edit3 className="w-3 h-3" /> {editing ? 'VIEW STATS' : 'CUSTOMIZE'}
                      </button>
                    </div>

                    <div
                      className="inline-block mt-1.5 px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest border-2"
                      style={{
                        backgroundColor: `${bannerColor}22`,
                        borderColor: bannerColor,
                        color: bannerColor,
                      }}
                    >
                      {effectiveProfile.titleBadge || titleBadge}
                    </div>

                    <p className="text-xs text-slate-200 mt-2.5 leading-relaxed font-semibold">
                      {effectiveProfile.bio || bio || 'Create your custom profile & upload a photo!'}
                    </p>

                    <div className="mt-3 pt-2.5 border-t-2 border-white/10 text-[10px] text-slate-300 flex items-center justify-between tabular-nums">
                      <span className="truncate max-w-[65%]">
                        {effectiveEmail ? `ID: ${effectiveEmail}` : `UID: ${currentUid}`}
                      </span>
                      <span className={isAdmin ? 'text-amber-300 font-black' : 'text-cyan-300 font-bold'}>
                        {isAdmin ? 'ADMIN ACCESS' : hasCreatedProfile ? 'VERIFIED PROFILE' : 'UNREGISTERED'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-[#090d1c] border-t-2 border-white/10 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setActiveTab('rivals')}
                    className="rc-bevel-btn rc-tile-pink flex-1 py-2 text-[10px] font-black uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Swords className="w-3.5 h-3.5" /> 1V1 PLAYERS
                  </button>
                  <button
                    onClick={() => setActiveTab('messages')}
                    className="rc-bevel-btn rc-tile-gold flex-1 py-2 text-[10px] font-black uppercase tracking-wider cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> MESSAGES
                  </button>
                </div>
              </div>

              {/* Right Panel: Create/Edit Form or Console Stats */}
              <div className="md:col-span-7 flex flex-col gap-3">
                {editing ? (
                  <div className="rc-dock-rail p-4 space-y-3">
                    <div className="flex items-center justify-between border-b-2 border-white/10 pb-2">
                      <div className="text-xs font-black uppercase tracking-wider text-[#36e2ff] flex items-center gap-1.5">
                        <UserPlus className="w-4 h-4" />
                        {hasCreatedProfile ? 'CUSTOMIZE YOUR PROFILE' : 'CREATE YOUR PLAYER PROFILE'}
                      </div>
                      <span className="text-[10px] font-black uppercase text-amber-300">
                        CUSTOM PHOTO & IDENTITY
                      </span>
                    </div>

                    {/* Custom Photo Upload Section */}
                    <div className="rc-dock-well p-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        {renderAvatar(avatarPhotoUrl, avatarIcon, bannerColor, 'w-14 h-14', 'w-7 h-7')}
                        <div>
                          <div className="text-xs font-black text-white uppercase tracking-wider">
                            CUSTOM PROFILE PHOTO
                          </div>
                          <div className="text-[10px] text-slate-300">
                            Upload any custom photo (JPG, PNG, WEBP) or choose a neon badge icon below.
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="rc-bevel-btn rc-tile-cyan px-3 py-1.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-3.5 h-3.5" /> UPLOAD PHOTO
                        </button>
                        {avatarPhotoUrl && (
                          <button
                            type="button"
                            onClick={() => setAvatarPhotoUrl('')}
                            className="rc-bevel-btn rc-tile-red px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                            title="Remove custom photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> CLEAR
                          </button>
                        )}
                      </div>
                    </div>

                    {photoError && (
                      <div className="px-3 py-2 rounded-lg bg-rose-500/20 border-2 border-rose-400 text-rose-200 text-xs font-bold">
                        {photoError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase text-cyan-200 block mb-1">
                          YOUR DISPLAY NAME *
                        </label>
                        <input
                          type="text"
                          placeholder="Enter your player name..."
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#070a14] border-2 border-[#36e2ff]/50 text-xs font-black text-white focus:outline-none focus:border-[#36e2ff]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-cyan-200 block mb-1">
                          TITLE BADGE
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. RHYTHM CHALLENGER"
                          value={titleBadge}
                          onChange={(e) => setTitleBadge(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#070a14] border-2 border-white/20 text-xs font-bold text-white focus:outline-none focus:border-[#36e2ff]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-black uppercase text-cyan-200 block mb-1">
                          EMAIL (OPTIONAL — ADMINS UNLOCK ADMIN STUDIO)
                        </label>
                        <input
                          type="email"
                          placeholder="your-email@example.com"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#070a14] border-2 border-white/20 text-xs font-bold text-cyan-200 focus:outline-none focus:border-[#36e2ff]"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase text-cyan-200 block mb-1">
                          BIO / STATUS MESSAGE
                        </label>
                        <input
                          type="text"
                          placeholder="Tell players about your rhythm style..."
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#070a14] border-2 border-white/20 text-xs font-bold text-white focus:outline-none focus:border-[#36e2ff]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-black uppercase text-cyan-200 block mb-1.5">
                        BANNER ACCENT & FALLBACK EMBLEM
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {AVATAR_OPTIONS.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setAvatarIcon(opt.id);
                              setBannerColor(opt.color);
                            }}
                            className={`rc-bevel-btn p-2 text-center cursor-pointer ${
                              avatarIcon === opt.id ? 'rc-tile-cyan' : 'rc-sub-dark text-slate-300'
                            }`}
                          >
                            <div className="text-[10px] font-black uppercase">{opt.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      {hasCreatedProfile && (
                        <button
                          type="button"
                          onClick={() => setEditing(false)}
                          className="rc-bevel-btn rc-sub-dark px-3 py-2 text-xs font-black text-slate-300 cursor-pointer"
                        >
                          CANCEL
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveProfile}
                        className="rc-bevel-btn rc-tile-green px-5 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-4 h-4" /> SAVE MY PROFILE
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="rc-dock-rail p-3">
                      <div className="text-[10px] font-black uppercase text-cyan-200">
                        TRACKS CLEARED
                      </div>
                      <div className="text-xl font-black text-[#36e2ff] mt-1">
                        {effectiveProfile.tracksCleared ?? (playerInfo.completedLevels?.length || 0)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-bold">
                        Solo & Featured Runs
                      </div>
                    </div>
                    <div className="rc-dock-rail p-3">
                      <div className="text-[10px] font-black uppercase text-emerald-200">
                        PEAK ACCURACY
                      </div>
                      <div className="text-xl font-black text-emerald-300 mt-1">
                        {(effectiveProfile.bestAccuracy ?? 0).toFixed(1)}%
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-bold">
                        Best Career Accuracy
                      </div>
                    </div>
                    <div className="rc-dock-rail p-3">
                      <div className="text-[10px] font-black uppercase text-pink-200">
                        1V1 VERSUS RECORD
                      </div>
                      <div className="text-xl font-black text-[#ff2e88] mt-1">
                        {effectiveProfile.versusWins ?? 0}W /{' '}
                        {Math.max(
                          0,
                          (effectiveProfile.versusMatches ?? 0) - (effectiveProfile.versusWins ?? 0)
                        )}
                        L
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-bold">
                        GD-Style Head-to-Head
                      </div>
                    </div>
                    <div className="rc-dock-rail p-3">
                      <div className="text-[10px] font-black uppercase text-amber-200">
                        H.O.R.S.E. VICTORIES
                      </div>
                      <div className="text-xl font-black text-amber-300 mt-1">
                        {effectiveProfile.horseWins ?? 0} WINS
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-bold">
                        Phrase Duels Won
                      </div>
                    </div>
                    <div className="rc-dock-rail p-3">
                      <div className="text-[10px] font-black uppercase text-white">
                        CONSOLE XP & LEVEL
                      </div>
                      <div className="text-xl font-black text-white mt-1">
                        LVL {playerInfo.level}
                      </div>
                      <div className="text-[10px] text-cyan-300 mt-0.5 font-bold tabular-nums">
                        {playerInfo.xp.toLocaleString()} XP
                      </div>
                    </div>
                    <div className="rc-dock-rail p-3">
                      <div className="text-[10px] font-black uppercase text-purple-200">
                        UNLOCKED SKINS
                      </div>
                      <div className="text-xl font-black text-purple-300 mt-1">
                        {(playerInfo.unlockedNoteProducts?.length || 0) +
                          (playerInfo.unlockedSkins?.length || 1)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 font-bold">
                        Cosmetic Note Skins
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'rivals' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left: Real Players List (No Fake Profiles) */}
              <div className="md:col-span-6 rc-dock-rail p-3 flex flex-col gap-2 max-h-[58vh] overflow-y-auto custom-scrollbar">
                <div className="text-[10px] font-black uppercase tracking-widest text-[#36e2ff]">
                  REGISTERED PLAYER PROFILES ({realOtherProfiles.length})
                </div>

                {realOtherProfiles.length === 0 ? (
                  <div className="rc-dock-well p-5 text-center space-y-2">
                    <div className="text-xs font-black uppercase text-white">
                      NO OTHER PLAYER PROFILES REGISTERED YET
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      All fake profiles have been removed. Real player profiles appear here as soon as
                      other players create their profile! You can still launch a live 1v1 Versus or
                      H.O.R.S.E. match anytime using the 1v1 Match Builder on the right.
                    </p>
                  </div>
                ) : (
                  realOtherProfiles.map((rival) => {
                    const rId = rival.uid || rival.id || rival.displayName;
                    const isSelected =
                      (selectedRival?.uid || selectedRival?.id || selectedRival?.displayName) === rId;
                    return (
                      <button
                        key={rId}
                        onClick={() => {
                          setSelectedRival(rival);
                          triggerHapticFeedback('menu', haptics);
                        }}
                        className={`rc-bevel-btn w-full p-2.5 text-left flex items-center justify-between cursor-pointer ${
                          isSelected ? 'rc-tile-cyan' : 'rc-sub-dark text-white'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {renderAvatar(
                            rival.avatarPhotoUrl,
                            rival.avatarIcon,
                            rival.bannerColor || '#36e2ff',
                            'w-10 h-10',
                            'w-5 h-5'
                          )}
                          <div className="min-w-0">
                            <div className="text-xs font-black truncate">
                              {rival.displayName}
                            </div>
                            <div className="text-[10px] font-bold opacity-90 truncate">
                              {rival.titleBadge || 'RHYTHM CHALLENGER'}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2 tabular-nums">
                          <div className="text-[10px] font-black">
                            {rival.versusWins ?? 0}W VS
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Right: 1v1 Direct Match Launcher */}
              <div className="md:col-span-6 rc-dock-rail p-4 flex flex-col justify-between gap-3">
                <div>
                  <div className="flex items-center justify-between pb-2.5 mb-3 border-b-2 border-white/15">
                    <div>
                      <div className="text-xs font-black uppercase text-[#ff2e88]">
                        1V1 ARENA INVITE & MATCHMAKER
                      </div>
                      <div className="text-[10px] text-slate-300 font-bold">
                        {selectedRival
                          ? `Target Opponent: ${selectedRival.displayName}`
                          : 'Open 1v1 Matchmaking Queue (No room codes needed)'}
                      </div>
                    </div>
                  </div>

                  {/* Mode Picker */}
                  <div className="mb-3">
                    <label className="text-[10px] font-black uppercase tracking-wider text-cyan-200 block mb-1.5">
                      1. SELECT 1V1 DUEL MODE
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setInviteMode('online_vs')}
                        className={`rc-bevel-btn p-2.5 text-left cursor-pointer ${
                          inviteMode === 'online_vs' ? 'rc-tile-cyan' : 'rc-sub-dark text-slate-300'
                        }`}
                      >
                        <div className="text-xs font-black uppercase flex items-center gap-1">
                          <Swords className="w-3.5 h-3.5" /> ONLINE VERSUS
                        </div>
                        <div className="text-[10px] mt-0.5 font-bold opacity-90">
                          GD-Style live race with 1–3 allowed deaths
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setInviteMode('horse')}
                        className={`rc-bevel-btn p-2.5 text-left cursor-pointer ${
                          inviteMode === 'horse' ? 'rc-tile-gold' : 'rc-sub-dark text-slate-300'
                        }`}
                      >
                        <div className="text-xs font-black uppercase flex items-center gap-1">
                          <Trophy className="w-3.5 h-3.5" /> H.O.R.S.E. DUEL
                        </div>
                        <div className="text-[10px] mt-0.5 font-bold opacity-90">
                          Record custom rhythm phrases & challenge rival
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Allowed Deaths (1-3) */}
                  <div className="mb-3">
                    <label className="text-[10px] font-black uppercase tracking-wider text-cyan-200 block mb-1.5">
                      2. ALLOWED DEATHS (1 – 3 LIVES)
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {([1, 2, 3] as const).map((deaths) => (
                        <button
                          key={deaths}
                          type="button"
                          onClick={() => setAllowedDeaths(deaths)}
                          className={`rc-bevel-btn py-2 px-3 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer ${
                            allowedDeaths === deaths ? 'rc-tile-red' : 'rc-sub-dark text-slate-300'
                          }`}
                        >
                          <Skull className="w-3.5 h-3.5" />
                          {deaths} {deaths === 1 ? 'DEATH' : 'DEATHS'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Track Selector */}
                  <div className="mb-3">
                    <label className="text-[10px] font-black uppercase tracking-wider text-cyan-200 block mb-1.5">
                      3. SELECT ARENA TRACK
                    </label>
                    <div className="relative">
                      <Music className="w-3.5 h-3.5 text-cyan-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <select
                        value={selectedSongId}
                        onChange={(e) => setSelectedSongId(e.target.value)}
                        className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#070a14] border-2 border-[#36e2ff]/50 text-xs font-black text-white"
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
                  type="button"
                  onClick={() => {
                    triggerHapticFeedback('heavy', haptics);
                    onSend1v1Invite({
                      mode: inviteMode,
                      allowedDeaths,
                      targetProfile: selectedRival || undefined,
                      songId: selectedSongId,
                    });
                  }}
                  className="rc-bevel-btn rc-tile-pink w-full py-3 font-black text-xs sm:text-sm uppercase tracking-widest cursor-pointer flex items-center justify-center gap-2"
                >
                  <Swords className="w-4 h-4" />
                  {selectedRival
                    ? `INVITE ${selectedRival.displayName} TO 1V1 (${allowedDeaths} ${
                        allowedDeaths === 1 ? 'DEATH' : 'DEATHS'
                      })`
                    : `START 1V1 MATCHMAKING (${allowedDeaths} ${
                        allowedDeaths === 1 ? 'DEATH' : 'DEATHS'
                      })`}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'messages' && (
            <div className="space-y-4">
              {!hasMessagingAccess ? (
                /* Waitlist Application Gate for Non-Admins */
                <div className="rc-dock-rail p-5 max-w-2xl mx-auto space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-300 shrink-0">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-black uppercase text-white">
                        PROFILE MESSAGING WAITLIST
                      </h3>
                      <p className="text-xs text-slate-300 font-semibold">
                        Profile Messaging is an exclusive Rhythm Canvas feature. All Admins have automatic
                        access, and players can apply below for Admin approval!
                      </p>
                    </div>
                  </div>

                  {myWaitlistEntry?.status === 'pending' ||
                  effectiveProfile.messagingWaitlistStatus === 'pending' ? (
                    <div className="rc-dock-well p-4 border-2 border-amber-400/60 flex items-center gap-3">
                      <Clock className="w-6 h-6 text-amber-300 shrink-0" />
                      <div>
                        <div className="text-xs font-black uppercase text-amber-300">
                          APPLICATION PENDING ADMIN APPROVAL
                        </div>
                        <div className="text-[11px] text-slate-300 mt-0.5">
                          Your application under{' '}
                          <span className="text-white font-bold">
                            {myWaitlistEntry?.displayName || effectiveProfile.displayName}
                          </span>{' '}
                          is in the queue. Any Admin can approve you in the Admin Studio!
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-black uppercase text-cyan-200 block mb-1">
                          WHY DO YOU WANT ACCESS TO PROFILE MESSAGING?
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Organizing 1v1 tournaments & collab charts..."
                          value={waitlistReason}
                          onChange={(e) => setWaitlistReason(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg bg-[#070a14] border-2 border-[#36e2ff]/50 text-xs font-bold text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleApplyWaitlist}
                        className="rc-bevel-btn rc-tile-gold px-5 py-2.5 text-xs font-black uppercase tracking-wider cursor-pointer flex items-center gap-2"
                      >
                        <MessageSquare className="w-4 h-4" /> APPLY FOR MESSAGING WAITLIST
                      </button>
                    </div>
                  )}

                  {waitlistNotice && (
                    <div className="px-3 py-2 rounded-lg bg-emerald-500/20 border-2 border-emerald-400 text-emerald-200 text-xs font-bold">
                      {waitlistNotice}
                    </div>
                  )}
                </div>
              ) : (
                /* Approved / Admin Direct Messaging Console */
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-4 rc-dock-rail p-3 flex flex-col gap-2 max-h-[55vh] overflow-y-auto custom-scrollbar">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-amber-300">
                        DIRECT MESSAGE RECIPIENTS
                      </span>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-[9px] font-black uppercase">
                        {isAdmin ? 'ADMIN ACCESS' : 'APPROVED'}
                      </span>
                    </div>

                    {realOtherProfiles.length === 0 ? (
                      <div className="rc-dock-well p-4 text-center text-[11px] text-slate-300">
                        No other real player profiles registered yet. When players create profiles,
                        they appear here for direct messaging.
                      </div>
                    ) : (
                      realOtherProfiles.map((p) => {
                        const pId = String(p.uid || p.id || p.displayName);
                        const isSelected = selectedRivalUid === pId;
                        return (
                          <button
                            key={pId}
                            type="button"
                            onClick={() => setSelectedRival(p)}
                            className={`rc-bevel-btn p-2.5 text-left flex items-center gap-2.5 cursor-pointer ${
                              isSelected ? 'rc-tile-gold' : 'rc-sub-dark text-white'
                            }`}
                          >
                            {renderAvatar(
                              p.avatarPhotoUrl,
                              p.avatarIcon,
                              p.bannerColor || '#36e2ff',
                              'w-9 h-9',
                              'w-4 h-4'
                            )}
                            <div className="min-w-0">
                              <div className="text-xs font-black truncate">
                                {p.displayName}
                              </div>
                              <div className="text-[10px] opacity-85 truncate">
                                {p.titleBadge || 'PLAYER'}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div className="md:col-span-8 rc-dock-rail p-3 flex flex-col justify-between min-h-[340px]">
                    <div className="pb-2 mb-2 border-b-2 border-white/10 flex items-center justify-between">
                      <div className="text-xs font-black uppercase text-white">
                        {selectedRival
                          ? `CHAT WITH ${selectedRival.displayName}`
                          : 'SELECT A PLAYER TO MESSAGE'}
                      </div>
                      <span className="text-[10px] font-bold text-cyan-300">
                        REAL-TIME PROFILE MESSAGING
                      </span>
                    </div>

                    <div className="rc-dock-well p-3 flex-1 min-h-[210px] max-h-[260px] overflow-y-auto custom-scrollbar space-y-2">
                      {!selectedRival ? (
                        <div className="text-xs text-slate-400 text-center py-10 font-bold">
                          Select a registered player profile on the left to start messaging.
                        </div>
                      ) : activeConversation.length === 0 ? (
                        <div className="text-xs text-slate-400 text-center py-10 font-bold">
                          No messages with {selectedRival.displayName} yet. Send the first message below!
                        </div>
                      ) : (
                        activeConversation.map((m) => {
                          const isMine = m.fromUid === currentUid;
                          return (
                            <div
                              key={m.id}
                              className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                            >
                              <div
                                className={`max-w-[80%] px-3 py-2 rounded-xl border-2 text-xs font-bold ${
                                  isMine
                                    ? 'bg-[#36e2ff]/20 border-[#36e2ff] text-white'
                                    : 'bg-[#151c36] border-white/20 text-slate-100'
                                }`}
                              >
                                <div className="text-[9px] font-black uppercase opacity-75 mb-0.5">
                                  {m.fromName}
                                </div>
                                <div>{m.text}</div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-2.5 flex items-center gap-2">
                      <input
                        type="text"
                        disabled={!selectedRival}
                        placeholder={
                          selectedRival
                            ? `Message ${selectedRival.displayName}...`
                            : 'Waiting for recipient...'
                        }
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSendMessage();
                        }}
                        className="flex-1 px-3 py-2 rounded-lg bg-[#070a14] border-2 border-[#36e2ff]/50 text-xs font-bold text-white disabled:opacity-50"
                      />
                      <button
                        type="button"
                        disabled={!selectedRival || !messageInput.trim()}
                        onClick={handleSendMessage}
                        className="rc-bevel-btn rc-tile-cyan px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
                      >
                        <Send className="w-3.5 h-3.5" /> SEND
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
