import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type {
  MobileStayMutationInput,
  MobileTransportationMutationInput,
  MobileTripStaysData,
} from "@/lib/mobileApi/contracts";
import { MobilePlaceAutocomplete } from "./MobilePlaceAutocomplete";
import type { MobileApiClient } from "../lib/apiClient";

const inputClass = "w-full rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-lime-300/60";
const labelClass = "text-xs font-black uppercase tracking-[0.16em] text-lime-200";

function text(form: FormData, name: string) { return String(form.get(name) || "").trim(); }
function optionalNumber(form: FormData, name: string) { const value = text(form, name); return value ? Number(value) : null; }
function participantInput(form: FormData) {
  return {
    memberIds: form.getAll("memberIds").map(String),
    invitationIds: form.getAll("invitationIds").map(String),
    familyMemberIds: form.getAll("familyMemberIds").map(String),
  };
}

function EditorShell({ title, error, isSubmitting, onCancel, onDelete, children }: { title: string; error: string; isSubmitting: boolean; onCancel: () => void; onDelete?: () => void; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl px-4 pb-8" aria-labelledby="travel-editor-title">
      <div className="rounded-[2rem] border border-lime-300/20 bg-[#080511]/95 p-5 text-white shadow-2xl shadow-black/50 backdrop-blur-xl sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-lime-200">Trip planning</p><h2 id="travel-editor-title" className="mt-2 text-3xl font-black tracking-tight">{title}</h2></div>
          <button type="button" onClick={onCancel} className="rounded-full border border-white/10 bg-white/[0.08] px-4 py-2 text-sm font-black">Cancel</button>
        </div>
        {error ? <p role="alert" className="mb-5 rounded-2xl border border-red-300/30 bg-red-950/70 p-4 text-sm font-bold text-red-100">{error}</p> : null}
        {children}
        {onDelete ? <button type="button" disabled={isSubmitting} onClick={onDelete} className="mt-5 w-full rounded-full border border-red-300/30 bg-red-500/10 px-5 py-3 text-sm font-black text-red-100 disabled:opacity-50">Delete</button> : null}
      </div>
    </section>
  );
}

function AudienceFields({ stays, selected = [] }: { stays?: MobileTripStaysData; selected?: string[] }) {
  if (!stays?.audienceOptions.length) return null;
  return (
    <fieldset className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
      <legend className={labelClass}>Assigned travelers</legend>
      {stays.audienceOptions.map((option) => {
        const name = option.kind === "member" ? "memberIds" : option.kind === "invitation" ? "invitationIds" : option.kind === "family_member" ? "familyMemberIds" : "guestNames";
        return <label key={`${option.kind}:${option.id}`} className="flex min-h-11 items-center gap-3 text-sm font-bold"><input type="checkbox" name={name} value={option.id} defaultChecked={selected.includes(`${option.kind}:${option.id}`)} className="h-5 w-5 accent-lime-300" />{option.displayName}</label>;
      })}
    </fieldset>
  );
}

