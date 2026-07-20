"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Save } from "lucide-react";
import {
  createEvent,
  updateEvent,
  type EventActionState,
} from "@/app/organizer/events/actions";
import PlaceAutocompleteInput from "@/components/places/PlaceAutocompleteInput";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";

type EventEditorValue = Record<string, unknown> & {
  id?: string;
  owner_user_id?: string;
  cover_image_storage_path?: string | null;
};

const initialState: EventActionState = { ok: false, message: "" };

function field(value: unknown) {
  if (typeof value === "string") return value;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function splitLocalDateTime(value: unknown) {
  const [date = "", time = ""] = field(value).split("T");
  return { date, time: time.slice(0, 5) };
}

function getAddressComponent(
  place: google.maps.places.PlaceResult,
  type: string,
  short = false,
) {
  const component = place.address_components?.find((item) =>
    item.types.includes(type),
  );
  return component ? (short ? component.short_name : component.long_name) : "";
}

function getStreetAddress(place: google.maps.places.PlaceResult) {
  return [
    getAddressComponent(place, "street_number"),
    getAddressComponent(place, "route"),
  ]
    .filter(Boolean)
    .join(" ");
}

export default function OrganizerEventEditor({
  event,
  privateDetails,
  modal = false,
  onCancel,
}: {
  event?: EventEditorValue | null;
  privateDetails?: Record<string, unknown> | null;
  modal?: boolean;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const action = event?.id ? updateEvent : createEvent;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [previewUrl, setPreviewUrl] = useState("");
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverMessage, setCoverMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [venueType, setVenueType] = useState(
    field(event?.venue_type) || "physical",
  );
  const [registrationMode, setRegistrationMode] = useState(
    field(event?.registration_mode) || "rsvp",
  );
  const initialStart = splitLocalDateTime(event?.starts_at_local);
  const initialEnd = splitLocalDateTime(event?.ends_at_local);
  const initialPublish = splitLocalDateTime(event?.publish_at_local);
  const [startDate, setStartDate] = useState(initialStart.date);
  const [startTime, setStartTime] = useState(initialStart.time);
  const [endDate, setEndDate] = useState(initialEnd.date);
  const [endTime, setEndTime] = useState(initialEnd.time);
  const [publishDate, setPublishDate] = useState(initialPublish.date);
  const [publishTime, setPublishTime] = useState(initialPublish.time);
  const [timezone, setTimezone] = useState(
    field(event?.timezone) || Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const [venue, setVenue] = useState({
    search: field(event?.venue_name) || field(event?.address_line),
    name: field(event?.venue_name),
    addressLine: field(event?.address_line),
    city: field(event?.city),
    region: field(event?.region),
    country: field(event?.country),
    postalCode: field(event?.postal_code),
    googlePlaceId: field(event?.google_place_id),
    latitude: field(event?.latitude),
    longitude: field(event?.longitude),
  });

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );
  const title = useMemo(() => field(event?.title), [event]);

  async function uploadCover() {
    if (!event?.id || !coverFile) return;
    setUploading(true);
    setCoverMessage("");
    const payload = new FormData();
    payload.set("cover", coverFile);
    const response = await fetch(`/api/events/${event.id}/cover`, {
      method: "POST",
      body: payload,
    });
    const result = await response.json().catch(() => ({}));
    setCoverMessage(
      response.ok
        ? "Cover photo saved."
        : result.error || "Cover upload failed.",
    );
    setUploading(false);
    if (response.ok) router.refresh();
  }

  async function deleteCover() {
    if (!event?.id || !event.cover_image_storage_path) return;
    if (!window.confirm("Remove this event cover photo?")) return;
    setUploading(true);
    setCoverMessage("");
    const response = await fetch(`/api/events/${event.id}/cover`, {
      method: "DELETE",
    });
    const result = await response.json().catch(() => ({}));
    setCoverMessage(
      response.ok
        ? "Cover photo removed."
        : result.error || "Cover removal failed.",
    );
    setUploading(false);
    if (response.ok) router.refresh();
  }

  async function resolveVenueTimezone(latitude: number, longitude: number) {
    try {
      const response = await fetch("/api/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: latitude, lng: longitude, date: startDate }),
      });
      if (!response.ok) return;
      const result = (await response.json()) as { timeZoneId?: unknown };
      if (typeof result.timeZoneId === "string" && result.timeZoneId.trim()) {
        setTimezone(result.timeZoneId.trim());
      }
    } catch {
      // The timezone remains editable when lookup is unavailable.
    }
  }

  function selectVenue(place: google.maps.places.PlaceResult) {
    const latitude = place.geometry?.location?.lat();
    const longitude = place.geometry?.location?.lng();
    const city =
      getAddressComponent(place, "locality") ||
      getAddressComponent(place, "postal_town") ||
      getAddressComponent(place, "administrative_area_level_2");

    setVenue((current) => ({
      ...current,
      search: place.name || place.formatted_address || current.search,
      name: place.name || current.name,
      addressLine:
        getStreetAddress(place) || place.formatted_address || current.addressLine,
      city: city || current.city,
      region:
        getAddressComponent(place, "administrative_area_level_1") ||
        current.region,
      country: getAddressComponent(place, "country") || current.country,
      postalCode:
        getAddressComponent(place, "postal_code") || current.postalCode,
      googlePlaceId: place.place_id || "",
      latitude: typeof latitude === "number" ? String(latitude) : "",
      longitude: typeof longitude === "number" ? String(longitude) : "",
    }));

    if (typeof latitude === "number" && typeof longitude === "number") {
      void resolveVenueTimezone(latitude, longitude);
    }
  }

  const input =
    "mt-2 h-12 w-full rounded-2xl border border-white/15 bg-slate-950/80 px-4 text-sm font-bold text-white outline-none focus:border-lime-300/55";
  const textarea =
    "mt-2 w-full rounded-2xl border border-white/15 bg-slate-950/80 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none focus:border-lime-300/55";
  const label =
    "text-[11px] font-black uppercase tracking-[0.16em] text-lime-200/90";

  return (
    <form
      action={formAction}
      className={modal ? "vaivia-modal-body space-y-6" : "space-y-6"}
    >
      {event?.id ? (
        <input type="hidden" name="event_id" value={event.id} />
      ) : null}
      {event?.owner_user_id ? (
        <input type="hidden" name="owner_user_id" value={event.owner_user_id} />
      ) : null}
      <EditorSection eyebrow="Identity" title="Event story">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className={label}>Event title</span>
            <input
              name="title"
              required
              defaultValue={title}
              className={input}
              placeholder="Late Night at Dream Haus"
            />
          </label>
          <label>
            <span className={label}>URL slug</span>
            <input
              name="slug"
              defaultValue={field(event?.slug)}
              className={input}
              placeholder="late-night-dream-haus"
            />
          </label>
          <label>
            <span className={label}>Category</span>
            <input
              name="category"
              defaultValue={field(event?.category)}
              className={input}
              placeholder="Nightlife, workshop, community…"
            />
          </label>
          <label className="sm:col-span-2">
            <span className={label}>Short summary</span>
            <input
              name="short_summary"
              maxLength={240}
              defaultValue={field(event?.short_summary)}
              className={input}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={label}>Full description</span>
            <textarea
              name="description"
              rows={8}
              defaultValue={field(event?.description)}
              className={textarea}
            />
            <span className="mt-1 block text-xs font-semibold text-slate-500">
              Rendered as safe text; scripts and arbitrary HTML are never
              accepted.
            </span>
          </label>
          <label className="sm:col-span-2">
            <span className={label}>Tags (comma separated)</span>
            <input
              name="tags"
              defaultValue={
                Array.isArray(event?.tags) ? event.tags.join(", ") : ""
              }
              className={input}
            />
          </label>
        </div>
      </EditorSection>
      <EditorSection eyebrow="When & where" title="Schedule and venue">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className={label}>Start date</span>
            <DateInput
              name="starts_at_date"
              required
              value={startDate}
              onChange={(event) => setStartDate(event.currentTarget.value)}
              className={input}
            />
          </label>
          <label>
            <span className={label}>Start time</span>
            <TimeInput
              name="starts_at_time"
              required
              value={startTime}
              onChange={(event) => setStartTime(event.currentTarget.value)}
              className={input}
            />
          </label>
          <label>
            <span className={label}>End date</span>
            <DateInput
              name="ends_at_date"
              required
              min={startDate || undefined}
              value={endDate}
              onChange={(event) => setEndDate(event.currentTarget.value)}
              className={input}
            />
          </label>
          <label>
            <span className={label}>End time</span>
            <TimeInput
              name="ends_at_time"
              required
              value={endTime}
              onChange={(event) => setEndTime(event.currentTarget.value)}
              className={input}
            />
          </label>
          <input
            type="hidden"
            name="starts_at_local"
            value={startDate && startTime ? `${startDate}T${startTime}` : ""}
          />
          <input
            type="hidden"
            name="ends_at_local"
            value={endDate && endTime ? `${endDate}T${endTime}` : ""}
          />
          <label>
            <span className={label}>IANA timezone</span>
            <input
              name="timezone"
              required
              value={timezone}
              onChange={(event) => setTimezone(event.currentTarget.value)}
              className={input}
              placeholder="America/Toronto"
            />
          </label>
          <label>
            <span className={label}>Venue type</span>
            <select
              name="venue_type"
              value={venueType}
              onChange={(e) => setVenueType(e.target.value)}
              className={input}
            >
              <option value="physical">Physical venue</option>
              <option value="online">Online event</option>
            </select>
          </label>
          {venueType === "online" ? (
            <label className="sm:col-span-2">
              <span className={label}>
                Online event URL (eligible attendees only)
              </span>
              <input
                type="url"
                name="online_url"
                defaultValue={field(privateDetails?.online_url)}
                className={input}
              />
            </label>
          ) : (
            <>
              <label className="sm:col-span-2">
                <span className={label}>Find the venue or address</span>
                <PlaceAutocompleteInput
                  name="venue_search"
                  value={venue.search}
                  onInputChange={(value) =>
                    setVenue((current) => ({
                      ...current,
                      search: value,
                      googlePlaceId: "",
                      latitude: "",
                      longitude: "",
                    }))
                  }
                  onPlaceSelect={selectVenue}
                  placeholder="Search Google for a venue or address"
                  className={input}
                />
                {venue.googlePlaceId ? (
                  <span className="mt-2 block text-xs font-bold text-lime-200">
                    Google-validated location
                  </span>
                ) : (
                  <span className="mt-2 block text-xs font-semibold text-slate-500">
                    Choose a Google suggestion to validate the venue and fill its
                    address.
                  </span>
                )}
              </label>
              <label>
                <span className={label}>Venue name</span>
                <input
                  name="venue_name"
                  value={venue.name}
                  onChange={(event) =>
                    setVenue((current) => ({
                      ...current,
                      name: event.currentTarget.value,
                    }))
                  }
                  className={input}
                />
              </label>
              <label>
                <span className={label}>Street address</span>
                <input
                  name="address_line"
                  value={venue.addressLine}
                  onChange={(event) =>
                    setVenue((current) => ({
                      ...current,
                      addressLine: event.currentTarget.value,
                    }))
                  }
                  className={input}
                />
              </label>
              <label>
                <span className={label}>City</span>
                <input
                  name="city"
                  value={venue.city}
                  onChange={(event) =>
                    setVenue((current) => ({
                      ...current,
                      city: event.currentTarget.value,
                    }))
                  }
                  className={input}
                />
              </label>
              <label>
                <span className={label}>Region</span>
                <input
                  name="region"
                  value={venue.region}
                  onChange={(event) =>
                    setVenue((current) => ({
                      ...current,
                      region: event.currentTarget.value,
                    }))
                  }
                  className={input}
                />
              </label>
              <label>
                <span className={label}>Country</span>
                <input
                  name="country"
                  value={venue.country}
                  onChange={(event) =>
                    setVenue((current) => ({
                      ...current,
                      country: event.currentTarget.value,
                    }))
                  }
                  className={input}
                />
              </label>
              <label>
                <span className={label}>Postal code</span>
                <input
                  name="postal_code"
                  value={venue.postalCode}
                  onChange={(event) =>
                    setVenue((current) => ({
                      ...current,
                      postalCode: event.currentTarget.value,
                    }))
                  }
                  className={input}
                />
              </label>
              <input
                type="hidden"
                name="google_place_id"
                value={venue.googlePlaceId}
              />
              <input
                type="hidden"
                name="latitude"
                value={venue.latitude}
              />
              <input
                type="hidden"
                name="longitude"
                value={venue.longitude}
              />
            </>
          )}
        </div>
      </EditorSection>
      <EditorSection eyebrow="Access" title="Publishing and registration">
        <div className="grid gap-4 sm:grid-cols-2">
          {event?.id &&
          !["draft", "scheduled"].includes(field(event.status)) ? (
            <div>
              <span className={label}>Status</span>
              <p className="mt-2 flex h-12 items-center rounded-2xl border border-white/15 bg-white/[0.05] px-4 text-sm font-black uppercase text-lime-200">
                {field(event.status)}
              </p>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                Use the confirmed lifecycle controls on the Manage page.
              </p>
            </div>
          ) : (
            <label>
              <span className={label}>Status</span>
              <select
                name="status"
                defaultValue={field(event?.status) || "draft"}
                className={input}
              >
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled publication</option>
              </select>
            </label>
          )}
          <label>
            <span className={label}>Visibility</span>
            <select
              name="visibility"
              defaultValue={field(event?.visibility) || "public"}
              className={input}
            >
              <option value="public">Public marketplace</option>
              <option value="private">Private / invite only</option>
            </select>
          </label>
          <label>
            <span className={label}>Registration</span>
            <select
              name="registration_mode"
              value={registrationMode}
              onChange={(e) => setRegistrationMode(e.target.value)}
              className={input}
            >
              <option value="rsvp">RSVP only</option>
              <option value="ticketed">Free or paid tickets</option>
            </select>
          </label>
          <label>
            <span className={label}>Overall capacity</span>
            <input
              type="number"
              min="1"
              name="overall_capacity"
              defaultValue={field(event?.overall_capacity)}
              className={input}
            />
          </label>
          <label>
            <span className={label}>Publication date (optional)</span>
            <DateInput
              name="publish_at_date"
              value={publishDate}
              onChange={(event) => setPublishDate(event.currentTarget.value)}
              className={input}
            />
          </label>
          <label>
            <span className={label}>Publication time (optional)</span>
            <TimeInput
              name="publish_at_time"
              value={publishTime}
              onChange={(event) => setPublishTime(event.currentTarget.value)}
              className={input}
            />
          </label>
          <input
            type="hidden"
            name="publish_at_local"
            value={
              publishDate && publishTime ? `${publishDate}T${publishTime}` : ""
            }
          />
        </div>
        {registrationMode === "ticketed" ? (
          <p className="mt-4 rounded-2xl border border-lime-300/15 bg-lime-300/[0.06] p-4 text-sm font-semibold text-slate-300">
            Save the event, then configure free and paid tiers from its Tickets
            page.
          </p>
        ) : null}
      </EditorSection>
      <EditorSection eyebrow="Guest care" title="Organizer and policies">
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            <span className={label}>Organizer display name</span>
            <input
              name="organizer_display_name"
              defaultValue={field(event?.organizer_display_name)}
              className={input}
            />
          </label>
          <label>
            <span className={label}>Organizer contact email</span>
            <input
              type="email"
              name="organizer_contact_email"
              defaultValue={field(event?.organizer_contact_email)}
              className={input}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={label}>Accessibility information</span>
            <textarea
              name="accessibility_info"
              rows={3}
              defaultValue={field(event?.accessibility_info)}
              className={textarea}
            />
          </label>
          <label>
            <span className={label}>Age restriction</span>
            <input
              name="age_restriction"
              defaultValue={field(event?.age_restriction)}
              className={input}
            />
          </label>
          <label>
            <span className={label}>Attendee notes</span>
            <input
              name="attendee_notes"
              defaultValue={field(event?.attendee_notes)}
              className={input}
            />
          </label>
          <label className="sm:col-span-2">
            <span className={label}>Refund / cancellation policy</span>
            <textarea
              name="refund_policy"
              rows={4}
              defaultValue={field(event?.refund_policy)}
              className={textarea}
            />
          </label>
        </div>
      </EditorSection>
      <EditorSection eyebrow="Artwork" title="Event cover">
        <label>
          <span className={label}>Cover alt text</span>
          <input
            name="cover_image_alt"
            defaultValue={field(event?.cover_image_alt)}
            className={input}
          />
        </label>
        {event?.id ? (
          <div className="mt-4 rounded-[1.75rem] border border-dashed border-white/15 bg-white/[0.03] p-4">
            <label className="block cursor-pointer">
              <span className="flex items-center gap-2 font-black">
                <ImagePlus className="h-5 w-5 text-lime-300" />
                Choose landscape image
              </span>
              <span className="mt-1 block text-xs font-semibold text-slate-500">
                JPEG, PNG, WebP or AVIF · up to 10 MB · at least 800 × 450.
                VAIVIA crops the centre to 16:9.
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="mt-3 block w-full text-sm text-slate-300"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setCoverFile(file);
                  setPreviewUrl((current) => {
                    if (current) URL.revokeObjectURL(current);
                    return file ? URL.createObjectURL(file) : "";
                  });
                }}
              />
            </label>
            {previewUrl ? (
              <div className="mt-4 aspect-video overflow-hidden rounded-2xl bg-black">
                <Image
                  src={previewUrl}
                  alt="New event cover preview"
                  width={1600}
                  height={900}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={uploadCover}
                disabled={!coverFile || uploading}
                className="inline-flex rounded-full border border-white/15 px-5 py-2.5 text-sm font-black disabled:opacity-50"
              >
                {uploading
                  ? "Uploading…"
                  : event.cover_image_storage_path
                    ? "Replace cover"
                    : "Upload cover"}
              </button>
              {event.cover_image_storage_path ? (
                <button
                  type="button"
                  onClick={deleteCover}
                  disabled={uploading}
                  className="inline-flex rounded-full border border-red-300/20 px-5 py-2.5 text-sm font-black text-red-200 disabled:opacity-50"
                >
                  Remove cover
                </button>
              ) : null}
            </div>
            {coverMessage ? (
              <p className="mt-2 text-sm font-bold text-lime-200">
                {coverMessage}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 text-sm font-semibold text-slate-400">
            Create the draft first, then upload and preview its cover.
          </p>
        )}
      </EditorSection>
      {state.message ? (
        <p
          role="status"
          className={`rounded-2xl border p-4 text-sm font-bold ${state.ok ? "border-lime-300/20 bg-lime-300/10 text-lime-100" : "border-red-300/20 bg-red-300/10 text-red-100"}`}
        >
          {state.message}
        </p>
      ) : null}
      <div
        className={
          modal
            ? "vaivia-modal-footer vaivia-modal-actions sticky bottom-0 -mx-6 -mb-6"
            : "sticky bottom-24 z-10 flex justify-end rounded-[1.5rem] border border-white/10 bg-[#080511]/90 p-3 shadow-2xl backdrop-blur md:bottom-5"
        }
      >
        {modal && onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="vaivia-modal-button-secondary"
          >
            Cancel
          </button>
        ) : null}
        <button
          disabled={pending}
          className={
            modal
              ? "vaivia-modal-button-primary"
              : "inline-flex min-h-12 items-center gap-2 rounded-full bg-lime-300 px-6 text-sm font-black text-slate-950 disabled:opacity-50"
          }
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {event?.id ? "Save event" : "Create draft"}
        </button>
      </div>
    </form>
  );
}

function EditorSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/20 sm:p-7">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-lime-300">
        {eyebrow}
      </p>
      <h2 className="mb-5 mt-2 text-2xl font-black text-white">{title}</h2>
      {children}
    </section>
  );
}
