"use client";
/* eslint-disable @next/next/no-img-element */

import { ImagePlus, Lock, Trash2, UploadCloud } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import type {
  MobileItineraryItem,
  MobileItineraryMutationInput,
} from "@/lib/mobileApi/contracts";

export type ItineraryEditorCategory = {
  id: string;
  name: string;
  color_key?: string | null;
};

export type ItineraryEditorAudienceOption = {
  kind: "member" | "invitation" | "family_member" | "guest";
  id: string;
  label: string;
  isCurrentUser?: boolean;
};

const FIELD_CLASS =
  "mt-1 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-base text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/45 focus:ring-2 focus:ring-lime-300/15";
const LABEL_CLASS = "text-sm font-bold text-slate-200";
const HELP_CLASS = "mt-1 text-xs leading-5 text-slate-400";

function valuesFromForm(form: HTMLFormElement): MobileItineraryMutationInput {
  const data = new FormData(form);
  const audienceMode = String(data.get("audience_mode") || "everyone") as
    | "everyone"
    | "custom"
    | "just_me";
  const selected = data.getAll("audience_participant").map(String);
  const participants = {
    memberIds: selected.filter((value) => value.startsWith("member:")).map((value) => value.slice(7)),
    invitationIds: selected.filter((value) => value.startsWith("invitation:")).map((value) => value.slice(11)),
    familyMemberIds: selected.filter((value) => value.startsWith("family_member:")).map((value) => value.slice(14)),
    guestNames: [] as string[],
  };
  const categoryOption = form.elements.namedItem("category_id") as HTMLSelectElement | null;
  return {
    title: String(data.get("title") || ""),
    categoryId: String(data.get("category_id") || "") || null,
    category: categoryOption?.selectedOptions[0]?.text || "Other",
    status: data.get("status") === "confirmed" ? "confirmed" : "tentative",
    itemDate: String(data.get("item_date") || ""),
    endDate: String(data.get("end_date") || "") || null,
    startTime: String(data.get("start_time") || "") || null,
    endTime: String(data.get("end_time") || "") || null,
    timezone: String(data.get("timezone") || "") || null,
    timezoneSource: "manual",
    location: String(data.get("location") || "") || null,
    formattedAddress: String(data.get("formatted_address") || "") || null,
    url: String(data.get("ticket_website") || "") || null,
    ticketWebsite: String(data.get("ticket_website") || "") || null,
    locationWebsite: String(data.get("location_website") || "") || null,
    notes: String(data.get("notes") || "") || null,
    cost: String(data.get("cost") || "") || null,
    currency: String(data.get("currency") || "CAD"),
    splitMethod: String(data.get("split_method") || "just_me") as MobileItineraryMutationInput["splitMethod"],
    isPrivate: data.get("is_private") === "on",
    audienceMode,
    participants,
    includedParticipants: selected,
    coverImageUrl: String(data.get("cover_image_url") || "") || null,
    removeCover: data.get("cover_remove") === "true",
  };
}

