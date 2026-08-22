import { lazy, Suspense, useEffect, useState, type FormEvent } from "react";
import { Globe2, ListChecks, Stamp, UsersRound } from "lucide-react";
import PassportStampCard from "@/components/PassportStamp";
import type {
  MobilePlaceDetails,
  MobileSocialProfileResponse,
} from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "../lib/apiClient";
import { MobilePlaceAutocomplete } from "./MobilePlaceAutocomplete";

const ScratchMap = lazy(() => import("@/components/maps/ScratchMap"));

type Section = "passport" | "map" | "wishlist" | "friends";

export function MobileSocialProfileSections({
  apiClient,
  userId,
  onFriend,
}: {
  apiClient: MobileApiClient;
  userId: string;
  onFriend: (id: string) => void;
}) {
  const [data, setData] = useState<MobileSocialProfileResponse | null>(null);
  const [section, setSection] = useState<Section>("passport");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [placeValue, setPlaceValue] = useState("");
  const [place, setPlace] = useState<MobilePlaceDetails | null>(null);
  useEffect(() => {
    // Older embedded/test clients may restore a profile screen created before
    // the social methods were introduced. Keep the base profile usable while
    // the current client bundle finishes loading.
    if (typeof apiClient.getSocialProfile !== "function") {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void apiClient
      .getSocialProfile(controller.signal)
      .then(setData)
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load profile activity.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [apiClient, reload]);
  async function run(work: () => Promise<unknown>, message: string) {
    setSubmitting(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(message);
      setReload((value) => value + 1);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update your profile.",
      );
    } finally {
      setSubmitting(false);
    }
  }
  async function addFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        apiClient.mutateFriend(
          {
            operation: "invite",
            identifier: String(form.get("identifier") || ""),
          },
          { idempotencyKey: crypto.randomUUID() },
        ),
      "Friend request sent.",
    );
    event.currentTarget.reset();
  }
  async function addStamp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(
      () =>
        apiClient.mutatePassportStamp(
          {
            countryCode: String(form.get("countryCode") || ""),
            countryName: String(form.get("countryName") || ""),
            flagEmoji: String(form.get("flagEmoji") || ""),
            firstVisitedOn: String(form.get("firstVisitedOn") || ""),
            visitCity: String(form.get("visitCity") || ""),
            visitStatus: String(form.get("visitStatus") || "visited"),
          },
          { idempotencyKey: crypto.randomUUID() },
        ),
      "Passport stamp added.",
    );
    event.currentTarget.reset();
  }
  async function addWishlist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!place) {
      setError("Choose a place from the search results.");
      return;
    }
    const countryCode = String(form.get("countryCode") || "").toUpperCase();
    await run(
      () =>
        apiClient.mutateWishlist(
          {
            placeLabel: place.name || placeValue,
            countryCode,
            countryName: String(form.get("countryName") || ""),
            googlePlaceId: place.placeId,
            googleFormattedAddress: place.address,
            latitude: place.latitude,
            longitude: place.longitude,
          },
          { idempotencyKey: crypto.randomUUID() },
        ),
      "Wishlist destination added.",
    );
    setPlace(null);
    setPlaceValue("");
  }
  const tabs: Array<{ id: Section; label: string; icon: typeof Stamp }> = [
    { id: "passport", label: "Passport", icon: Stamp },
    { id: "map", label: "Scratch map", icon: Globe2 },
    { id: "wishlist", label: "Wishlist", icon: ListChecks },
    { id: "friends", label: "Friends", icon: UsersRound },
  ];
  return (
    <section className="space-y-5 rounded-[2rem] border border-white/10 bg-[#050712] p-5 shadow-2xl shadow-black/30">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={`min-h-12 rounded-2xl border px-3 text-xs font-black ${section === id ? "border-lime-300/35 bg-lime-300/15 text-lime-100" : "border-white/10 bg-white/[0.05] text-slate-300"}`}
          >
            <Icon className="mx-auto mb-1 h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      {notice ? (
        <p
          className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-3 text-sm font-bold text-lime-100"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-2xl border border-red-300/20 bg-red-400/10 p-3 text-sm font-bold text-red-100"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {loading && !data ? (
        <p aria-busy="true">Loading profile activity…</p>
      ) : null}
      {data && section === "passport" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {data.stamps.map((item) => (
              <div key={item.id} className="relative">
                <PassportStampCard
                  countryName={item.countryName}
                  countryCode={item.countryCode}
                  flagEmoji={item.flagEmoji || ""}
                  firstVisitYear={
                    item.firstVisitedOn
                      ? Number(item.firstVisitedOn.slice(0, 4))
                      : undefined
                  }
                  welcomeLabel={item.welcomeLabel || "WELCOME"}
                  airportCity={item.visitCity || undefined}
                  portOfEntryLabel={item.portOfEntryName || undefined}
                  size="sm"
                />
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    window.confirm("Remove this passport stamp?") &&
                    void run(
                      () =>
                        apiClient.mutatePassportStamp(
                          { operation: "delete", id: item.id },
                          { idempotencyKey: crypto.randomUUID() },
                        ),
                      "Passport stamp removed.",
                    )
                  }
                  className="mt-2 min-h-11 w-full rounded-full border border-red-300/20 text-xs font-black text-red-100"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <form
            onSubmit={addStamp}
            className="grid grid-cols-2 gap-3 rounded-2xl border border-white/10 p-4"
          >
            <input
              name="countryName"
              required
              placeholder="Country"
              className="h-11 rounded-xl bg-slate-950 px-3"
            />
            <input
              name="countryCode"
              required
              maxLength={2}
              placeholder="Code (CA)"
              className="h-11 rounded-xl bg-slate-950 px-3 uppercase"
            />
            <input
              name="flagEmoji"
              placeholder="Flag"
              className="h-11 rounded-xl bg-slate-950 px-3"
            />
            <input
              name="firstVisitedOn"
              type="date"
              required
              max={new Date().toISOString().slice(0, 10)}
              className="h-11 rounded-xl bg-slate-950 px-3"
            />
            <input
              name="visitCity"
              placeholder="City"
              className="h-11 rounded-xl bg-slate-950 px-3"
            />
            <select
              name="visitStatus"
              className="h-11 rounded-xl bg-slate-950 px-3"
            >
              <option value="visited">Visited</option>
              <option value="lived">Lived</option>
            </select>
            <button
              type="submit"
              disabled={submitting}
              className="col-span-2 min-h-11 rounded-full bg-lime-300 font-black text-slate-950"
            >
              Add passport stamp
            </button>
          </form>
        </div>
      ) : null}
      {data && section === "map" ? (
        <Suspense fallback={<p>Loading scratch map…</p>}>
          <ScratchMap
            userId={userId}
            visitedCountryCodes={data.stamps.map((item) => item.countryCode)}
            scratchedCountryCodes={data.scratchMapCountryCodes}
            onScratchMapChange={(codes) =>
              setData((current) =>
                current
                  ? { ...current, scratchMapCountryCodes: codes }
                  : current,
              )
            }
            onScratchCountryChange={(countryCode, scratched) =>
              apiClient
                .updateScratchMap(countryCode, scratched, {
                  idempotencyKey: crypto.randomUUID(),
                })
                .then(() => undefined)
            }
            settingsHref="/profile"
            mapViewportClassName="relative h-[55vh] w-full"
          />
        </Suspense>
      ) : null}
      {data && section === "wishlist" ? (
        <div className="space-y-3">
          {data.wishlist.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"
            >
              <strong>
                {item.flagEmoji} {item.placeLabel}
              </strong>
              <p className="text-xs text-slate-400">
                {item.status.replaceAll("_", " ")}
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    void run(
                      () =>
                        apiClient.mutateWishlist(
                          {
                            ...item,
                            id: item.id,
                            status:
                              item.status === "completed"
                                ? "in_progress"
                                : "completed",
                          },
                          { idempotencyKey: crypto.randomUUID() },
                        ),
                      "Wishlist updated.",
                    )
                  }
                  className="min-h-11 rounded-full border border-white/10 px-4 text-xs font-black"
                >
                  {item.status === "completed" ? "Move back" : "Complete"}
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    window.confirm("Remove this wishlist destination?") &&
                    void run(
                      () =>
                        apiClient.mutateWishlist(
                          { operation: "delete", id: item.id },
                          { idempotencyKey: crypto.randomUUID() },
                        ),
                      "Wishlist destination removed.",
                    )
                  }
                  className="min-h-11 rounded-full border border-red-300/20 px-4 text-xs font-black text-red-100"
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
          <form
            onSubmit={addWishlist}
            className="space-y-3 rounded-2xl border border-white/10 p-4"
          >
            <MobilePlaceAutocomplete
              apiClient={apiClient}
              label="Destination"
              value={placeValue}
              onValueChange={(value) => {
                setPlaceValue(value);
                setPlace(null);
              }}
              onPlaceSelect={setPlace}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                name="countryName"
                placeholder="Country"
                required
                className="h-11 rounded-xl bg-slate-950 px-3"
              />
              <input
                name="countryCode"
                maxLength={2}
                placeholder="Code (CA)"
                required
                className="h-11 rounded-xl bg-slate-950 px-3 uppercase"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-11 w-full rounded-full bg-lime-300 font-black text-slate-950"
            >
              Add destination
            </button>
          </form>
        </div>
      ) : null}
      {data && section === "friends" ? (
        <div className="space-y-4">
          <div className="grid gap-3">
            {data.friends.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onFriend(item.id)}
                className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left"
              >
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-lime-300/15 font-black">
                  {item.avatarUrl ? (
                    // Capacitor/Vite cannot use Next.js Image; this URL is the
                    // already-sized authenticated profile avatar.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    item.firstName?.[0] || item.username?.[0] || "V"
                  )}
                </span>
                <span>
                  <strong className="block">
                    {[item.firstName, item.lastName]
                      .filter(Boolean)
                      .join(" ") || item.username}
                  </strong>
                  <small className="text-slate-400">View travel profile</small>
                </span>
              </button>
            ))}
          </div>
          {data.incomingInvitations.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-lime-300/20 bg-lime-300/10 p-4"
            >
              <strong>Friend request</strong>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    void run(
                      () =>
                        apiClient.mutateFriend(
                          {
                            operation: "respond",
                            friendshipId: item.id,
                            response: "accept",
                          },
                          { idempotencyKey: crypto.randomUUID() },
                        ),
                      "Friend added.",
                    )
                  }
                  className="min-h-11 rounded-full bg-lime-300 px-4 text-xs font-black text-slate-950"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    void run(
                      () =>
                        apiClient.mutateFriend(
                          {
                            operation: "respond",
                            friendshipId: item.id,
                            response: "decline",
                          },
                          { idempotencyKey: crypto.randomUUID() },
                        ),
                      "Friend request declined.",
                    )
                  }
                  className="min-h-11 rounded-full border border-white/15 px-4 text-xs font-black"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
          <form onSubmit={addFriend} className="flex gap-2">
            <input
              name="identifier"
              required
              placeholder="Email or username"
              className="h-12 min-w-0 flex-1 rounded-xl bg-slate-950 px-3"
            />
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-lime-300 px-4 text-sm font-black text-slate-950"
            >
              Add friend
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
