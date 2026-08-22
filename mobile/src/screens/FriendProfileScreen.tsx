import { useEffect, useState } from "react";
import { ProfileHeaderPresentation } from "@/components/account/ProfileHeaderPresentation";
import PassportStampCard from "@/components/PassportStamp";
import type { MobileFriendProfileResponse } from "@/lib/mobileApi/contracts";
import type { MobileApiClient } from "../lib/apiClient";
import { ScreenMessage } from "../components/ScreenMessage";

export function FriendProfileScreen({
  apiClient,
  userId,
  onBack,
}: {
  apiClient: MobileApiClient;
  userId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<MobileFriendProfileResponse | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void apiClient
      .getFriendProfile(userId, controller.signal)
      .then(setData)
      .catch((caught) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load this friend.",
          );
      });
    return () => controller.abort();
  }, [apiClient, userId]);
  if (!data)
    return (
      <main className="px-4 py-10">
        {error ? (
          <ScreenMessage
            title="Friend profile unavailable"
            message={error}
            actionLabel="Back"
            onAction={onBack}
          />
        ) : (
          <p className="text-white" aria-busy="true">
            Loading friend profile…
          </p>
        )}
      </main>
    );
  const name =
    [data.friend.firstName, data.friend.lastName].filter(Boolean).join(" ") ||
    data.friend.username ||
    "VAIVIA friend";
  return (
    <main className="mx-auto max-w-4xl space-y-5 px-4 py-6 text-white">
      <button
        type="button"
        onClick={onBack}
        className="min-h-11 rounded-full border border-white/10 px-4 text-sm font-black"
      >
        Back
      </button>
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#050712]">
        <ProfileHeaderPresentation
          displayName={name}
          subtitle={
            data.friend.username ? `@${data.friend.username}` : "VAIVIA friend"
          }
          avatarUrl={data.friend.avatarUrl}
          roleLabel={data.friend.role || "VAIVIA member"}
          levelLabel={`Level ${data.level}: ${data.levelName}`}
          themeLabel="Travel profile"
          themeBadgeClass="border-lime-300/25 bg-lime-300/10 text-lime-100"
          joinedLabel="Friends"
          pointsLabel={`${data.points} points`}
          editAction={null}
          signOutAction={null}
        />
      </section>
      <section className="rounded-[2rem] border border-white/10 bg-[#050712] p-5">
        <h2 className="text-xl font-black">Passport stamps</h2>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {data.stamps.map((item) => (
            <PassportStampCard
              key={item.id}
              countryName={item.countryName}
              countryCode={item.countryCode}
              flagEmoji={item.flagEmoji || ""}
              firstVisitYear={
                item.firstVisitedOn
                  ? Number(item.firstVisitedOn.slice(0, 4))
                  : undefined
              }
              welcomeLabel={item.welcomeLabel || "WELCOME"}
              size="sm"
            />
          ))}
        </div>
        <h2 className="mt-6 text-xl font-black">Wishlist</h2>
        <div className="mt-3 space-y-2">
          {data.wishlist.map((item) => (
            <p
              key={item.id}
              className="rounded-xl border border-white/10 p-3 text-sm font-bold"
            >
              {item.flagEmoji} {item.placeLabel}
            </p>
          ))}
        </div>
        <button
          type="button"
          disabled={submitting}
          onClick={() =>
            window.confirm(`Remove ${name} as a friend?`) &&
            (setSubmitting(true),
            apiClient
              .mutateFriendProfile(
                userId,
                { operation: "remove" },
                { idempotencyKey: crypto.randomUUID() },
              )
              .then(onBack)
              .catch((caught) =>
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Could not remove friend.",
                ),
              )
              .finally(() => setSubmitting(false)))
          }
          className="mt-6 min-h-11 w-full rounded-full border border-red-300/20 text-sm font-black text-red-100"
        >
          Remove friend
        </button>
      </section>
    </main>
  );
}
