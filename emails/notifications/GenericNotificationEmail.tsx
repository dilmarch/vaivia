import { Heading, Link, Section, Text } from "@react-email/components";
import { VaiviaEmailButton } from "../components/VaiviaEmailButton";
import {
    VaiviaEmailLayout,
    vaiviaEmailColors,
} from "../components/VaiviaEmailLayout";

type GenericNotificationEmailProps = {
    appUrl: string;
    eyebrow: string;
    title: string;
    body: string;
    actionUrl: string;
    actionLabel: string;
    preview: string;
};

export function GenericNotificationEmail({
    appUrl,
    eyebrow,
    title,
    body,
    actionUrl,
    actionLabel,
    preview,
}: GenericNotificationEmailProps) {
    return (
        <VaiviaEmailLayout appUrl={appUrl} preview={preview}>
            <Text
                style={{
                    margin: 0,
                    color: vaiviaEmailColors.neon,
                    fontSize: "12px",
                    fontWeight: 900,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                }}
            >
                {eyebrow}
            </Text>
            <Heading
                as="h1"
                style={{
                    margin: "10px 0 0",
                    color: vaiviaEmailColors.text,
                    fontSize: "34px",
                    lineHeight: "38px",
                    fontWeight: 900,
                }}
            >
                {title}
            </Heading>
            <Text
                style={{
                    margin: "16px 0 0",
                    color: vaiviaEmailColors.muted,
                    fontSize: "16px",
                    lineHeight: "26px",
                }}
            >
                {body}
            </Text>
            <Section
                style={{
                    margin: "24px 0",
                    padding: "18px",
                    borderRadius: "20px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: vaiviaEmailColors.panel,
                }}
            >
                <Text
                    style={{
                        margin: 0,
                        color: vaiviaEmailColors.text,
                        fontSize: "14px",
                        lineHeight: "22px",
                        fontWeight: 700,
                    }}
                >
                    Open VAIVIA to view the full notification and keep planning from
                    exactly where you left off.
                </Text>
            </Section>
            <VaiviaEmailButton href={actionUrl}>{actionLabel}</VaiviaEmailButton>
            <Text
                style={{
                    margin: "18px 0 0",
                    color: vaiviaEmailColors.dim,
                    fontSize: "12px",
                    lineHeight: "20px",
                }}
            >
                If the button does not work, paste this link into your browser:{" "}
                <Link
                    href={actionUrl}
                    style={{ color: vaiviaEmailColors.neon, textDecoration: "none" }}
                >
                    {actionUrl}
                </Link>
            </Text>
        </VaiviaEmailLayout>
    );
}
