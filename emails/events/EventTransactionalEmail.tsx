import { Heading, Hr, Link, Section, Text } from "@react-email/components";
import { VaiviaEmailButton } from "@/emails/components/VaiviaEmailButton";
import {
  VaiviaEmailLayout,
  vaiviaEmailColors,
} from "@/emails/components/VaiviaEmailLayout";

type EventEmailProps = {
  appUrl: string;
  eyebrow: string;
  title: string;
  preview: string;
  body: string;
  actionUrl?: string;
  actionLabel?: string;
  detailLines?: string[];
  amountLabel?: string | null;
  contactEmail?: string | null;
  refundPolicy?: string | null;
};

export function EventTransactionalEmail({
  appUrl,
  eyebrow,
  title,
  preview,
  body,
  actionUrl,
  actionLabel,
  detailLines = [],
  amountLabel,
  contactEmail,
  refundPolicy,
}: EventEmailProps) {
  return (
    <VaiviaEmailLayout appUrl={appUrl} preview={preview}>
      <Text
        style={{
          margin: 0,
          color: vaiviaEmailColors.neon,
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </Text>
      <Heading
        style={{
          margin: "10px 0 0",
          color: vaiviaEmailColors.text,
          fontSize: 34,
          lineHeight: "39px",
          fontWeight: 900,
        }}
      >
        {title}
      </Heading>
      <Text
        style={{
          color: vaiviaEmailColors.muted,
          fontSize: 16,
          lineHeight: "26px",
        }}
      >
        {body}
      </Text>
      {detailLines.length || amountLabel ? (
        <Section
          style={{
            margin: "22px 0",
            padding: 18,
            borderRadius: 20,
            backgroundColor: vaiviaEmailColors.panel,
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          {detailLines.map((line) => (
            <Text
              key={line}
              style={{
                margin: "4px 0",
                color: vaiviaEmailColors.text,
                fontSize: 14,
                lineHeight: "22px",
                fontWeight: 700,
              }}
            >
              {line}
            </Text>
          ))}
          {amountLabel ? (
            <Text
              style={{
                margin: "12px 0 0",
                color: vaiviaEmailColors.neon,
                fontSize: 18,
                fontWeight: 900,
              }}
            >
              {amountLabel}
            </Text>
          ) : null}
        </Section>
      ) : null}
      {actionUrl && actionLabel ? (
        <VaiviaEmailButton href={actionUrl}>{actionLabel}</VaiviaEmailButton>
      ) : null}
      {contactEmail || refundPolicy ? (
        <Hr
          style={{ margin: "24px 0", borderColor: "rgba(255,255,255,0.1)" }}
        />
      ) : null}
      {contactEmail ? (
        <Text style={{ color: vaiviaEmailColors.dim, fontSize: 12 }}>
          Organizer contact:{" "}
          <Link
            href={`mailto:${contactEmail}`}
            style={{ color: vaiviaEmailColors.neon }}
          >
            {contactEmail}
          </Link>
        </Text>
      ) : null}
      {refundPolicy ? (
        <Text
          style={{
            color: vaiviaEmailColors.dim,
            fontSize: 12,
            lineHeight: "19px",
          }}
        >
          Refund policy: {refundPolicy}
        </Text>
      ) : null}
    </VaiviaEmailLayout>
  );
}
