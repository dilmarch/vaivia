import { extractTravelPage } from "./extractors";

declare global {
    interface Window {
        __vaiviaTravelCompanionInstalled?: boolean;
    }
}

if (!window.__vaiviaTravelCompanionInstalled) {
    window.__vaiviaTravelCompanionInstalled = true;

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (message?.type !== "VAIVIA_EXTRACT_PAGE") return false;

        try {
            sendResponse({ ok: true, capture: extractTravelPage(document, new URL(location.href)) });
        } catch (error) {
            sendResponse({
                ok: false,
                error: error instanceof Error ? error.message : "Could not read this page.",
            });
        }
        return false;
    });

    let confirmationBannerShown = false;
    let detectionAttempts = 0;

    function showConfirmationBanner() {
        if (confirmationBannerShown) return true;
        const capture = extractTravelPage(document, new URL(location.href));
        if (!capture || capture.captureKind !== "confirmed") return false;

        confirmationBannerShown = true;
        const host = document.createElement("div");
        host.id = "vaivia-confirmation-detected";
        host.style.cssText =
            "all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647;display:block";
        const shadow = host.attachShadow({ mode: "closed" });
        const wrapper = document.createElement("div");
        wrapper.innerHTML = `
            <style>
                .banner{width:min(340px,calc(100vw - 40px));overflow:hidden;border:1px solid rgba(190,242,100,.35);border-radius:22px;background:#080511;color:#f8fafc;box-shadow:0 24px 70px rgba(0,0,0,.48);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
                .top{padding:17px 18px;background:radial-gradient(circle at 0 0,rgba(190,242,100,.16),transparent 45%)}
                .eyebrow{margin:0;color:#bef264;font-size:9px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}
                h2{margin:7px 0 5px;font-size:18px;line-height:1.15}p{margin:0;color:#cbd5e1;font-size:12px;line-height:1.5}
                .actions{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.09)}
                button{min-height:38px;border-radius:999px;padding:8px 14px;border:1px solid transparent;font:900 11px Inter,ui-sans-serif,system-ui;cursor:pointer}
                .review{flex:1;background:#bef264;color:#07100a}.dismiss{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.12);color:#e2e8f0}
            </style>
            <aside class="banner" role="dialog" aria-label="VAIVIA booking detected">
                <div class="top"><p class="eyebrow">VAIVIA detected a booking</p><h2>${
                    capture.type === "hotel" ? "Add this booked stay?" : "Add this booked flight?"
                }</h2><p>Review the detected details and choose which trip receives it.</p></div>
                <div class="actions"><button class="dismiss" type="button">Not now</button><button class="review" type="button">Review in VAIVIA</button></div>
            </aside>`;
        shadow.append(wrapper);
        shadow.querySelector(".dismiss")?.addEventListener("click", () => host.remove());
        shadow.querySelector(".review")?.addEventListener("click", () => {
            void chrome.runtime.sendMessage({ type: "VAIVIA_REVIEW_CONFIRMATION", capture });
            host.remove();
        });
        document.documentElement.append(host);
        return true;
    }

    function attemptConfirmationDetection() {
        detectionAttempts += 1;
        if (showConfirmationBanner() || detectionAttempts >= 8) return;
        window.setTimeout(attemptConfirmationDetection, 1500);
    }

    window.setTimeout(attemptConfirmationDetection, 500);
}
