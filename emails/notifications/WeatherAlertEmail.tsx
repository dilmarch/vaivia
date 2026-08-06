import { Heading, Link, Section, Text } from "@react-email/components";
import { VaiviaEmailButton } from "../components/VaiviaEmailButton";
import {
    VaiviaEmailLayout,
    vaiviaEmailColors,
} from "../components/VaiviaEmailLayout";

export type WeatherAlertEmailProps = {
    appUrl: string;
    tripName: string;
    location: string;
    eventWindow: string;
    eventTitle: string;
    relevance: string;
    sourceName: string;
    sourceUrl?: string;
    actionUrl: string;
};

export function WeatherAlertEmail({
    appUrl,
    tripName,
    location,
    eventWindow,
    eventTitle,
    relevance,
    sourceName,
    sourceUrl,
    actionUrl,
}: WeatherAlertEmailProps) {
    return (
        <VaiviaEmailLayout
            appUrl={appUrl}
            preview={`${eventTitle} may affect ${tripName}`}
        >
            <Text style={eyebrowStyle}>Weather alert</Text>
            <Heading as="h1" style={headingStyle}>
                {eventTitle}
            </Heading>
            <Text style={bodyStyle}>
                This may affect <strong>{tripName}</strong>. Review the latest
                information before changing plans.
            </Text>
            <Section style={detailStyle}>
                <Text style={detailLineStyle}>
                    <strong>Location:</strong> {location}
                </Text>
                <Text style={detailLineStyle}>
                    <strong>When:</strong> {eventWindow}
                </Text>
                <Text style={detailLineStyle}>
                    <strong>Why it matters:</strong> {relevance}
                </Text>
                <Text style={detailLineStyle}>
                    <strong>Source:</strong>{" "}
                    {sourceUrl ? (
                        <Link href={sourceUrl} style={linkStyle}>
                            {sourceName}
                        </Link>
                    ) : (
                        sourceName
                    )}
                </Text>
            </Section>
            <VaiviaEmailButton href={actionUrl}>Review plans</VaiviaEmailButton>
            <Text style={attributionStyle}>
                Source: Includes weather data from Google
            </Text>
            <Text style={safetyStyle}>
                Weather notifications may be delayed or unavailable. VAIVIA does
                not replace official emergency alerts; follow local authorities.
            </Text>
        </VaiviaEmailLayout>
    );
}

const eyebrowStyle = {
    margin: 0,
    color: vaiviaEmailColors.neon,
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "0.22em",
    textTransform: "uppercase" as const,
};
const headingStyle = {
    margin: "10px 0 0",
    color: vaiviaEmailColors.text,
    fontSize: "32px",
    lineHeight: "38px",
    fontWeight: 900,
};
const bodyStyle = {
    margin: "16px 0 0",
    color: vaiviaEmailColors.muted,
    fontSize: "16px",
    lineHeight: "26px",
};
const detailStyle = {
    margin: "24px 0",
    padding: "18px",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.1)",
    backgroundColor: vaiviaEmailColors.panel,
};
const detailLineStyle = {
    margin: "0 0 10px",
    color: vaiviaEmailColors.text,
    fontSize: "14px",
    lineHeight: "22px",
};
const linkStyle = { color: vaiviaEmailColors.neon, textDecoration: "none" };
const attributionStyle = {
    margin: "20px 0 0",
    color: vaiviaEmailColors.dim,
    fontSize: "12px",
    lineHeight: "20px",
};
const safetyStyle = {
    margin: "8px 0 0",
    color: vaiviaEmailColors.dim,
    fontSize: "12px",
    lineHeight: "20px",
};
