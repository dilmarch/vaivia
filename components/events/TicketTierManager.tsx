"use client";

import { useActionState } from "react";
import {
  saveTicketTier,
  type EventActionState,
} from "@/app/organizer/events/actions";
import { formatEventMoney } from "@/lib/events/format";
import type { EventTicketType } from "@/lib/events/types";

const initial: EventActionState = { ok: false, message: "" };

export default function TicketTierManager({
  eventId,
  tiers,
}: {
  eventId: string;
  tiers: EventTicketType[];
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section className="space-y-4">
        {tiers.map((tier) => (
          <article
            key={tier.id}
            className="rounded-[1.75rem] border border-white/10 bg-[#080511] p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">{tier.name}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  {tier.price_minor
                    ? formatEventMoney(tier.price_minor, tier.currency)
                    : "Free"}{" "}
                  · {tier.quantity_sold} sold · {tier.quantity_held} held ·{" "}
                  {tier.total_quantity} total
                </p>
              </div>
              <span className="rounded-full bg-white/[0.07] px-3 py-1 text-[10px] font-black uppercase text-slate-300">
                {tier.state}
              </span>
            </div>
            <details className="mt-4 border-t border-white/10 pt-4">
              <summary className="cursor-pointer text-sm font-black text-lime-200">
                Edit tier
              </summary>
              <EditTierForm eventId={eventId} tier={tier} />
            </details>
            {tier.state !== "archived" ? (
              <form
                action={async (formData) => {
                  formData.set("event_id", eventId);
                  formData.set("ticket_type_id", tier.id);
                  formData.set("name", tier.name);
                  formData.set("description", tier.description || "");
                  formData.set("price", String(tier.price_minor / 100));
                  formData.set("currency", tier.currency);
                  formData.set("total_quantity", String(tier.total_quantity));
                  formData.set("min_per_order", String(tier.min_per_order));
                  formData.set("max_per_order", String(tier.max_per_order));
                  formData.set("display_order", String(tier.display_order));
                  formData.set("state", "archived");
                  await saveTicketTier(initial, formData);
                }}
                className="mt-4"
              >
                <button
                  className="text-xs font-black text-red-200"
                  onClick={(e) => {
                    if (
                      !confirm(
                        "Archive this tier? Existing orders and tickets will remain.",
                      )
                    )
                      e.preventDefault();
                  }}
                >
                  Archive tier
                </button>
              </form>
            ) : null}
          </article>
        ))}
        {!tiers.length ? (
          <p className="rounded-[1.75rem] border border-dashed border-white/15 p-6 text-sm font-semibold text-slate-400">
            No ticket tiers yet.
          </p>
        ) : null}
      </section>
      <NewTierForm eventId={eventId} />
    </div>
  );
}

function EditTierForm({
  eventId,
  tier,
}: {
  eventId: string;
  tier: EventTicketType;
}) {
  const [state, action, pending] = useActionState(saveTicketTier, initial);
  const input =
    "mt-1 h-11 w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-sm font-bold text-white";
  return (
    <form action={action} className="mt-4 grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="event_id" value={eventId} />
      <input type="hidden" name="ticket_type_id" value={tier.id} />
      <label className="text-xs font-black text-lime-200">
        Name
        <input
          name="name"
          required
          defaultValue={tier.name}
          className={input}
        />
      </label>
      <label className="text-xs font-black text-lime-200">
        State
        <select name="state" defaultValue={tier.state} className={input}>
          <option value="active">Active</option>
          <option value="hidden">Hidden</option>
          <option value="sold_out">Sold out</option>
          <option value="archived">Archived</option>
        </select>
      </label>
      <label className="sm:col-span-2 text-xs font-black text-lime-200">
        Description
        <textarea
          name="description"
          rows={3}
          defaultValue={tier.description || ""}
          className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-sm text-white"
        />
      </label>
      <label className="text-xs font-black text-lime-200">
        Price
        <input
          name="price"
          type="number"
          step="0.01"
          min="0"
          defaultValue={tier.price_minor / 100}
          className={input}
        />
      </label>
      <label className="text-xs font-black text-lime-200">
        Currency
        <input
          name="currency"
          defaultValue={tier.currency}
          maxLength={3}
          className={input}
        />
      </label>
      <label className="text-xs font-black text-lime-200">
        Sales start
        <input
          name="sales_start_at"
          type="datetime-local"
          defaultValue={tier.sales_start_at?.slice(0, 16) || ""}
          className={input}
        />
      </label>
      <label className="text-xs font-black text-lime-200">
        Sales end
        <input
          name="sales_end_at"
          type="datetime-local"
          defaultValue={tier.sales_end_at?.slice(0, 16) || ""}
          className={input}
        />
      </label>
      <label className="text-xs font-black text-lime-200">
        Quantity
        <input
          name="total_quantity"
          type="number"
          min={Math.max(1, tier.quantity_sold + tier.quantity_held)}
          required
          defaultValue={tier.total_quantity}
          className={input}
        />
      </label>
      <label className="text-xs font-black text-lime-200">
        Min/order
        <input
          name="min_per_order"
          type="number"
          min="1"
          defaultValue={tier.min_per_order}
          className={input}
        />
      </label>
      <label className="text-xs font-black text-lime-200">
        Max/order
        <input
          name="max_per_order"
          type="number"
          min="1"
          defaultValue={tier.max_per_order}
          className={input}
        />
      </label>
      <label className="text-xs font-black text-lime-200">
        Max/customer
        <input
          name="max_per_customer"
          type="number"
          min="1"
          defaultValue={tier.max_per_customer || ""}
          className={input}
        />
      </label>
      <label className="sm:col-span-2 text-xs font-black text-lime-200">
        Attendee instructions
        <textarea
          name="attendee_instructions"
          rows={3}
          defaultValue={tier.attendee_instructions || ""}
          className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-sm text-white"
        />
      </label>
      <input type="hidden" name="display_order" value={tier.display_order} />
      {state.message ? (
        <p
          role="status"
          className={
            "sm:col-span-2 text-sm font-bold " +
            (state.ok ? "text-lime-200" : "text-red-200")
          }
        >
          {state.message}
        </p>
      ) : null}
      <button
        disabled={pending}
        className="sm:col-span-2 rounded-full bg-lime-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save tier"}
      </button>
    </form>
  );
}

