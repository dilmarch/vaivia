import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import {
  SettingsNavigationPresentation,
  type VaiviaSettingsSection,
} from "@/components/account/SettingsNavigationPresentation";
import { Button } from "@/components/ui/button";
import {
  isVaiviaThemeMode,
  setVaiviaThemeMode,
} from "@/components/PinkModeProvider";
import type { MobileDataExportRecord, MobileSettingsResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "../lib/apiClient";
import { useMobileAuth } from "../auth/AuthProvider";
import { useLatestMobileRequest } from "../lib/useLatestMobileRequest";
import { ScreenMessage } from "../components/ScreenMessage";

const LEGAL_URL = "https://vaivia.app/terms";

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value)) : "";
}

export function SettingsScreen({
  apiClient,
  section = "general",
  onSection,
  onProfile,
  onAccountClosed,
}: {
  apiClient: MobileApiClient;
  section?: string;
  onSection: (section: VaiviaSettingsSection) => void;
  onProfile: () => void;
  onAccountClosed: () => Promise<void>;
}) {
  const auth = useMobileAuth();
  const activeSection = (
    ["general", "profile", "time-date", "language", "security", "communications", "data", "categories", "family", "financial"].includes(section)
      ? section
      : "general"
  ) as VaiviaSettingsSection;
  const [settings, setSettings] = useState<MobileSettingsResponse | null>(null);
  const [exports, setExports] = useState<MobileDataExportRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [deletionConfirmation, setDeletionConfirmation] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const { beginRequest } = useLatestMobileRequest();

  const load = useCallback(async () => {
    const signal = beginRequest();
    setIsLoading(true);
    setError("");
    try {
      const [loadedSettings, loadedExports] = await Promise.all([
        apiClient.getSettings(signal),
        apiClient.getDataExports(signal),
      ]);
      if (!signal.aborted) {
        setSettings(loadedSettings);
        setExports(loadedExports.exports);
        if (isVaiviaThemeMode(loadedSettings.preferences.themeMode)) {
          setVaiviaThemeMode(loadedSettings.preferences.themeMode, {
            userId: auth.session?.user.id,
            source: "sync",
          });
        }
      }
    } catch (caught) {
      if (!signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load settings.");
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [apiClient, auth.session?.user.id, beginRequest]);
  useEffect(() => { void load(); }, [load]);

  async function patch(input: Record<string, unknown>) {
    if (isSaving) return;
    setIsSaving(true);
    setError("");
    setStatus("");
    try {
      const updated = await apiClient.updateSettings(input, {
        idempotencyKey: crypto.randomUUID(),
      });
      setSettings(updated);
      if (isVaiviaThemeMode(updated.preferences.themeMode)) {
        setVaiviaThemeMode(updated.preferences.themeMode, {
          userId: auth.session?.user.id,
        });
      }
      setStatus("Settings saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save settings.");
    } finally {
      setIsSaving(false);
    }
  }

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await patch(Object.fromEntries(form.entries()));
  }

  async function requestExport() {
    setIsSaving(true);
    setError("");
    try {
      await apiClient.requestDataExport({ idempotencyKey: crypto.randomUUID(), timeoutMs: 120_000 });
      setStatus("Your VAIVIA data export is ready or being prepared.");
      const result = await apiClient.getDataExports();
      setExports(result.exports);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not request an export.");
    } finally {
      setIsSaving(false);
    }
  }

  async function downloadExport(exportId: string) {
    setError("");
    try {
      const result = await apiClient.getDataExportDownload(exportId, { idempotencyKey: crypto.randomUUID() });
      window.open(result.url, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open this export.");
    }
  }

  async function deleteAccount() {
    if (isSaving || deletionConfirmation !== "DELETE MY ACCOUNT") return;
    setIsSaving(true);
    setError("");
    try {
      await apiClient.requestAccountDeletion(deletionConfirmation, { idempotencyKey: crypto.randomUUID() });
      await onAccountClosed();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not request account deletion.");
      setIsSaving(false);
    }
  }

  if (isLoading && !settings) return <main className="mx-auto max-w-7xl px-4 py-8 text-white" aria-busy="true">Loading settings…</main>;
  if (!settings) return <main className="mx-auto max-w-7xl px-4 py-8"><ScreenMessage title="Settings unavailable" message={error || "VAIVIA could not load settings."} actionLabel="Try again" onAction={() => void load()} /></main>;
  const preferences = settings.preferences;

  return (
    <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 text-white lg:grid-cols-[220px_1fr]">
      <SettingsNavigationPresentation
        activeSection={activeSection}
        renderItem={({ id, label, className }) => <button key={id} type="button" onClick={() => id === "profile" ? onProfile() : onSection(id)} className={className}>{label}</button>}
      />
      <section className="rounded-[2rem] border border-white/10 bg-[#03030a]/90 p-6 shadow-2xl shadow-black/30">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-lime-200/80">{activeSection.replaceAll("-", " ")}</p>
        <h1 className="mt-2 text-3xl font-black">{activeSection === "data" ? "Data and privacy" : activeSection === "time-date" ? "Time and date preferences" : activeSection === "communications" ? "Communications" : activeSection === "security" ? "Password & Security" : activeSection === "financial" ? "Financial settings" : `${activeSection.charAt(0).toUpperCase()}${activeSection.slice(1)} settings`}</h1>
        {status ? <p className="mt-5 rounded-2xl border border-lime-300/25 bg-lime-300/10 p-4 text-sm font-bold text-lime-100" role="status">{status}</p> : null}
        {error ? <p className="mt-5 rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-bold text-red-100" role="alert">{error}</p> : null}

        {activeSection === "general" ? (
          <form onSubmit={savePreferences} className="mt-6 grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
            <label className="text-sm font-black">Theme
              <select name="themeMode" defaultValue={preferences.themeMode} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-white">
                {['dark','pink','greyscale','brat','pride','light'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-sm font-black">Countdown display
              <select name="countdownDisplayMode" defaultValue={preferences.countdownDisplayMode} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-white">
                {['days','weeks','hours','minutes','seconds','mixed'].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <Button type="submit" disabled={isSaving} className="h-12 rounded-full bg-lime-300 font-black text-slate-950">Save general settings</Button>
          </form>
        ) : activeSection === "time-date" ? (
          <form onSubmit={savePreferences} className="mt-6 grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
            <label className="text-sm font-black">Clock format<select name="clockFormat" defaultValue={preferences.clockFormat} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3"><option value="12h">12 hour</option><option value="24h">24 hour</option></select></label>
            <label className="text-sm font-black">Default time zone<input name="defaultTimeZone" defaultValue={preferences.defaultTimeZone || ""} placeholder="Device timezone" className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3" /></label>
            <label className="text-sm font-black">Itinerary default view<select name="itineraryDefaultView" defaultValue={preferences.itineraryDefaultView} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3">{['list','day','week','month'].map((value) => <option key={value}>{value}</option>)}</select></label>
            <Button type="submit" disabled={isSaving} className="h-12 rounded-full bg-lime-300 font-black text-slate-950">Save time/date preferences</Button>
          </form>
        ) : activeSection === "security" ? (
          <form onSubmit={(event) => { event.preventDefault(); if (newPassword.length < 6) return setError("Password must be at least 6 characters."); if (newPassword !== repeatPassword) return setError("Passwords do not match."); void (async () => { setIsSaving(true); try { await auth.updateRecoveredPassword(newPassword); setNewPassword(""); setRepeatPassword(""); setStatus("Password updated."); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update password."); } finally { setIsSaving(false); } })(); }} className="mt-6 grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" autoComplete="new-password" className="h-12 rounded-xl border border-white/10 bg-slate-950 px-3" />
            <input type="password" value={repeatPassword} onChange={(e) => setRepeatPassword(e.target.value)} placeholder="Repeat password" autoComplete="new-password" className="h-12 rounded-xl border border-white/10 bg-slate-950 px-3" />
            <Button type="submit" disabled={isSaving || !settings.capabilities.passwordChange} className="h-12 rounded-full bg-lime-300 font-black text-slate-950">Update password</Button>
          </form>
        ) : activeSection === "communications" ? (
          <div className="mt-6 space-y-4 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
            <label className="flex min-h-12 items-center justify-between gap-4 text-sm font-black"><span>Marketing emails</span><input type="checkbox" checked={preferences.marketingEmailsConsent} onChange={(e) => void patch({ marketingEmailsConsent: e.target.checked })} className="h-6 w-6 accent-lime-300" /></label>
            <p className="text-sm font-semibold text-slate-400">Notification channels are displayed below. Native push and notification preference mutations remain unavailable in this phase.</p>
            {settings.notificationPreferences.map((item) => <div key={item.notificationType} className="rounded-xl border border-white/10 bg-slate-950/60 p-3 text-sm"><strong>{item.notificationType.replaceAll('_',' ')}</strong><span className="ml-2 text-slate-400">In-app {item.inAppEnabled ? 'on' : 'off'} · Email {item.emailEnabled ? 'on' : 'off'}</span></div>)}
          </div>
        ) : activeSection === "data" ? (
          <div className="mt-6 space-y-5">
            <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5">
              <h2 className="text-2xl font-black">Your account data</h2><p className="mt-2 text-sm font-semibold text-slate-400">Request the same private ZIP export available on vaivia.app.</p>
              <div className="mt-4 flex gap-3"><Button disabled={isSaving} onClick={() => void requestExport()} className="rounded-full bg-lime-300 font-black text-slate-950"><Download className="h-4 w-4" /> Download my data</Button><Button variant="outline" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button></div>
              <div className="mt-4 space-y-3">{exports.length ? exports.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-950/60 p-3"><span className="text-sm font-bold">{item.status.toUpperCase()} · {formatDate(item.requestedAt)}</span><Button type="button" disabled={item.status !== 'ready'} onClick={() => void downloadExport(item.id)} className="rounded-full bg-lime-300 text-slate-950">Open</Button></div>) : <p className="text-sm text-slate-400">No data exports requested yet.</p>}</div>
            </section>
            <section className="rounded-[1.5rem] border border-red-300/20 bg-red-500/[0.06] p-5"><h2 className="text-2xl font-black">Delete account</h2><p className="mt-2 text-sm font-semibold text-slate-300">This records the existing VAIVIA account deletion request and signs this iPhone out after the server verifies it.</p><label className="mt-4 block text-xs font-black uppercase tracking-wider text-red-100">Type DELETE MY ACCOUNT<input value={deletionConfirmation} onChange={(e) => setDeletionConfirmation(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-red-300/20 bg-slate-950 px-3 text-white" /></label><Button type="button" disabled={isSaving || deletionConfirmation !== 'DELETE MY ACCOUNT'} onClick={() => void deleteAccount()} className="mt-4 rounded-full bg-red-500 font-black text-white"><Trash2 className="h-4 w-4" /> Request account deletion</Button></section>
          </div>
        ) : activeSection === "categories" ? (
          <div className="mt-6 space-y-3">{settings.categories.map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 font-bold">{item.name}</div>)}{!settings.categories.length ? <p className="text-slate-400">No custom categories.</p> : null}<p className="text-xs text-slate-500">Category editing remains on web during this phase.</p></div>
        ) : activeSection === "family" ? (
          <div className="mt-6 space-y-3">{settings.familyMembers.map((item) => <div key={item.id} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 font-bold">{item.name}{item.relationship ? ` · ${item.relationship}` : ''}</div>)}{!settings.familyMembers.length ? <p className="text-slate-400">No family members added.</p> : null}<p className="text-xs text-slate-500">Family member editing remains on web during this phase.</p></div>
        ) : activeSection === "financial" ? (
          <form onSubmit={savePreferences} className="mt-6 grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5"><label className="text-sm font-black">Home currency<input name="homeCurrency" defaultValue={preferences.homeCurrency} maxLength={3} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3 uppercase" /></label><Button type="submit" disabled={isSaving} className="h-12 rounded-full bg-lime-300 font-black text-slate-950">Save financial settings</Button></form>
        ) : activeSection === "language" ? (
          <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-5"><p className="font-black">English</p><p className="mt-2 text-sm text-slate-400">English is the currently supported VAIVIA language.</p></div>
        ) : null}
        <div className="mt-8 flex flex-wrap gap-4 text-sm font-bold text-lime-200"><a href={LEGAL_URL} target="_blank" rel="noopener noreferrer" className="underline">Terms</a><a href={LEGAL_URL} target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a><a href={`${LEGAL_URL}#contact`} target="_blank" rel="noopener noreferrer" className="underline">Support</a></div>
      </section>
    </main>
  );
}
