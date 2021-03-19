
requestDomainRules();

// Listen for policy change notifications from background script, and request new rules accordingly
chrome.runtime.onMessage.addListener(requestDomainRules)

// Request a style update for the current frame
function requestDomainRules() {
    chrome.runtime.sendMessage({
        hostname: window.location.hostname,
    })
}