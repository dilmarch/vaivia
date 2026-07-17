import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
    new URL("../lib/authConfirmRedirect.ts", import.meta.url),
    "utf8"
);

const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
    },
}).outputText;

const cjsModule = { exports: {} };
vm.runInNewContext(transpiled, {
    module: cjsModule,
    exports: cjsModule.exports,
    URL,
});

const {
    getAlreadyConfirmedAuthRedirect,
    getMissingTokenAuthenticatedRedirect,
    normalizeAuthConfirmNext,
} = cjsModule.exports;

const origin = "https://app.thetravellinglinguist.com";

assert.equal(normalizeAuthConfirmNext("/", origin), "/");
assert.equal(normalizeAuthConfirmNext("/settings", origin), "/settings");
assert.equal(
    normalizeAuthConfirmNext(
        new URL(
            `${origin}/auth/confirm?next=${encodeURIComponent(
                "https://app.thetravellinglinguist.com/settings?tab=profile#details"
            )}`
        ).searchParams.get("next"),
        origin
    ),
    "/settings?tab=profile#details"
);
assert.equal(
    normalizeAuthConfirmNext("/auth/confirm?next=/", origin),
    "/"
);
assert.equal(
    normalizeAuthConfirmNext("https://evil.example/settings", origin),
    "/"
);
assert.equal(normalizeAuthConfirmNext("//evil.example/settings", origin), "/");

const confirmedUser = {
    id: "user_123",
    email_confirmed_at: "2026-07-17T00:00:00.000Z",
};
const consumedOtpError = {
    code: "otp_expired",
    message: "Email link is invalid or has expired",
    status: 403,
};

assert.equal(
    getAlreadyConfirmedAuthRedirect({
        error: consumedOtpError,
        user: confirmedUser,
    }),
    "/"
);
assert.equal(
    getAlreadyConfirmedAuthRedirect({
        error: consumedOtpError,
        user: { id: "user_123", email_confirmed_at: null },
    }),
    null
);
assert.equal(getMissingTokenAuthenticatedRedirect(confirmedUser), "/");

console.log("auth confirm redirect tests passed");
