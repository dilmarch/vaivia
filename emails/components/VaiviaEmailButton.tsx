import { Button } from "@react-email/components";

type VaiviaEmailButtonProps = {
    href: string;
    children: string;
};

export function VaiviaEmailButton({ href, children }: VaiviaEmailButtonProps) {
    return (
        <Button
            href={href}
            style={{
                display: "inline-block",
                borderRadius: "999px",
                backgroundColor: "#bef264",
                color: "#020617",
                fontSize: "14px",
                fontWeight: 900,
                padding: "14px 22px",
                textDecoration: "none",
            }}
        >
            {children}
        </Button>
    );
}