export function MobileTransportEditor({ apiClient, tripId, itemId, stays, onSaved, onCancel }: { apiClient: MobileApiClient; tripId: string; itemId?: string; stays?: MobileTripStaysData; onSaved: () => void; onCancel: () => void }) {
  const [item, setItem] = useState<Record<string, unknown> | null>(itemId ? null : {});
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");
  const [departurePlace, setDeparturePlace] = useState<{ placeId: string; address: string | null; latitude: number; longitude: number } | null>(null);
  const [arrivalPlace, setArrivalPlace] = useState<{ placeId: string; address: string | null; latitude: number; longitude: number } | null>(null);

  useEffect(() => {
    if (!itemId) return;
    const controller = new AbortController();
    void apiClient.getTransportation(tripId, itemId, controller.signal).then((data) => {
      setItem(data.item);
      setDeparture(String(data.item.departure_location || ""));
      setArrival(String(data.item.arrival_location || ""));
      setSelected(data.participants.map((participant) => participant.trip_member_id ? `member:${participant.trip_member_id}` : participant.invitation_id ? `invitation:${participant.invitation_id}` : participant.family_member_id ? `family_member:${participant.family_member_id}` : "").filter(Boolean));
    }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load transportation."); });
    return () => controller.abort();
  }, [apiClient, itemId, tripId]);

  const initial = useMemo(() => item || {}, [item]);
  if (!item) return <p className="px-5 py-28 text-center font-bold text-slate-300" role="status">Loading transportation…</p>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: MobileTransportationMutationInput = {
      title: text(form, "title"), transportType: text(form, "transportType"), status: text(form, "status"), transportNumber: text(form, "transportNumber"), providerName: text(form, "providerName"), reservationCode: text(form, "reservationCode"), bookingUrl: text(form, "bookingUrl"), departureDate: text(form, "departureDate"), arrivalDate: text(form, "arrivalDate"), departureTime: text(form, "departureTime"), arrivalTime: text(form, "arrivalTime"), departureLocation: departure, arrivalLocation: arrival, departureFormattedAddress: departurePlace?.address, arrivalFormattedAddress: arrivalPlace?.address, departureGooglePlaceId: departurePlace?.placeId, arrivalGooglePlaceId: arrivalPlace?.placeId, departureLat: departurePlace?.latitude, departureLng: departurePlace?.longitude, arrivalLat: arrivalPlace?.latitude, arrivalLng: arrivalPlace?.longitude, departureTimezone: text(form, "departureTimezone"), arrivalTimezone: text(form, "arrivalTimezone"), departureTerminal: text(form, "departureTerminal"), arrivalTerminal: text(form, "arrivalTerminal"), seatNumber: text(form, "seatNumber"), baggageInfo: text(form, "baggageInfo"), cost: text(form, "cost"), currency: text(form, "currency"), notes: text(form, "notes"), isPrivate: form.get("isPrivate") === "on", audienceMode: form.get("isPrivate") === "on" ? "just_me" : form.getAll("memberIds").length + form.getAll("invitationIds").length + form.getAll("familyMemberIds").length ? "custom" : "everyone", participants: participantInput(form), tripLegId: text(form, "tripLegId"),
    };
    setIsSubmitting(true); setError("");
    try {
      const options = { idempotencyKey: `${itemId ? "update" : "create"}-transport:${itemId || crypto.randomUUID()}` };
      if (itemId) await apiClient.updateTransportation(tripId, itemId, input, options); else await apiClient.createTransportation(tripId, input, options);
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save transportation."); }
    finally { setIsSubmitting(false); }
  }

  async function remove() {
    if (!itemId || !window.confirm("Delete this transportation item?")) return;
    setIsSubmitting(true); setError("");
    try { await apiClient.deleteTransportation(tripId, itemId, { idempotencyKey: `delete-transport:${itemId}` }); onSaved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete transportation."); }
    finally { setIsSubmitting(false); }
  }

  return (
    <EditorShell title={itemId ? "Edit transportation" : "Add transportation"} error={error} isSubmitting={isSubmitting} onCancel={onCancel} onDelete={itemId ? () => void remove() : undefined}>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2 sm:col-span-2"><span className={labelClass}>Title</span><input name="title" defaultValue={String(initial.title || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Type</span><select name="transportType" defaultValue={String(initial.transport_type || "flight")} className={inputClass}>{["flight","train","bus","ferry","car","rental_car","rideshare","taxi","subway","tram","walking","other"].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
        <label className="space-y-2"><span className={labelClass}>Status</span><select name="status" defaultValue={String(initial.status || "planned")} className={inputClass}>{["planned","booked","confirmed","cancelled","completed"].map((status) => <option key={status}>{status}</option>)}</select></label>
        <div className="sm:col-span-2"><MobilePlaceAutocomplete apiClient={apiClient} label="Departure" value={departure} onValueChange={setDeparture} onPlaceSelect={setDeparturePlace} required /></div>
        <div className="sm:col-span-2"><MobilePlaceAutocomplete apiClient={apiClient} label="Arrival" value={arrival} onValueChange={setArrival} onPlaceSelect={setArrivalPlace} required /></div>
        <label className="space-y-2"><span className={labelClass}>Departure date</span><input type="date" name="departureDate" required defaultValue={String(initial.departure_date || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Arrival date</span><input type="date" name="arrivalDate" defaultValue={String(initial.arrival_date || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Departure time</span><input type="time" name="departureTime" defaultValue={String(initial.departure_time || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Arrival time</span><input type="time" name="arrivalTime" defaultValue={String(initial.arrival_time || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Carrier</span><input name="providerName" defaultValue={String(initial.provider_name || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Flight / route number</span><input name="transportNumber" defaultValue={String(initial.transport_number || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Departure terminal</span><input name="departureTerminal" defaultValue={String(initial.departure_terminal || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Arrival terminal</span><input name="arrivalTerminal" defaultValue={String(initial.arrival_terminal || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Reservation code</span><input name="reservationCode" defaultValue={String(initial.reservation_code || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Seat</span><input name="seatNumber" defaultValue={String(initial.seat_number || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Cost</span><input inputMode="decimal" name="cost" defaultValue={String(initial.cost || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Currency</span><input name="currency" maxLength={3} defaultValue={String(initial.currency || "CAD")} className={inputClass} /></label>
        <AudienceFields stays={stays} selected={selected} />
        <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 p-4 sm:col-span-2"><input type="checkbox" name="isPrivate" defaultChecked={Boolean(initial.is_private)} className="h-5 w-5 accent-lime-300" /><span className="font-bold">Private to me</span></label>
        <label className="space-y-2 sm:col-span-2"><span className={labelClass}>Notes / baggage</span><textarea name="notes" rows={4} defaultValue={String(initial.notes || "")} className={inputClass} /></label>
        <button type="submit" disabled={isSubmitting} className="rounded-full bg-lime-300 px-5 py-3 font-black text-slate-950 disabled:opacity-50 sm:col-span-2">{isSubmitting ? "Saving…" : "Save transportation"}</button>
      </form>
    </EditorShell>
  );
}

export function MobileStayEditor({ apiClient, tripId, stayId, stays, planning = false, onSaved, onCancel }: { apiClient: MobileApiClient; tripId: string; stayId?: string; stays?: MobileTripStaysData; planning?: boolean; onSaved: () => void; onCancel: () => void }) {
  const [stay, setStay] = useState<Record<string, unknown> | null>(stayId ? null : {});
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [place, setPlace] = useState<{ placeId: string; address: string | null; latitude: number; longitude: number; mapsUrl: string } | null>(null);
  const [error, setError] = useState(""); const [isSubmitting, setIsSubmitting] = useState(false);
  useEffect(() => {
    if (!stayId) return;
    const controller = new AbortController();
    void apiClient.getStay(tripId, stayId, controller.signal).then((data) => { setStay(data.stay); setName(String(data.stay.hotel_name || "")); setSelected(data.participants.map((participant) => participant.trip_member_id ? `member:${participant.trip_member_id}` : participant.invitation_id ? `invitation:${participant.invitation_id}` : participant.family_member_id ? `family_member:${participant.family_member_id}` : "").filter(Boolean)); }).catch((caught: unknown) => { if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Could not load stay."); });
    return () => controller.abort();
  }, [apiClient, stayId, tripId]);
  if (!stay) return <p className="px-5 py-28 text-center font-bold text-slate-300" role="status">Loading stay…</p>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    if (!stay) return;
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const input: MobileStayMutationInput = { hotelName: name, accommodationType: text(form, "accommodationType"), status: text(form, "status"), googlePlaceId: place?.placeId || String(stay.google_place_id || ""), googleMapsUrl: place?.mapsUrl || String(stay.google_maps_url || ""), address: place?.address || text(form, "address"), latitude: place?.latitude ?? optionalNumber(form, "latitude"), longitude: place?.longitude ?? optionalNumber(form, "longitude"), checkInDate: text(form, "checkInDate"), checkOutDate: text(form, "checkOutDate"), freeCancellationEndsOn: text(form, "freeCancellationEndsOn"), checkInTimeStart: text(form, "checkInTimeStart"), checkInTimeEnd: text(form, "checkInTimeEnd"), checkOutTime: text(form, "checkOutTime"), website: text(form, "website"), bookingUrl: text(form, "bookingUrl"), isPlanningOption: planning || Boolean(stay.is_planning_option), cost: text(form, "cost"), currency: text(form, "currency"), isPrivate: form.get("isPrivate") === "on", audienceMode: form.get("isPrivate") === "on" ? "just_me" : form.getAll("memberIds").length + form.getAll("invitationIds").length + form.getAll("familyMemberIds").length ? "custom" : "everyone", participants: participantInput(form), notes: text(form, "notes") };
    setIsSubmitting(true); setError("");
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const shouldPromote = submitter instanceof HTMLButtonElement && submitter.value === "promote";
    try { const options = { idempotencyKey: `${shouldPromote ? "promote" : stayId ? "update" : "create"}-stay:${stayId || crypto.randomUUID()}` }; if (stayId && shouldPromote) await apiClient.promoteStay(tripId, stayId, input, options); else if (stayId) await apiClient.updateStay(tripId, stayId, input, options); else await apiClient.createStay(tripId, input, options); onSaved(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Could not save stay."); } finally { setIsSubmitting(false); }
  }
  async function remove() { if (!stayId || !window.confirm("Delete this stay?")) return; setIsSubmitting(true); try { await apiClient.deleteStay(tripId, stayId, { idempotencyKey: `delete-stay:${stayId}` }); onSaved(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not delete stay."); } finally { setIsSubmitting(false); } }
  return (
    <EditorShell title={stayId ? "Edit stay" : planning ? "Add stay option" : "Add stay"} error={error} isSubmitting={isSubmitting} onCancel={onCancel} onDelete={stayId ? () => void remove() : undefined}>
      <form onSubmit={(event) => void submit(event)} className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><MobilePlaceAutocomplete apiClient={apiClient} label="Hotel / stay name" value={name} onValueChange={setName} onPlaceSelect={setPlace} required /></div>
        <label className="space-y-2 sm:col-span-2"><span className={labelClass}>Address</span><textarea name="address" rows={2} defaultValue={String(stay.address || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Stay type</span><select name="accommodationType" defaultValue={String(stay.accommodation_type || "hotel")} className={inputClass}>{["hotel","motel","home_rental","hostel","friend_family","other"].map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
        <label className="space-y-2"><span className={labelClass}>Status</span><select name="status" defaultValue={String(stay.status || "tentative")} className={inputClass}>{["tentative","booked","cancelled"].map((status) => <option key={status}>{status}</option>)}</select></label>
        <label className="space-y-2"><span className={labelClass}>Check-in</span><input type="date" required name="checkInDate" defaultValue={String(stay.check_in_date || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Check-out</span><input type="date" required name="checkOutDate" defaultValue={String(stay.check_out_date || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Check-in from</span><input type="time" name="checkInTimeStart" defaultValue={String(stay.check_in_time_start || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Check-in until</span><input type="time" name="checkInTimeEnd" defaultValue={String(stay.check_in_time_end || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Check-out time</span><input type="time" name="checkOutTime" defaultValue={String(stay.check_out_time || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Free cancellation ends</span><input type="date" name="freeCancellationEndsOn" defaultValue={String(stay.free_cancellation_ends_on || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Website</span><input name="website" defaultValue={String(stay.website || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Booking link</span><input name="bookingUrl" defaultValue={String(stay.booking_url || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Cost</span><input inputMode="decimal" name="cost" defaultValue={String(stay.cost || "")} className={inputClass} /></label>
        <label className="space-y-2"><span className={labelClass}>Currency</span><input name="currency" maxLength={3} defaultValue={String(stay.currency || "CAD")} className={inputClass} /></label>
        {!planning ? <AudienceFields stays={stays} selected={selected} /> : null}
        <label className="flex min-h-12 items-center gap-3 rounded-2xl border border-white/10 p-4 sm:col-span-2"><input type="checkbox" name="isPrivate" defaultChecked={Boolean(stay.is_private)} className="h-5 w-5 accent-lime-300" /><span className="font-bold">Private to me</span></label>
        <label className="space-y-2 sm:col-span-2"><span className={labelClass}>Notes / confirmation</span><textarea name="notes" rows={4} defaultValue={String(stay.notes || "")} className={inputClass} /></label>
        <button type="submit" disabled={isSubmitting} className="rounded-full bg-lime-300 px-5 py-3 font-black text-slate-950 disabled:opacity-50 sm:col-span-2">{isSubmitting ? "Saving…" : "Save stay"}</button>
        {stayId && Boolean(stay.is_planning_option) ? <button type="submit" name="operation" value="promote" disabled={isSubmitting} className="rounded-full border border-lime-300/40 bg-lime-300/10 px-5 py-3 font-black text-lime-100 disabled:opacity-50 sm:col-span-2">Promote to planned stay</button> : null}
      </form>
    </EditorShell>
  );
}
