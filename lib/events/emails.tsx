import "server-only";

import { render, toPlainText } from "react-email";
import { EventTransactionalEmail } from "@/emails/events/EventTransactionalEmail";
import { getEmailSenderConfig, getResendClient } from "@/lib/email/resend";
import { formatEventDateTime, formatEventMoney } from "@/lib/events/format";

type EventEmailBase = {
  recipient: string;
  eventTitle: string;
  eventSlug?: string;
  startsAt?: string;
  timezone?: string;
  venue?: string;
  contactEmail?: string | null;
  refundPolicy?: string | null;
};

async function sendEventEmail(args: {
  to: string;
  subject: string;
  idempotencyKey: string;
  email: React.ReactElement;
}) {
  const sender = getEmailSenderConfig();
  const html = await render(args.email);
  const { error } = await getResendClient().emails.send(
    {
      from: sender.from,
      replyTo: sender.replyTo,
      to: args.to,
      subject: args.subject,
      html,
      text: toPlainText(html),
    },
    { headers: { "Idempotency-Key": args.idempotencyKey } },
  );
  if (error) throw new Error(error.message);
}

export async function sendEventInvitationEmail(
  args: EventEmailBase & { invitationToken: string; invitationId: string },
) {
  const sender = getEmailSenderConfig();
  const actionUrl = `${sender.appUrl}/events/invite/${encodeURIComponent(args.invitationToken)}`;
  await sendEventEmail({
    to: args.recipient,
    subject: "You’re invited to a VAIVIA event",
    idempotencyKey: `event-invitation-${args.invitationId}`,
    email: (
      <EventTransactionalEmail
        appUrl={sender.appUrl}
        eyebrow="Private event invitation"
        title="You’re on the guest list"
        preview="A private VAIVIA event invitation is waiting."
        body="Sign in with this email address to securely reveal and accept your invitation."
        actionUrl={actionUrl}
        actionLabel="View invitation"
      />
    ),
  });
}

export async function sendEventTicketConfirmationEmail(
  args: EventEmailBase & {
    orderId: string;
    ticketLines: string[];
    totalMinor: number;
    currency: string;
    paid: boolean;
  },
) {
  const sender = getEmailSenderConfig();
  const detailLines = [
    ...(args.startsAt
      ? [formatEventDateTime(args.startsAt, args.timezone || "UTC")]
      : []),
    ...(args.venue ? [args.venue] : []),
    ...args.ticketLines,
  ];
  await sendEventEmail({
    to: args.recipient,
    subject: `${args.paid ? "Tickets confirmed" : "Registration confirmed"}: ${args.eventTitle}`,
    idempotencyKey: `event-order-confirmation-${args.orderId}`,
    email: (
      <EventTransactionalEmail
        appUrl={sender.appUrl}
        eyebrow={args.paid ? "Purchase confirmed" : "Registration confirmed"}
        title={args.eventTitle}
        preview="Your VAIVIA event admission is ready."
        body="Your admission has been issued. Open My Events to view each ticket and its secure QR code."
        actionUrl={`${sender.appUrl}/my-events`}
        actionLabel="View my tickets"
        detailLines={detailLines}
        amountLabel={
          args.paid
            ? `Paid ${formatEventMoney(args.totalMinor, args.currency)}`
            : "Free"
        }
        contactEmail={args.contactEmail}
        refundPolicy={args.refundPolicy}
      />
    ),
  });
}

export async function sendEventStatusEmail(
  args: EventEmailBase & {
    kind: "cancelled" | "refunded" | "void";
    idempotencyKey: string;
  },
) {
  const sender = getEmailSenderConfig();
  const labels = {
    cancelled: "Event cancelled",
    refunded: "Ticket refunded",
    void: "Ticket voided",
  } as const;
  await sendEventEmail({
    to: args.recipient,
    subject: `${labels[args.kind]}: ${args.eventTitle}`,
    idempotencyKey: args.idempotencyKey,
    email: (
      <EventTransactionalEmail
        appUrl={sender.appUrl}
        eyebrow="VAIVIA Events update"
        title={labels[args.kind]}
        preview={`${labels[args.kind]} for ${args.eventTitle}`}
        body={`There is an important update for ${args.eventTitle}. Open VAIVIA for the current event and ticket status.`}
        actionUrl={`${sender.appUrl}/my-events`}
        actionLabel="Open My Events"
        contactEmail={args.contactEmail}
        refundPolicy={args.refundPolicy}
      />
    ),
  });
}
