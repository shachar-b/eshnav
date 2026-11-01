import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PASTEL_PALETTES,
  PASTEL_THEMES,
  TIME_WINDOWS,
  TIME_WINDOW_META,
  type DayOfWeek,
  type PastelTheme,
  type PersonalChore,
  type PoolChore,
  type PoolResetMode,
  type Profile,
  type PublicSettings,
  type RoutineTemplate,
  type TimeWindow,
} from '@eshnav/shared';
import { api } from '../lib/api.js';
import { ISRAELI_DAYS_SHORT } from '../lib/hebrewDate.js';
import { EmojiPicker } from './EmojiPicker.js';

export type AdminTab = 'pool' | 'announcement' | 'tasks' | 'profiles';

interface AdminDrawerProps {
  open: boolean;
  initialTab?: AdminTab;
  initialProfileId?: number;
  settings: PublicSettings;
  onClose: () => void;
  onMutated: () => Promise<void>;
}

const ALL_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5, 6];

export function AdminDrawer({
  open,
  initialTab = 'pool',
  initialProfileId,
  settings,
  onClose,
  onMutated,
}: AdminDrawerProps) {
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [routines, setRoutines] = useState<RoutineTemplate[]>([]);
  const [personalChores, setPersonalChores] = useState<PersonalChore[]>([]);
  const [poolChores, setPoolChores] = useState<PoolChore[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Announcement & Settings form
  const [appTitle, setAppTitle] = useState(settings.appTitle);
  const [announcementEnabled, setAnnouncementEnabled] = useState(settings.announcementEnabled);
  const [announcementEmoji, setAnnouncementEmoji] = useState(settings.announcementEmoji ?? '📣');
  const [announcementText, setAnnouncementText] = useState(settings.announcementText ?? '');
  const [newPin, setNewPin] = useState('');

  // Pool Chore form
  const [editingPoolId, setEditingPoolId] = useState<number | null>(null);
  const [poolTitle, setPoolTitle] = useState('');
  const [poolEmoji, setPoolEmoji] = useState('🍽️');
  const [poolStars, setPoolStars] = useState(2);
  const [poolResetMode, setPoolResetMode] = useState<PoolResetMode>('AUTO_DISABLE');
  const [poolCooldownMin, setPoolCooldownMin] = useState(60);

  // Routine form
  const [selectedChildId, setSelectedChildId] = useState<number>(initialProfileId ?? 0);
  const [editingRoutineId, setEditingRoutineId] = useState<number | null>(null);
  const [routineTitle, setRoutineTitle] = useState('');
  const [routineEmoji, setRoutineEmoji] = useState('🪥');
  const [routineWindow, setRoutineWindow] = useState<TimeWindow>('MORNING');
  const [routineDays, setRoutineDays] = useState<DayOfWeek[]>([...ALL_DAYS]);

  // Personal Chore form
  const [choreTitle, setChoreTitle] = useState('');
  const [choreEmoji, setChoreEmoji] = useState('🧸');
  const [choreStars, setChoreStars] = useState(2);

  // Profile form & Star Adjustment
  const [editingProfileId, setEditingProfileId] = useState<number | null>(null);
  const [profileName, setProfileName] = useState('');
  const [profileEmoji, setProfileEmoji] = useState('🦄');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [profileTheme, setProfileTheme] = useState<PastelTheme>('SKY');
  const [profileSortOrder, setProfileSortOrder] = useState(0);
  const [adjustDelta, setAdjustDelta] = useState(1);
  const [adjustReason, setAdjustReason] = useState('');

  const loadAdminData = useCallback(async () => {
    try {
      const [p, r, pc, pool] = await Promise.all([
        api.listProfiles(),
        api.listRoutines(),
        api.listPersonalChores(),
        api.listPoolChores(),
      ]);
      setProfiles(p);
      setRoutines(r);
      setPersonalChores(pc);
      setPoolChores(pool);
      setSelectedChildId((prev) => (p.some((x) => x.id === prev) ? prev : (p[0]?.id ?? 0)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת נתוני ניהול');
    }
  }, []);

  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;

    setTab(initialTab);
    if (initialProfileId) setSelectedChildId(initialProfileId);
    setAppTitle(settings.appTitle);
    setAnnouncementEnabled(settings.announcementEnabled);
    setAnnouncementEmoji(settings.announcementEmoji ?? '📣');
    setAnnouncementText(settings.announcementText ?? '');
    setError(null);
    setNotice(null);
    void loadAdminData();
  }, [open, initialTab, initialProfileId, settings, loadAdminData]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setError(null);
  };

  const runMutation = async (fn: () => Promise<void>, successMessage?: string) => {
    setError(null);
    try {
      await fn();
      await Promise.all([loadAdminData(), onMutated()]);
      if (successMessage) flashNotice(successMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הפעולה נכשלה');
    }
  };

  // ─── Pool Actions ──────────────────────────────────────────────────────────

  const handleTogglePoolActive = (chore: PoolChore) =>
    runMutation(async () => {
      await api.togglePoolChoreActive(chore.id, !chore.isActive);
    });

  const handleResetPoolCooldown = (choreId: number) =>
    runMutation(async () => {
      await api.resetPoolChoreCooldown(choreId);
    }, 'ההשהיה אופסה');

  const handleSavePoolChore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poolTitle.trim()) return;
    void runMutation(async () => {
      if (editingPoolId !== null) {
        await api.updatePoolChore(editingPoolId, {
          title: poolTitle.trim(),
          iconEmoji: poolEmoji,
          stars: poolStars,
          resetMode: poolResetMode,
          cooldownMinutes: poolCooldownMin,
        });
      } else {
        await api.createPoolChore({
          title: poolTitle.trim(),
          iconEmoji: poolEmoji,
          stars: poolStars,
          resetMode: poolResetMode,
          cooldownMinutes: poolCooldownMin,
          sortOrder: poolChores.length,
          isActive: true,
        });
      }
      setEditingPoolId(null);
      setPoolTitle('');
    }, 'משימת הקופה נשמרה');
  };

  // ─── Announcement & Settings Actions ───────────────────────────────────────

  const handleToggleBannerInstant = (nextEnabled: boolean) => {
    setAnnouncementEnabled(nextEnabled);
    void runMutation(async () => {
      await api.updateSettings({
        announcementEnabled: nextEnabled,
        announcementText: announcementText.trim() || null,
        announcementEmoji: announcementEmoji.trim() || '📣',
      });
    }, nextEnabled ? 'ההודעה המשפחתית הופעלה' : 'ההודעה המשפחתית הוסתרה');
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    void runMutation(async () => {
      await api.updateSettings({
        appTitle: appTitle.trim() || 'הבית שלנו',
        announcementEnabled,
        announcementText: announcementText.trim() || null,
        announcementEmoji: announcementEmoji.trim() || '📣',
        ...(newPin ? { newParentPin: newPin } : {}),
      });
      setNewPin('');
    }, 'ההגדרות נשמרו');
  };

  // ─── Routines & Personal Chores Actions ────────────────────────────────────

  const toggleDayInRoutine = (day: DayOfWeek) => {
    setRoutineDays((prev) =>
      prev.includes(day)
        ? prev.length > 1
          ? prev.filter((d) => d !== day)
          : prev
        : [...prev, day].sort((a, b) => a - b),
    );
  };

  const handleSaveRoutine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChildId || !routineTitle.trim()) return;
    void runMutation(async () => {
      if (editingRoutineId !== null) {
        await api.updateRoutine(editingRoutineId, {
          profileId: selectedChildId,
          title: routineTitle.trim(),
          iconEmoji: routineEmoji,
          timeWindow: routineWindow,
          daysOfWeek: routineDays,
        });
      } else {
        await api.createRoutine({
          profileId: selectedChildId,
          title: routineTitle.trim(),
          iconEmoji: routineEmoji,
          timeWindow: routineWindow,
          daysOfWeek: routineDays,
          sortOrder: routines.length,
          isActive: true,
        });
      }
      setEditingRoutineId(null);
      setRoutineTitle('');
    }, 'השגרה נשמרה');
  };

  const handleCreatePersonalChore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChildId || !choreTitle.trim()) return;
    void runMutation(async () => {
      await api.createPersonalChore({
        profileId: selectedChildId,
        title: choreTitle.trim(),
        iconEmoji: choreEmoji,
        stars: choreStars,
      });
      setChoreTitle('');
    }, 'המשימה האישית נוספה');
  };

  // ─── Profile Actions ───────────────────────────────────────────────────────

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) return;
    void runMutation(async () => {
      const imageUrl = profileImageUrl.trim() ? profileImageUrl.trim() : null;
      if (editingProfileId !== null) {
        await api.updateProfile(editingProfileId, {
          name: profileName.trim(),
          avatarEmoji: profileEmoji,
          avatarImageUrl: imageUrl,
          pastelTheme: profileTheme,
          sortOrder: profileSortOrder,
        });
      } else {
        await api.createProfile({
          name: profileName.trim(),
          avatarEmoji: profileEmoji,
          avatarImageUrl: imageUrl,
          pastelTheme: profileTheme,
          sortOrder: profiles.length,
          isActive: true,
        });
      }
      setEditingProfileId(null);
      setProfileName('');
      setProfileImageUrl('');
    }, 'פרופיל הילד נשמר');
  };

  const handleAdjustStars = (profileId: number, sign: 1 | -1) => {
    const delta = Math.max(1, Math.abs(adjustDelta)) * sign;
    void runMutation(async () => {
      await api.adjustProfileStars(profileId, {
        starsDelta: delta,
        description: adjustReason.trim() || undefined,
      });
      setAdjustReason('');
    }, 'מאזן הכוכבים עודכן');
  };

  const nowMs = Date.now();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-drawer-title"
      data-testid="admin-drawer"
      onClick={onClose}
      className="modal-backdrop fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="modal-panel flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 bg-amber-50/70 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl" aria-hidden="true">
              🔓
            </span>
            <h2 id="admin-drawer-title" className="text-xl font-bold text-slate-900">
              ניהול הבית
            </h2>
          </div>

          <button
            type="button"
            data-testid="admin-close-btn"
            onClick={onClose}
            className="pressable rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-700 ring-1 ring-slate-300 cursor-pointer hover:bg-slate-100"
          >
            סגירה ✕
          </button>
        </header>

        {/* Tabs */}
        <nav className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3">
          {(
            [
              { id: 'pool', label: '✨ קופת המשימות' },
              { id: 'announcement', label: '📣 הודעה והגדרות' },
              { id: 'tasks', label: '🪥 שגרות ומשימות' },
              { id: 'profiles', label: '👨‍👩‍👧‍👦 ילדים וכוכבים' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`admin-tab-${item.id}`}
              onClick={() => setTab(item.id)}
              className={[
                'pressable rounded-2xl px-4 py-2 text-sm font-bold cursor-pointer',
                tab === item.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5">
          {error && (
            <div role="alert" className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-4 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-900">
              {notice}
            </div>
          )}

          {/* TAB 1: קופת המשימות Switchboard */}
          {tab === 'pool' && (
            <div className="flex flex-col gap-6">
              <div>
                <h3 className="mb-3 text-base font-bold text-slate-900">
                  מתגי הפעלה מהירים — קופת המשימות
                </h3>
                <div className="flex flex-col gap-2.5">
                  {poolChores.map((chore) => {
                    const isCoolingDown = chore.cooldownEndsAt !== null && chore.cooldownEndsAt > nowMs;
                    return (
                      <div
                        key={chore.id}
                        data-testid={`admin-pool-row-${chore.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-2xl">{chore.iconEmoji}</span>
                          <div className="text-start">
                            <p className="text-base font-bold text-slate-900 leading-relaxed">
                              {chore.title}{' '}
                              <span className="text-sm font-bold text-amber-700">⭐ +{chore.stars}</span>
                            </p>
                            <p className="text-xs text-slate-500">
                              {chore.resetMode === 'AUTO_DISABLE'
                                ? 'הפעלה ידנית (נכבה אוטומטית אחרי ביצוע)'
                                : `מחזורי עם השהיה (${chore.cooldownMinutes} דק׳)`}
                              {isCoolingDown ? ' · בהשהיה כרגע' : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {isCoolingDown && (
                            <button
                              type="button"
                              data-testid={`admin-pool-reset-cooldown-${chore.id}`}
                              onClick={() => void handleResetPoolCooldown(chore.id)}
                              className="pressable rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-amber-900 ring-1 ring-amber-400 cursor-pointer hover:bg-amber-100"
                            >
                              אפס השהיה
                            </button>
                          )}

                          <button
                            type="button"
                            role="switch"
                            aria-checked={chore.isActive}
                            data-testid={`admin-pool-switch-${chore.id}`}
                            onClick={() => void handleTogglePoolActive(chore)}
                            className={[
                              'pressable rounded-full px-4 py-1.5 text-xs font-bold cursor-pointer',
                              chore.isActive
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-200 text-slate-700',
                            ].join(' ')}
                          >
                            {chore.isActive ? 'פעיל' : 'כבוי'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setEditingPoolId(chore.id);
                              setPoolTitle(chore.title);
                              setPoolEmoji(chore.iconEmoji);
                              setPoolStars(chore.stars);
                              setPoolResetMode(chore.resetMode);
                              setPoolCooldownMin(chore.cooldownMinutes);
                            }}
                            className="pressable rounded-xl bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 cursor-pointer"
                          >
                            עריכה
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void runMutation(async () => {
                                await api.deletePoolChore(chore.id);
                              }, 'המשימה נמחקה')
                            }
                            className="pressable rounded-xl bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 cursor-pointer"
                          >
                            מחיקה
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleSavePoolChore} className="rounded-2xl border border-slate-200 p-4">
                <h4 className="mb-3 text-sm font-bold text-slate-900">
                  {editingPoolId !== null ? 'עריכת משימה בקופה' : 'הוספת משימה חדשה לקופת המשימות'}
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                    שם המשימה
                    <input
                      type="text"
                      required
                      value={poolTitle}
                      onChange={(e) => setPoolTitle(e.target.value)}
                      placeholder="למשל: פינוי מדיח"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                    כוכבים
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={poolStars}
                      onChange={(e) => setPoolStars(Number(e.target.value))}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                    />
                  </label>

                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                    מצב איפוס אחרי ביצוע
                    <select
                      value={poolResetMode}
                      onChange={(e) => setPoolResetMode(e.target.value as PoolResetMode)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                    >
                      <option value="AUTO_DISABLE">הפעלה ידנית (נכבה אחרי ביצוע)</option>
                      <option value="COOLDOWN">מחזורי עם השהיה</option>
                    </select>
                  </label>

                  {poolResetMode === 'COOLDOWN' && (
                    <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                      זמן השהיה (בדקות)
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={10080}
                        value={poolCooldownMin}
                        onChange={(e) => setPoolCooldownMin(Number(e.target.value))}
                        className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                      />
                    </label>
                  )}
                </div>

                <div className="mt-3">
                  <p className="mb-1 text-start text-xs font-medium text-slate-700">סמל ({poolEmoji})</p>
                  <EmojiPicker value={poolEmoji} onChange={setPoolEmoji} defaultCategory="kitchen" />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="submit"
                    className="pressable rounded-2xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-amber-950 cursor-pointer hover:bg-amber-400"
                  >
                    {editingPoolId !== null ? 'שמירת שינויים' : '+ הוספה לקופה'}
                  </button>
                  {editingPoolId !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPoolId(null);
                        setPoolTitle('');
                      }}
                      className="pressable rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 cursor-pointer"
                    >
                      ביטול עריכה
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: Family Announcement & General Settings */}
          {tab === 'announcement' && (
            <form onSubmit={handleSaveSettings} className="flex flex-col gap-5">
              <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-start">
                    <h3 className="text-base font-bold text-slate-900">הצג הודעה משפחתית בראש הלוח</h3>
                    <p className="text-xs text-slate-600">כאשר כבוי, הבאנר מוסתר לחלוטין ותופס 0 פיקסלים</p>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={announcementEnabled}
                    data-testid="admin-banner-switch"
                    onClick={() => handleToggleBannerInstant(!announcementEnabled)}
                    className={[
                      'pressable rounded-full px-5 py-2 text-sm font-bold cursor-pointer',
                      announcementEnabled
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700',
                    ].join(' ')}
                  >
                    {announcementEnabled ? 'פעיל' : 'כבוי'}
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                    אימוג׳י
                    <input
                      type="text"
                      value={announcementEmoji}
                      onChange={(e) => setAnnouncementEmoji(e.target.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-center text-xl"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700 sm:col-span-3">
                    תוכן ההודעה המשפחתית
                    <input
                      type="text"
                      data-testid="admin-banner-text"
                      value={announcementText}
                      onChange={(e) => setAnnouncementText(e.target.value)}
                      placeholder="למשל: היום בשעה 17:00 נוסעים לסבתא!"
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900"
                    />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                  כותרת הלוח המשפחתי
                  <input
                    type="text"
                    value={appTitle}
                    onChange={(e) => setAppTitle(e.target.value)}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                  />
                </label>

                <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                  החלפת קוד הורים (4 ספרות — השאירו ריק ללא שינוי)
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    pattern="\d{4}"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    placeholder="••••"
                    className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                  />
                </label>
              </div>

              <div>
                <button
                  type="submit"
                  data-testid="admin-save-settings-btn"
                  className="pressable rounded-2xl bg-slate-900 px-6 py-2.5 text-sm font-bold text-white cursor-pointer hover:bg-slate-800"
                >
                  שמירת הודעה והגדרות
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: Routines & Personal Chores */}
          {tab === 'tasks' && (
            <div className="flex flex-col gap-6">
              {/* Child Selector */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-slate-700">בחירת ילד/ה:</span>
                {profiles.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => setSelectedChildId(child.id)}
                    className={[
                      'pressable inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold cursor-pointer',
                      selectedChildId === child.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200',
                    ].join(' ')}
                  >
                    <span>{child.avatarEmoji}</span>
                    <span>{child.name}</span>
                  </button>
                ))}
              </div>

              {/* Add / Edit Routine */}
              <form onSubmit={handleSaveRoutine} className="rounded-2xl border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-bold text-slate-900">
                  {editingRoutineId !== null ? 'עריכת שגרה יומית' : 'הוספת שגרה יומית (0 כוכבים)'}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                    שם השגרה (תומך בניקוד)
                    <input
                      type="text"
                      required
                      value={routineTitle}
                      onChange={(e) => setRoutineTitle(e.target.value)}
                      placeholder="לְצַחְצֵחַ שִׁנַּיִם"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900 leading-relaxed"
                    />
                  </label>

                  <div className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                    <span>חלון זמן</span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {TIME_WINDOWS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setRoutineWindow(w)}
                          className={[
                            'pressable rounded-xl py-2 text-xs font-bold cursor-pointer',
                            routineWindow === w
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-100 text-slate-700',
                          ].join(' ')}
                        >
                          {TIME_WINDOW_META[w].emoji} {TIME_WINDOW_META[w].labelHe}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-1.5 text-start text-xs font-medium text-slate-700">ימים בשבוע</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ISRAELI_DAYS_SHORT.map(({ day, label }) => {
                      const active = routineDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDayInRoutine(day)}
                          className={[
                            'pressable flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold cursor-pointer',
                            active
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 text-slate-600',
                          ].join(' ')}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-1 text-start text-xs font-medium text-slate-700">סמל ({routineEmoji})</p>
                  <EmojiPicker value={routineEmoji} onChange={setRoutineEmoji} defaultCategory="hygiene" />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="submit"
                    className="pressable rounded-2xl bg-slate-900 px-5 py-2 text-sm font-bold text-white cursor-pointer"
                  >
                    {editingRoutineId !== null ? 'שמירת שגרה' : '+ הוספת שגרה'}
                  </button>
                  {editingRoutineId !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingRoutineId(null);
                        setRoutineTitle('');
                      }}
                      className="pressable rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 cursor-pointer"
                    >
                      ביטול
                    </button>
                  )}
                </div>

                {/* Existing Routines for Selected Child */}
                <div className="mt-4 flex flex-col gap-2">
                  {routines
                    .filter((r) => r.profileId === selectedChildId)
                    .map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-start">
                          <span className="text-xl">{r.iconEmoji}</span>
                          <span className="text-sm font-medium text-slate-900 leading-relaxed">
                            {r.title}
                          </span>
                          <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">
                            {TIME_WINDOW_META[r.timeWindow].emoji} {TIME_WINDOW_META[r.timeWindow].labelHe}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRoutineId(r.id);
                              setRoutineTitle(r.title);
                              setRoutineEmoji(r.iconEmoji);
                              setRoutineWindow(r.timeWindow);
                              setRoutineDays(r.daysOfWeek);
                            }}
                            className="pressable rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200 cursor-pointer"
                          >
                            עריכה
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runMutation(async () => {
                                await api.deleteRoutine(r.id);
                              }, 'השגרה נמחקה')
                            }
                            className="pressable rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 cursor-pointer"
                          >
                            מחיקה
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </form>

              {/* Personal One-Off Chores */}
              <form onSubmit={handleCreatePersonalChore} className="rounded-2xl border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-bold text-slate-900">
                  משימות אישיות חד-פעמיות (נשארות על הלוח עד להשלמה)
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700 sm:col-span-2">
                    שם המשימה האישית
                    <input
                      type="text"
                      required
                      value={choreTitle}
                      onChange={(e) => setChoreTitle(e.target.value)}
                      placeholder="לְסַדֵּר אֶת הַחֶדֶר"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900 leading-relaxed"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                    כוכבים (0 ומעלה)
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={100}
                      value={choreStars}
                      onChange={(e) => setChoreStars(Number(e.target.value))}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                    />
                  </label>
                </div>

                <div className="mt-3">
                  <EmojiPicker value={choreEmoji} onChange={setChoreEmoji} defaultCategory="room" />
                </div>

                <button
                  type="submit"
                  className="pressable mt-3 rounded-2xl bg-slate-900 px-5 py-2 text-sm font-bold text-white cursor-pointer"
                >
                  + הוספת משימה אישית
                </button>

                <div className="mt-4 flex flex-col gap-2">
                  {personalChores
                    .filter((c) => c.profileId === selectedChildId)
                    .map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2"
                      >
                        <div className="flex items-center gap-2 text-start">
                          <span className="text-xl">{c.iconEmoji}</span>
                          <span className="text-sm font-medium text-slate-900 leading-relaxed">{c.title}</span>
                          {c.stars > 0 && (
                            <span className="text-xs font-bold text-amber-700">⭐ {c.stars}</span>
                          )}
                          <span className="text-xs text-slate-500">
                            ({c.status === 'COMPLETED' ? 'הושלמה' : 'ממתינה'})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void runMutation(async () => {
                              await api.deletePersonalChore(c.id);
                            }, 'המשימה האישית נמחקה')
                          }
                          className="pressable rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 cursor-pointer"
                        >
                          מחיקה
                        </button>
                      </div>
                    ))}
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: Child Profiles & Manual Star Adjustments */}
          {tab === 'profiles' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3">
                  <span className="text-xs font-bold text-slate-700">עדכון כוכבים ידני:</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1000}
                    value={adjustDelta}
                    onChange={(e) => setAdjustDelta(Math.max(1, Number(e.target.value)))}
                    className="w-20 rounded-xl border border-slate-300 bg-white px-2.5 py-1 text-center text-sm font-bold tabular-nums"
                  />
                  <input
                    type="text"
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    placeholder="סיבה (אופציונלי, למשל: מתנה / פרס)"
                    className="min-w-48 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1 text-sm"
                  />
                </div>

                {profiles.map((child) => {
                  const palette = PASTEL_PALETTES[child.pastelTheme];
                  return (
                    <div
                      key={child.id}
                      style={{ backgroundColor: palette.columnBg, borderColor: palette.borderAccent }}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{child.avatarEmoji}</span>
                        <div className="text-start">
                          <p className="text-base font-bold text-slate-900 leading-relaxed">{child.name}</p>
                          <p className="text-xs text-slate-600">ערכת צבע: {palette.labelHe}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleAdjustStars(child.id, 1)}
                          className="pressable rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer tabular-nums"
                        >
                          +{adjustDelta} ⭐
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustStars(child.id, -1)}
                          className="pressable rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer tabular-nums"
                        >
                          -{adjustDelta} ⭐
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProfileId(child.id);
                            setProfileName(child.name);
                            setProfileEmoji(child.avatarEmoji);
                            setProfileImageUrl(child.avatarImageUrl ?? '');
                            setProfileTheme(child.pastelTheme);
                            setProfileSortOrder(child.sortOrder);
                          }}
                          className="pressable rounded-xl bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 cursor-pointer"
                        >
                          עריכה
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void runMutation(async () => {
                              await api.deleteProfile(child.id);
                            }, 'הפרופיל נמחק')
                          }
                          className="pressable rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 cursor-pointer"
                        >
                          מחיקה
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form onSubmit={handleSaveProfile} className="rounded-2xl border border-slate-200 p-4">
                <h3 className="mb-3 text-sm font-bold text-slate-900">
                  {editingProfileId !== null ? 'עריכת פרופיל ילד/ה' : 'הוספת פרופיל ילד/ה'}
                </h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                    שם הילד/ה
                    <input
                      type="text"
                      required
                      value={profileName}
                      onChange={(e) => setProfileName(e.target.value)}
                      placeholder="נוֹעָה"
                      className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                    קישור לתמונה (אופציונלי)
                    <input
                      type="url"
                      value={profileImageUrl}
                      onChange={(e) => setProfileImageUrl(e.target.value)}
                      placeholder="https://..."
                      className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-start text-xs font-medium text-slate-700">
                    סדר תצוגה
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={profileSortOrder}
                      onChange={(e) => setProfileSortOrder(Number(e.target.value))}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-slate-900 tabular-nums"
                    />
                  </label>
                </div>

                {/* 10 Pastel Swatches */}
                <div className="mt-3">
                  <p className="mb-1.5 text-start text-xs font-medium text-slate-700">ערכת פסטל</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {PASTEL_THEMES.map((themeKey) => {
                      const swatch = PASTEL_PALETTES[themeKey];
                      const selected = profileTheme === themeKey;
                      return (
                        <button
                          key={themeKey}
                          type="button"
                          onClick={() => setProfileTheme(themeKey)}
                          style={{
                            backgroundColor: swatch.cardBg,
                            borderColor: selected ? swatch.avatarRing : swatch.borderAccent,
                            color: swatch.textPrimary,
                          }}
                          className={[
                            'pressable rounded-xl border-2 px-3 py-2 text-xs font-bold cursor-pointer',
                            selected ? 'ring-2 ring-slate-900/30' : '',
                          ].join(' ')}
                        >
                          {swatch.labelHe}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="mb-1 text-start text-xs font-medium text-slate-700">דמות ({profileEmoji})</p>
                  <EmojiPicker value={profileEmoji} onChange={setProfileEmoji} defaultCategory="avatars" />
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="submit"
                    className="pressable rounded-2xl bg-slate-900 px-5 py-2 text-sm font-bold text-white cursor-pointer"
                  >
                    {editingProfileId !== null ? 'שמירת פרופיל' : '+ הוספת ילד/ה'}
                  </button>
                  {editingProfileId !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProfileId(null);
                        setProfileName('');
                        setProfileImageUrl('');
                      }}
                      className="pressable rounded-2xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 cursor-pointer"
                    >
                      ביטול
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