export function ItineraryItemEditorPresentation({
  item,
  categories,
  audienceOptions,
  defaultDate,
  defaultTimezone,
  isSubmitting,
  errorMessage,
  fieldErrors,
  onSubmit,
  onCancel,
  onDelete,
  onCoverSelected,
  footer,
}: {
  item?: MobileItineraryItem | null;
  categories: ItineraryEditorCategory[];
  audienceOptions: ItineraryEditorAudienceOption[];
  defaultDate: string;
  defaultTimezone: string;
  isSubmitting?: boolean;
  errorMessage?: string;
  fieldErrors?: Record<string, string[]>;
  onSubmit: (input: MobileItineraryMutationInput) => void;
  onCancel: () => void;
  onDelete?: () => void;
  onCoverSelected?: (file: File | null) => void;
  footer?: ReactNode;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(valuesFromForm(event.currentTarget));
  }
  const selectedCategory = item?.category_id || categories[0]?.id || "";
  const selectedAudience = new Set(item?.audienceSelections || []);
  return (
    <section className="mx-auto w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-[#080511] text-white shadow-2xl shadow-black/60">
      <div className="vaivia-modal-header flex items-center justify-between gap-4">
        <div>
          <p className="vaivia-modal-eyebrow">{item ? "Itinerary" : "Quick add"}</p>
          <h1 className="vaivia-modal-title">{item ? "Edit itinerary item" : "Add itinerary item"}</h1>
        </div>
        <button type="button" onClick={onCancel} className="vaivia-modal-close" aria-label="Close itinerary editor">×</button>
      </div>
      <form onSubmit={submit} className="space-y-5 p-5 sm:p-6">
        {errorMessage ? <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">{errorMessage}</div> : null}
        <div>
          <label htmlFor="itinerary-title" className={LABEL_CLASS}>Title</label>
          <input id="itinerary-title" name="title" required defaultValue={item?.title || ""} placeholder="Museum tickets" className={FIELD_CLASS} aria-describedby={fieldErrors?.title ? "itinerary-title-error" : undefined} />
          {fieldErrors?.title ? <p id="itinerary-title-error" className="mt-1 text-xs text-red-200">{fieldErrors.title[0]}</p> : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label htmlFor="itinerary-date" className={LABEL_CLASS}>Date</label><input id="itinerary-date" name="item_date" type="date" required defaultValue={item?.item_date || defaultDate} className={FIELD_CLASS} /></div>
          <div><label htmlFor="itinerary-end-date" className={LABEL_CLASS}>End date, optional</label><input id="itinerary-end-date" name="end_date" type="date" defaultValue={item?.end_date || ""} className={FIELD_CLASS} /></div>
          <div><label htmlFor="itinerary-start-time" className={LABEL_CLASS}>Start time, optional</label><input id="itinerary-start-time" name="start_time" type="time" defaultValue={item?.start_time?.slice(0, 5) || ""} className={FIELD_CLASS} /></div>
          <div><label htmlFor="itinerary-end-time" className={LABEL_CLASS}>End time, optional</label><input id="itinerary-end-time" name="end_time" type="time" defaultValue={item?.end_time?.slice(0, 5) || ""} className={FIELD_CLASS} /></div>
          <div><label htmlFor="itinerary-category" className={LABEL_CLASS}>Category</label><select id="itinerary-category" name="category_id" defaultValue={selectedCategory} className={FIELD_CLASS}>{categories.length ? categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>) : <option value="">Other</option>}</select></div>
          <div><label htmlFor="itinerary-status" className={LABEL_CLASS}>Status</label><select id="itinerary-status" name="status" defaultValue={item?.status || "tentative"} className={FIELD_CLASS}><option value="tentative">Tentative</option><option value="confirmed">Confirmed</option></select></div>
        </div>
        <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.05] p-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Who can see this?</h2>
          <select name="audience_mode" defaultValue={item?.audience_mode || "everyone"} className={FIELD_CLASS}><option value="everyone">Everyone on this trip</option><option value="custom">Selected people</option><option value="just_me">Just me</option></select>
          {audienceOptions.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{audienceOptions.map((option) => <label key={`${option.kind}:${option.id}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm"><input type="checkbox" name="audience_participant" value={`${option.kind}:${option.id}`} defaultChecked={selectedAudience.has(`${option.kind}:${option.id}`)} /> <span>{option.label}{option.isCurrentUser ? " (you)" : ""}</span></label>)}</div> : null}
        </section>
        <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.05] p-4">
          <h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Expenses</h2>
          <p className={HELP_CLASS}>Add a cost now to link this event directly to the trip expense tracker.</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_10rem]"><div><label htmlFor="itinerary-cost" className={LABEL_CLASS}>Amount, optional</label><input id="itinerary-cost" name="cost" inputMode="decimal" min="0" defaultValue={item?.cost ?? ""} placeholder="0.00" className={FIELD_CLASS} /></div><div><label htmlFor="itinerary-currency" className={LABEL_CLASS}>Currency</label><select id="itinerary-currency" name="currency" defaultValue={item?.currency || "CAD"} className={FIELD_CLASS}>{["CAD", "USD", "EUR", "GBP", "AUD", "JPY"].map((currency) => <option key={currency}>{currency}</option>)}</select></div></div>
          <label htmlFor="itinerary-split" className={`${LABEL_CLASS} mt-4 block`}>Split</label><select id="itinerary-split" name="split_method" defaultValue="just_me" className={FIELD_CLASS}><option value="just_me">Just me</option><option value="equal">Split equally</option></select>
        </section>
        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.06] p-4 text-sm text-slate-300"><input type="checkbox" name="is_private" defaultChecked={Boolean(item?.is_private)} className="mt-1 h-4 w-4" /><span><span className="flex items-center gap-2 font-semibold text-white"><Lock className="h-4 w-4" aria-hidden="true" />Private</span><span className="mt-1 block text-xs text-slate-400">Mark this item as visible only to you.</span></span></label>
        <div><label htmlFor="itinerary-location" className={LABEL_CLASS}>Location</label><input id="itinerary-location" name="location" defaultValue={item?.location || ""} placeholder="Venue or address" className={FIELD_CLASS} /><input type="hidden" name="formatted_address" value={item?.formatted_address || ""} /></div>
        <div><label htmlFor="itinerary-timezone" className={LABEL_CLASS}>Time zone</label><input id="itinerary-timezone" name="timezone" defaultValue={item?.timezone || defaultTimezone} className={FIELD_CLASS} /><p className={HELP_CLASS}>Use an IANA time zone, such as America/Toronto.</p></div>
        <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="itinerary-location-url" className={LABEL_CLASS}>Location website</label><input id="itinerary-location-url" name="location_website" type="url" defaultValue={item?.location_website || ""} placeholder="https://venue.com" className={FIELD_CLASS} /></div><div><label htmlFor="itinerary-ticket-url" className={LABEL_CLASS}>Ticket website</label><input id="itinerary-ticket-url" name="ticket_website" type="url" defaultValue={item?.ticket_website || item?.url || ""} placeholder="https://tickets.example" className={FIELD_CLASS} /></div></div>
        <section className="rounded-[1.25rem] border border-white/10 bg-white/[0.05] p-4"><div className="flex items-center gap-2"><ImagePlus className="h-4 w-4 text-lime-200" aria-hidden="true" /><h2 className="text-sm font-black uppercase tracking-wide text-slate-200">Cover photo, optional</h2></div>{item?.cover_image_url ? <img src={item.cover_image_url} alt="Current itinerary cover" className="mt-3 aspect-video w-full rounded-xl object-cover" /> : null}<label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-bold"><UploadCloud className="h-4 w-4" aria-hidden="true" />Upload photo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => onCoverSelected?.(event.target.files?.[0] || null)} /></label><p className={HELP_CLASS}>JPEG, PNG, or WebP. Maximum 10 MB.</p></section>
        <div><label htmlFor="itinerary-notes" className={LABEL_CLASS}>Notes</label><textarea id="itinerary-notes" name="notes" rows={4} defaultValue={item?.notes || ""} placeholder="Booking details, reminders, confirmation numbers..." className={FIELD_CLASS} /></div>
        <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-5 sm:flex-row sm:justify-between"><div>{onDelete ? <button type="button" onClick={onDelete} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-bold text-red-100"><Trash2 className="h-4 w-4" aria-hidden="true" />Delete</button> : null}</div><div className="flex gap-2"><button type="button" onClick={onCancel} className="rounded-xl border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-bold">Cancel</button><button type="submit" disabled={isSubmitting} className="rounded-xl bg-lime-300 px-5 py-2 text-sm font-black text-slate-950 disabled:opacity-60">{isSubmitting ? "SAVING…" : "SAVE"}</button></div></div>
        {footer}
      </form>
    </section>
  );
}
