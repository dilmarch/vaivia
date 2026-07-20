import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/emailImportInbound.ts", import.meta.url), "utf8")
    .replace('import "server-only";', "");

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
});

const {
    extractInboundRecipientToken,
    getInboundRecipientCandidates,
    maskEmailAddress,
    normalizeEmailAddress,
} = cjsModule.exports;

const token = "a".repeat(48);
const domain = "inbound.thetravellinglinguist.com";

assert.equal(
    normalizeEmailAddress("Dill <Trips+ABC@example.com>"),
    "trips+abc@example.com"
);

const validMatch = extractInboundRecipientToken(
    ` trips+${token}@INBOUND.THETRAVELLINGLINGUIST.COM `,
    domain
);
assert.equal(validMatch?.address, `trips+${token}@${domain}`);
assert.equal(validMatch?.token, token);

const usernameAlias = "dill_travels-a2.abc123def456";
const usernameMatch = extractInboundRecipientToken(
    `${usernameAlias}@${domain}`,
    domain
);
assert.equal(usernameMatch?.address, `${usernameAlias}@${domain}`);
assert.equal(usernameMatch?.token, usernameAlias);

assert.equal(
    extractInboundRecipientToken(`hello+${token}@${domain}`, domain),
    null
);

assert.equal(
    extractInboundRecipientToken(`trips+${token}@example.com`, domain),
    null
);

assert.equal(
    extractInboundRecipientToken(`trips+${"z".repeat(48)}@${domain}`, domain),
    null
);

assert.equal(extractInboundRecipientToken(`dill.abc123@${domain}`, domain), null);
assert.equal(
    extractInboundRecipientToken(`dill..abc123def456@${domain}`, domain),
    null
);
assert.equal(
    extractInboundRecipientToken(`dill.abc123def456@other.example`, domain),
    null
);

const candidates = Array.from(
    getInboundRecipientCandidates({
        received_for: [`trips+${token}@${domain}`],
        to: [`Trips+${token}@${domain}`, "person@example.com"],
        cc: null,
        bcc: [],
    })
);
assert.deepEqual(
    candidates,
    [`trips+${token}@${domain}`, "person@example.com"]
);

assert.equal(maskEmailAddress("Trips+abcdef@example.com"), "tr***@example.com");

console.log("email import inbound helper tests passed");
