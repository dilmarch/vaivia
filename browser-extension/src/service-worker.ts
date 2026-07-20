chrome.runtime.onInstalled.addListener(() => {
    void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== "VAIVIA_REVIEW_CONFIRMATION" || !message.capture) return;

    void chrome.storage.session
        .set({ vaiviaPendingCapture: message.capture })
        .then(() => {
            if (sender.tab?.id) return chrome.sidePanel.open({ tabId: sender.tab.id });
            if (sender.tab?.windowId) return chrome.sidePanel.open({ windowId: sender.tab.windowId });
        });
});
