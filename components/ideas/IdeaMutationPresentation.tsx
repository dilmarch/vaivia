"use client";

import { useState, type FormEvent } from "react";
import { Trash2, X } from "lucide-react";
import AnimatedModal from "@/components/AnimatedModal";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import {
  IDEA_AGE_POLICIES,
  IDEA_CATEGORIES,
  IDEA_DAYS,
  IDEA_TICKET_POLICIES,
  IDEA_TIME_OF_DAY_OPTIONS,
  toIdeaDayValue,
  toIdeaTimeOfDayValue,
  type TripIdea,
} from "@/lib/tripIdeas";
import type { MobileIdeaMutationInput } from "@/lib/mobileApi/contracts";

const inputClass = "mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900";
const labelClass = "block text-sm font-medium text-slate-700";

function toggle(values: string[], value: string) {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

export function IdeaEditorPresentation({
  idea,
  isSubmitting,
  errorMessage,
  fieldErrors,
  onSubmit,
  onDelete,
  onClose,
}: {
  idea?: TripIdea | null;
  isSubmitting?: boolean;
  errorMessage?: string;
  fieldErrors?: Record<string, string[]>;
  onSubmit: (input: MobileIdeaMutationInput) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(idea?.title || "");
  const [location, setLocation] = useState(idea?.location || idea?.formatted_address || "");
  const [category, setCategory] = useState(idea?.category || "Other");
  const [description, setDescription] = useState(idea?.description || "");
  const [tags, setTags] = useState(idea?.tags.join(", ") || "");
  const [days, setDays] = useState<string[]>(idea?.days_available.map(toIdeaDayValue) || []);
  const [times, setTimes] = useState<string[]>(idea?.time_of_day.map(toIdeaTimeOfDayValue) || []);
  const [startDate, setStartDate] = useState(idea?.availability_start_date || "");
  const [endDate, setEndDate] = useState(idea?.availability_end_date || "");
  const [opensAt, setOpensAt] = useState(idea?.opens_at?.slice(0, 5) || "");
  const [closesAt, setClosesAt] = useState(idea?.closes_at?.slice(0, 5) || "");
  const [is24Hours, setIs24Hours] = useState(Boolean(idea?.is_24_hours));
  const [ticketPolicy, setTicketPolicy] = useState(idea?.ticket_policy || "any");
  const [agePolicy, setAgePolicy] = useState(idea?.age_policy || "all_ages");
  const [dressCode, setDressCode] = useState(idea?.dress_code || "");
  const [url, setUrl] = useState(idea?.url || idea?.location_website || "");
  const [estimatedCost, setEstimatedCost] = useState(idea?.estimated_cost?.toString() || "");
  const [currency, setCurrency] = useState(idea?.currency || "CAD");
  const [isPrivate, setIsPrivate] = useState(Boolean(idea?.is_private));
  const [confirmDelete, setConfirmDelete] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const originalLocation = idea?.location || idea?.formatted_address || "";
    const preservePlaceMetadata = Boolean(idea && location === originalLocation);
    onSubmit({
      title,
      location,
      category,
      description,
      tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      daysOfWeek: days,
      timeOfDay: times,
      availabilityStartDate: startDate,
      availabilityEndDate: endDate,
      opensAt,
      closesAt,
      is24Hours,
      ticketPolicy,
      agePolicy,
      dressCode,
      url,
      estimatedCost,
      currency,
      isPrivate,
      formattedAddress: preservePlaceMetadata ? idea?.formatted_address : null,
      googlePlaceId: preservePlaceMetadata ? idea?.google_place_id : null,
      locationLat: preservePlaceMetadata ? idea?.location_lat : null,
      locationLng: preservePlaceMetadata ? idea?.location_lng : null,
      locationCity: preservePlaceMetadata ? idea?.location_city : null,
      locationRegion: preservePlaceMetadata ? idea?.location_region : null,
      locationCountry: preservePlaceMetadata ? idea?.location_country : null,
      locationCountryCode: preservePlaceMetadata ? idea?.location_country_code : null,
      locationPostalCode: preservePlaceMetadata ? idea?.location_postal_code : null,
      timezone: preservePlaceMetadata ? idea?.timezone : null,
      timezoneSource: preservePlaceMetadata ? idea?.timezone_source : null,
      tripLegId: preservePlaceMetadata ? idea?.trip_leg_id : null,
    });
  }

  return (
    <AnimatedModal onClose={onClose} panelClassName="max-w-3xl" labelledBy="mobile-idea-editor-title">
      {({ requestClose }) => (
        <>
          <div className="vaivia-modal-header flex items-start justify-between gap-4">
            <div>
              <p className="vaivia-modal-eyebrow">Trip Ideas</p>
              <h2 id="mobile-idea-editor-title" className="vaivia-modal-title">
                {idea ? "Edit thing to do" : "Add thing to do"}
              </h2>
              <p className="mt-2 text-sm font-semibold text-slate-300">Existing saved place details are preserved while you edit.</p>
            </div>
            <button type="button" onClick={requestClose} className="vaivia-modal-close" aria-label="Close idea editor">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <form onSubmit={submit} className="vaivia-modal-body space-y-5">
            {errorMessage ? <p role="alert" className="rounded-xl border border-red-300/25 bg-red-950/80 p-3 text-sm font-bold text-red-100">{errorMessage}</p> : null}
            <label className={labelClass}>Location
              <input required value={location} onChange={(event) => setLocation(event.target.value)} className={inputClass} autoComplete="off" />
              {fieldErrors?.location?.map((message) => <span key={message} className="mt-1 block text-xs text-red-600">{message}</span>)}
            </label>
            <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
              <label className={labelClass}>Name <span className="font-normal text-slate-500">(optional)</span>
                <input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} autoComplete="off" />
              </label>
              <label className={labelClass}>Category
                <select value={category} onChange={(event) => setCategory(event.target.value)} className={inputClass}>
                  {IDEA_CATEGORIES.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>
            <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} className="mt-1 h-4 w-4" />
              <span><strong className="block text-slate-900">Private</strong>Visible only to you when trip sharing is enabled.</span>
            </label>
            <label className={labelClass}>Description / notes
              <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className={inputClass} />
            </label>
            <label className={labelClass}>Tags
              <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="rainy day, cheap, must do" className={inputClass} />
            </label>
            <div>
              <p className={labelClass}>Date availability</p>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>Start date<DateInput value={startDate} max={endDate || undefined} onChange={(event) => setStartDate(event.target.value)} className={inputClass} /></label>
                <label className={labelClass}>End date<DateInput value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className={inputClass} /></label>
              </div>
            </div>
            <div>
              <p className={labelClass}>Days available</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {IDEA_DAYS.map((day) => { const value = toIdeaDayValue(day); return <button key={day} type="button" onClick={() => setDays(toggle(days, value))} aria-pressed={days.includes(value)} className={`rounded-md border px-3 py-2 text-xs font-semibold ${days.includes(value) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>{day.slice(0, 3)}</button>; })}
              </div>
            </div>
            <div>
              <p className={labelClass}>Time of day</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {IDEA_TIME_OF_DAY_OPTIONS.map((time) => { const value = toIdeaTimeOfDayValue(time); return <button key={time} type="button" onClick={() => setTimes(toggle(times, value))} aria-pressed={times.includes(value)} className={`rounded-md border px-3 py-2 text-xs font-semibold ${times.includes(value) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>{time}</button>; })}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Optional opening time<TimeInput value={opensAt} onChange={(event) => { setOpensAt(event.target.value); setIs24Hours(false); }} className={inputClass} /></label>
              <label className={labelClass}>Optional closing time<TimeInput value={closesAt} onChange={(event) => { setClosesAt(event.target.value); setIs24Hours(false); }} className={inputClass} /></label>
            </div>
            <button type="button" onClick={() => { setIs24Hours(true); setOpensAt("00:00"); setClosesAt("23:59"); }} className={`rounded-md border px-3 py-2 text-sm font-semibold ${is24Hours ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>24 hours</button>
            <div><p className={labelClass}>Tickets</p><div className="mt-2 flex flex-wrap gap-2">{IDEA_TICKET_POLICIES.map((option) => <button key={option.value} type="button" onClick={() => setTicketPolicy(option.value)} aria-pressed={ticketPolicy === option.value} className={`rounded-md border px-3 py-2 text-sm font-semibold ${ticketPolicy === option.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>{option.label}</button>)}</div></div>
            <div><p className={labelClass}>Age policy</p><div className="mt-2 flex flex-wrap gap-2">{IDEA_AGE_POLICIES.map((option) => <button key={option.value} type="button" onClick={() => setAgePolicy(option.value)} aria-pressed={agePolicy === option.value} className={`rounded-md border px-3 py-2 text-sm font-semibold ${agePolicy === option.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700"}`}>{option.label}</button>)}</div></div>
            <label className={labelClass}>Website<input type="url" value={url} onChange={(event) => setUrl(event.target.value)} className={inputClass} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>Estimated cost<input inputMode="decimal" value={estimatedCost} onChange={(event) => setEstimatedCost(event.target.value)} className={inputClass} /></label>
              <label className={labelClass}>Currency<input maxLength={3} value={currency} onChange={(event) => setCurrency(event.target.value.toUpperCase())} className={inputClass} /></label>
            </div>
            <label className={labelClass}>Dress code<textarea rows={2} value={dressCode} onChange={(event) => setDressCode(event.target.value)} className={inputClass} /></label>
            {confirmDelete && onDelete ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-950"><p className="font-bold">Delete “{idea?.title}” permanently?</p><div className="mt-3 flex gap-2"><button type="button" onClick={onDelete} disabled={isSubmitting} className="vaivia-modal-button-danger"><Trash2 className="h-4 w-4" />Yes, delete idea</button><button type="button" onClick={() => setConfirmDelete(false)} className="vaivia-modal-button-secondary">Keep idea</button></div></div> : null}
            <div className="vaivia-modal-actions justify-between">
              <div>{idea && onDelete && !confirmDelete ? <button type="button" onClick={() => setConfirmDelete(true)} className="vaivia-modal-button-danger"><Trash2 className="h-4 w-4" />Delete idea</button> : null}</div>
              <div className="flex gap-2"><button type="button" onClick={requestClose} className="vaivia-modal-button-secondary">Cancel</button><button type="submit" disabled={isSubmitting} className="vaivia-modal-button-primary disabled:opacity-50">{isSubmitting ? "Saving…" : idea ? "Save thing to do" : "Add thing to do"}</button></div>
            </div>
          </form>
        </>
      )}
    </AnimatedModal>
  );
}

export function IdeaToItineraryPresentation({ idea, defaultDate, isSubmitting, errorMessage, onSubmit, onClose }: { idea: TripIdea; defaultDate: string; isSubmitting?: boolean; errorMessage?: string; onSubmit: (input: { itemDate: string; startTime: string; endTime: string; timezone: string; timezoneSource: string }) => void; onClose: () => void }) {
  const [itemDate, setItemDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("13:00");
  const [endTime, setEndTime] = useState("15:00");
  return <AnimatedModal onClose={onClose} panelClassName="max-w-lg" labelledBy="mobile-idea-itinerary-title">{({ requestClose }) => <><div className="vaivia-modal-header flex items-start justify-between gap-4"><div><p className="vaivia-modal-eyebrow">Trip Ideas</p><h2 id="mobile-idea-itinerary-title" className="vaivia-modal-title">Add to itinerary</h2><p className="mt-2 truncate text-sm font-semibold text-slate-300">{idea.title}</p></div><button type="button" onClick={requestClose} className="vaivia-modal-close" aria-label="Close add to itinerary"><X className="h-5 w-5" /></button></div><form className="vaivia-modal-body space-y-4" onSubmit={(event) => { event.preventDefault(); onSubmit({ itemDate, startTime, endTime, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", timezoneSource: "device" }); }}>{errorMessage ? <p role="alert" className="rounded-xl bg-red-950 p-3 text-sm text-red-100">{errorMessage}</p> : null}<label className="block text-sm font-semibold text-slate-200">Date<DateInput required value={itemDate} onChange={(event) => setItemDate(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-slate-900" /></label><div className="grid grid-cols-2 gap-2"><label className="block text-sm font-semibold text-slate-200">Start<TimeInput required value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-slate-900" /></label><label className="block text-sm font-semibold text-slate-200">End<TimeInput required value={endTime} onChange={(event) => setEndTime(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-white px-3 py-2 text-slate-900" /></label></div><button type="submit" disabled={isSubmitting} className="w-full rounded-full bg-lime-300 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-950 disabled:opacity-50">{isSubmitting ? "Adding…" : "Add to itinerary"}</button></form></>}</AnimatedModal>;
}
