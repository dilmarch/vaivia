import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LogOut, Pencil, Settings } from "lucide-react";
import { ProfileHeaderPresentation } from "@/components/account/ProfileHeaderPresentation";
import { Button } from "@/components/ui/button";
import type { MobileAccountProfile } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "../lib/apiClient";
import { useLatestMobileRequest } from "../lib/useLatestMobileRequest";
import { ScreenMessage } from "../components/ScreenMessage";

function joinedLabel(value: string | null) {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(value));
}

export function ProfileScreen({
  apiClient,
  onSettings,
  onSignOut,
}: {
  apiClient: MobileApiClient;
  onSettings: () => void;
  onSignOut: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<MobileAccountProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { beginRequest } = useLatestMobileRequest();

  const load = useCallback(async () => {
    const signal = beginRequest();
    setIsLoading(true);
    setError("");
    try {
      const result = await apiClient.getAccount(signal);
      if (!signal.aborted) setProfile(result.profile);
    } catch (caught) {
      if (!signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load profile.");
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [apiClient, beginRequest]);

  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || isSaving) return;
    const form = new FormData(event.currentTarget);
    setIsSaving(true);
    setError("");
    setStatus("");
    try {
      const result = await apiClient.updateAccount(
        {
          firstName: String(form.get("firstName") || ""),
          lastName: String(form.get("lastName") || ""),
          username: String(form.get("username") || ""),
          email: String(form.get("email") || ""),
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      setProfile(result.profile);
      setIsEditing(false);
      setStatus("Profile details saved.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save profile.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !profile) {
    return <main className="mx-auto max-w-4xl px-4 py-8 text-white" aria-busy="true">Loading profile…</main>;
  }
  if (!profile) {
    return <main className="mx-auto max-w-4xl px-4 py-8"><ScreenMessage title="Profile unavailable" message={error || "VAIVIA could not load your profile."} actionLabel="Try again" onAction={() => void load()} /></main>;
  }

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(" ") || profile.username || "Traveller";
  return (
    <main className="mx-auto max-w-4xl px-4 py-6 text-white">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#050712] shadow-2xl shadow-black/30">
        <ProfileHeaderPresentation
          displayName={displayName}
          subtitle={profile.username ? `@${profile.username} · ${profile.email || ""}` : profile.email || "VAIVIA account"}
          avatarUrl={profile.avatarUrl}
          roleLabel={profile.role.replaceAll("_", " ")}
          levelLabel={`Level ${profile.level}: ${profile.levelName}`}
          themeLabel="VAIVIA"
          themeBadgeClass="border-violet-300/30 bg-violet-300/[0.12] text-violet-100"
          joinedLabel={joinedLabel(profile.joinedAt)}
          pointsLabel={`${profile.points.toLocaleString()} pt${profile.points === 1 ? "" : "s"}`}
          editAction={<button type="button" onClick={() => setIsEditing((value) => !value)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-lime-300 px-5 py-2.5 text-sm font-black text-slate-950"><Pencil className="h-4 w-4" aria-hidden="true" /> Edit profile</button>}
          signOutAction={<Button type="button" variant="outline" onClick={() => void onSignOut()} className="border-white/10 bg-white/[0.08] text-slate-100"><LogOut className="h-4 w-4" aria-hidden="true" /> Sign out</Button>}
        />
        <div className="space-y-5 p-5 sm:p-6">
          {status ? <p className="rounded-2xl border border-lime-300/25 bg-lime-300/10 p-4 text-sm font-bold text-lime-100" role="status">{status}</p> : null}
          {error ? <p className="rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-bold text-red-100" role="alert">{error}</p> : null}
          {isEditing ? (
            <form onSubmit={save} className="grid gap-4 rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-5 sm:grid-cols-2">
              {[
                ["firstName", "First name", profile.firstName || ""],
                ["lastName", "Last name", profile.lastName || ""],
                ["username", "Username", profile.username || ""],
                ["email", "Email", profile.email || ""],
              ].map(([name, label, value]) => (
                <label key={name} className="block">
                  <span className="text-xs font-black uppercase tracking-[0.18em] text-lime-200">{label}</span>
                  <input name={name} type={name === "email" ? "email" : "text"} defaultValue={value} disabled={name === "email" && !profile.canChangeEmail} required={name === "username" || name === "email"} className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-slate-950 px-3 text-sm font-bold text-white disabled:opacity-55" />
                </label>
              ))}
              <Button type="submit" disabled={isSaving} className="h-12 rounded-full bg-lime-300 font-black text-slate-950 sm:col-span-2">{isSaving ? "Saving…" : "Save profile details"}</Button>
            </form>
          ) : null}
          <button type="button" onClick={onSettings} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-5 text-sm font-black text-white"><Settings className="h-4 w-4" aria-hidden="true" /> Account settings</button>
          <p className="text-xs font-semibold text-slate-500">Avatar upload remains unchanged on web and is intentionally deferred until its storage validation can be shared safely.</p>
        </div>
      </section>
    </main>
  );
}
