import {
    Body,
    Container,
    Head,
    Hr,
    Html,
    Link,
    Preview,
    Section,
    Text,
} from "@react-email/components";
import type { ReactNode } from "react";

type VaiviaEmailLayoutProps = {
    preview: string;
    children: ReactNode;
    appUrl: string;
};

const colors = {
    page: "#070411",
    card: "#101522",
    panel: "#151b2a",
    border: "rgba(190, 242, 100, 0.25)",
    text: "#f8fafc",
    muted: "#cbd5e1",
    dim: "#94a3b8",
    neon: "#bef264",
};

export function VaiviaEmailLayout({
    preview,
    children,
    appUrl,
}: VaiviaEmailLayoutProps) {
    return (
        <Html>
            <Head />
            <Preview>{preview}</Preview>
            <Body
                style={{
                    margin: 0,
                    backgroundColor: colors.page,
                    color: colors.text,
                    fontFamily:
                        "Arial, Helvetica, -apple-system, BlinkMacSystemFont, sans-serif",
                }}
            >
                <Container
                    style={{
                        width: "100%",
                        maxWidth: "600px",
                        margin: "0 auto",
                        padding: "32px 18px",
                    }}
                >
                    <Section
                        style={{
                            border: `1px solid ${colors.border}`,
                            borderRadius: "28px",
                            backgroundColor: colors.card,
                            overflow: "hidden",
                        }}
                    >
                        <Section
                            style={{
                                padding: "28px 28px 20px",
                                backgroundColor: "#090715",
                                borderBottom: "1px solid rgba(255,255,255,0.08)",
                            }}
                        >
                            <Text
                                style={{
                                    margin: 0,
                                    color: colors.neon,
                                    fontSize: "13px",
                                    fontWeight: 900,
                                    letterSpacing: "0.28em",
                                    textTransform: "uppercase",
                                }}
                            >
                                VAIVIA
                            </Text>
                            <Text
                                style={{
                                    margin: "10px 0 0",
                                    color: colors.muted,
                                    fontSize: "14px",
                                    lineHeight: "22px",
                                }}
                            >
                                Travel plans, tiny sparks, and the occasional very useful
                                nudge.
                            </Text>
                        </Section>
                        <Section style={{ padding: "28px" }}>{children}</Section>
                    </Section>
                    <Section style={{ padding: "18px 8px 0" }}>
                        <Text
                            style={{
                                margin: 0,
                                color: colors.dim,
                                fontSize: "12px",
                                lineHeight: "20px",
                                textAlign: "center",
                            }}
                        >
                            You received this because email notifications are enabled for
                            this activity in VAIVIA.
                        </Text>
                        <Text
                            style={{
                                margin: "8px 0 0",
                                color: colors.dim,
                                fontSize: "12px",
                                lineHeight: "20px",
                                textAlign: "center",
                            }}
                        >
                            <Link
                                href={`${appUrl}/settings?section=notifications`}
                                style={{ color: colors.neon, textDecoration: "none" }}
                            >
                                Manage notification preferences
                            </Link>
                        </Text>
                        <Hr style={{ borderColor: "rgba(255,255,255,0.08)" }} />
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

export { colors as vaiviaEmailColors };
