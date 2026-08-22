import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { MobileSettingsResponse, MobileTripMutationInput } from "@/lib/mobileApi/contracts";
import {
  TripLifecycleCard,
  TripLifecycleFormPresentation,
  TripLifecycleShell,
  type TripLifecycleFormValues,
} from "@/components/trips/TripLifecycleFormPresentation";
import { MobileApiError, type MobileApiClient } from "../lib/apiClient";
import { useMobileMutation } from "../lib/useMobileMutation";

const initialValues: TripLifecycleFormValues = {
  title: "",
  slug: "",
  destination: "",
  startDate: "",
  endDate: "",
  notes: "",
  legs: [],
};

export function TripCreateScreen({
  apiClient,
  onCreated,
}: {
  apiClient: MobileApiClient;
  onCreated: (tripId: string) => void;
}) {
  const [values, setValues] = useState(initialValues);
  const [inviteIdentifiers, setInviteIdentifiers] = useState("");
  const [settings, setSettings] = useState<MobileSettingsResponse | null>(null);
  const [familyMemberIds, setFamilyMemberIds] = useState<string[]>([]);
  const create = useCallback(
    (input: MobileTripMutationInput) =>
      apiClient.createTrip(input, { idempotencyKey: crypto.randomUUID() }),
    [apiClient],
  );
  const mutation = useMobileMutation(create, {
    onCommit: (result) => onCreated(result.trip.id),
  });

  useEffect(() => {
    const controller = new AbortController();
    void apiClient.getSettings(controller.signal).then(setSettings).catch(() => undefined);
    return () => controller.abort();
  }, [apiClient]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutation.submit({
      ...values,
      legs: values.legs,
      initialInviteIdentifiers: inviteIdentifiers.split(",").map((value) => value.trim()).filter(Boolean),
      initialFamilyMemberIds: familyMemberIds,
    }).catch(() => undefined);
  }

  const fieldErrors = mutation.error instanceof MobileApiError ? mutation.error.fieldErrors : undefined;
  return (
    <TripLifecycleShell eyebrow="Trips" title="Create a trip" description="Build the trip, dates and traveller scope now; add itinerary details afterward.">
      <TripLifecycleFormPresentation
        values={values}
        onChange={setValues}
        onSubmit={submit}
        submitLabel="Create trip"
        isSubmitting={mutation.isSubmitting}
        error={mutation.error?.message}
        fieldErrors={fieldErrors}
      />
      <TripLifecycleCard title="Invite travellers" description="Optional. Separate multiple emails or usernames with commas.">
        <label className="grid gap-1.5 text-sm font-bold text-white/85">
          Emails or usernames
          <textarea value={inviteIdentifiers} onChange={(event) => setInviteIdentifiers(event.target.value)} className="min-h-24 rounded-xl border border-white/15 bg-black/25 px-3 py-2 text-base text-white outline-none focus:border-fuchsia-400" />
        </label>
      </TripLifecycleCard>
      {settings?.familyMembers.length ? (
        <TripLifecycleCard title="Family members" description="Include people you manage on your VAIVIA account.">
          <div className="grid gap-2">
            {settings.familyMembers.map((member) => (
              <label key={member.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 text-sm font-bold">
                <input type="checkbox" checked={familyMemberIds.includes(member.id)} onChange={(event) => setFamilyMemberIds((current) => event.target.checked ? [...current, member.id] : current.filter((id) => id !== member.id))} />
                <span>{member.name}</span><span className="ml-auto text-xs text-white/45">{member.relationship}</span>
              </label>
            ))}
          </div>
        </TripLifecycleCard>
      ) : null}
    </TripLifecycleShell>
  );
}
