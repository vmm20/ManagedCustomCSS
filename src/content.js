
requestDomainRules();

var currentCSS;

// Listen for policy change notifications from background script, and request new rules accordingly
chrome.runtime.onMessage.addListener(requestDomainRules)

// Request a style update for the current frame
function requestDomainRules() {
    chrome.runtime.sendMessage({
        what: "rules",
        data: {
            "hostname": window.location.hostname,
            "oldRules": currentCSS
        }
    }, function (response) {
        currentCSS = response.newRules;
    })
}