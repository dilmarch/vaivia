import "server-only";

import { SignJWT, importPKCS8 } from "jose";
import { PKPass } from "passkit-generator";

export function getAppleWalletStatus() {
  const required = [
    "APPLE_WALLET_PASS_TYPE_ID",
    "APPLE_WALLET_TEAM_ID",
    "APPLE_WALLET_CERTIFICATE_BASE64",
    "APPLE_WALLET_PRIVATE_KEY_BASE64",
    "APPLE_WALLET_PRIVATE_KEY_PASSWORD",
    "APPLE_WALLET_WWDR_CERTIFICATE_BASE64",
  ];
  return { configured: required.every((name) => Boolean(process.env[name])) };
}

export function getGoogleWalletStatus() {
  return {
    configured: Boolean(
      process.env.GOOGLE_WALLET_ISSUER_ID &&
      process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_WALLET_PRIVATE_KEY,
    ),
  };
}

export async function createGoogleWalletSaveUrl(input: {
  ticketId: string;
  ticketNumber: string;
  eventName: string;
  startDateTime: string;
  venueName: string;
  barcodeValue: string;
}) {
  if (!getGoogleWalletStatus().configured) return null;
  const issuerId = process.env.GOOGLE_WALLET_ISSUER_ID!;
  const serviceAccountEmail = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL!;
  const privateKeyText = process.env.GOOGLE_WALLET_PRIVATE_KEY!.replace(
    /\\n/g,
    "\n",
  );
  const key = await importPKCS8(privateKeyText, "RS256");
  const objectId = `${issuerId}.${input.ticketId.replace(/-/g, "")}`;
  const classId = `${issuerId}.vaivia_events`;
  const token = await new SignJWT({
    origins: [
      process.env.NEXT_PUBLIC_APP_URL ||
        "https://app.thetravellinglinguist.com",
    ],
    typ: "savetowallet",
    payload: {
      eventTicketObjects: [
        {
          id: objectId,
          classId,
          state: "ACTIVE",
          ticketHolderName: input.ticketNumber,
          ticketNumber: input.ticketNumber,
          eventName: {
            defaultValue: { language: "en", value: input.eventName },
          },
          venue: {
            name: { defaultValue: { language: "en", value: input.venueName } },
          },
          dateTime: { start: input.startDateTime },
          barcode: { type: "QR_CODE", value: input.barcodeValue },
        },
      ],
    },
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(serviceAccountEmail)
    .setAudience("google")
    .sign(key);
  return `https://pay.google.com/gp/v/save/${token}`;
}

export async function createAppleWalletPass(input: {
  ticketId: string;
  ticketNumber: string;
  eventName: string;
  eventDateLabel: string;
  venueName: string;
  tierName: string;
  attendeeName: string;
  barcodeValue: string;
}) {
  if (!getAppleWalletStatus().configured) return null;
  const pass = new PKPass(
    {},
    {
      wwdr: Buffer.from(
        process.env.APPLE_WALLET_WWDR_CERTIFICATE_BASE64!,
        "base64",
      ),
      signerCert: Buffer.from(
        process.env.APPLE_WALLET_CERTIFICATE_BASE64!,
        "base64",
      ),
      signerKey: Buffer.from(
        process.env.APPLE_WALLET_PRIVATE_KEY_BASE64!,
        "base64",
      ),
      signerKeyPassphrase: process.env.APPLE_WALLET_PRIVATE_KEY_PASSWORD!,
    },
    {
      formatVersion: 1,
      passTypeIdentifier: process.env.APPLE_WALLET_PASS_TYPE_ID!,
      teamIdentifier: process.env.APPLE_WALLET_TEAM_ID!,
      organizationName: "VAIVIA",
      description: input.eventName,
      serialNumber: input.ticketId,
      logoText: "VAIVIA Events",
      foregroundColor: "rgb(255,255,255)",
      backgroundColor: "rgb(12,1,21)",
      labelColor: "rgb(190,242,100)",
    },
  );
  const onePixelPng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  pass.addBuffer("icon.png", onePixelPng);
  pass.addBuffer("icon@2x.png", onePixelPng);
  pass.type = "eventTicket";
  pass.primaryFields.push({
    key: "event",
    label: "EVENT",
    value: input.eventName,
  });
  pass.secondaryFields.push(
    { key: "date", label: "DATE", value: input.eventDateLabel },
    { key: "venue", label: "VENUE", value: input.venueName },
  );
  pass.auxiliaryFields.push(
    { key: "tier", label: "TICKET", value: input.tierName },
    { key: "attendee", label: "ATTENDEE", value: input.attendeeName },
  );
  pass.backFields.push({
    key: "number",
    label: "Ticket number",
    value: input.ticketNumber,
  });
  pass.setBarcodes({
    format: "PKBarcodeFormatQR",
    message: input.barcodeValue,
    messageEncoding: "iso-8859-1",
    altText: input.ticketNumber,
  });
  return pass.getAsBuffer();
}