function NewTierForm({ eventId }: { eventId: string }) {
  const [state, action, pending] = useActionState(saveTicketTier, initial);
  const input =
    "mt-1 h-11 w-full rounded-xl border border-white/15 bg-slate-950 px-3 text-sm font-bold text-white";
  return (
    <form
      action={action}
      className="h-fit rounded-[1.75rem] border border-white/10 bg-[#080511] p-5"
    >
      <input type="hidden" name="event_id" value={eventId} />
      <h2 className="text-xl font-black">Add ticket tier</h2>
      <label className="mt-4 block text-xs font-black text-lime-200">
        Name
        <input name="name" required className={input} />
      </label>
      <label className="mt-3 block text-xs font-black text-lime-200">
        Description
        <textarea
          name="description"
          rows={3}
          className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-sm text-white"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs font-black text-lime-200">
          Price
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue="0"
            className={input}
          />
        </label>
        <label className="text-xs font-black text-lime-200">
          Currency
          <input
            name="currency"
            defaultValue="CAD"
            maxLength={3}
            className={input}
          />
        </label>
        <label className="text-xs font-black text-lime-200">
          Quantity
          <input
            name="total_quantity"
            type="number"
            min="1"
            required
            className={input}
          />
        </label>
        <label className="text-xs font-black text-lime-200">
          Min/order
          <input
            name="min_per_order"
            type="number"
            min="1"
            defaultValue="1"
            className={input}
          />
        </label>
        <label className="text-xs font-black text-lime-200">
          Max/order
          <input
            name="max_per_order"
            type="number"
            min="1"
            defaultValue="10"
            className={input}
          />
        </label>
        <label className="text-xs font-black text-lime-200">
          Max/customer
          <input
            name="max_per_customer"
            type="number"
            min="1"
            className={input}
          />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-xs font-black text-lime-200">
          Sales start
          <input
            name="sales_start_at"
            type="datetime-local"
            className={input}
          />
        </label>
        <label className="text-xs font-black text-lime-200">
          Sales end
          <input name="sales_end_at" type="datetime-local" className={input} />
        </label>
      </div>
      <label className="mt-3 block text-xs font-black text-lime-200">
        Attendee instructions
        <textarea
          name="attendee_instructions"
          rows={3}
          className="mt-1 w-full rounded-xl border border-white/15 bg-slate-950 p-3 text-sm text-white"
        />
      </label>
      <input type="hidden" name="display_order" value={String(Date.now())} />
      <input type="hidden" name="state" value="active" />
      {state.message ? (
        <p className="mt-3 text-sm font-bold text-lime-200">{state.message}</p>
      ) : null}
      <button
        disabled={pending}
        className="mt-4 w-full rounded-full bg-lime-300 px-4 py-3 text-sm font-black text-slate-950 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Add tier"}
      </button>
    </form>
  );
}
