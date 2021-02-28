
requestDomainRules();

// Listen for policy change notifications from background script, and request new rules accordingly
chrome.runtime.onMessage.addListener(
    function (request) {
        if (request.what == "updatedPolicy")
            requestDomainRules(isUpdate=true);
    }
)

// Request a set of rules for the current hostname from the background script, and trigger a style update
function requestDomainRules(isUpdate=false) {
    console.info(`Requesting ${isUpdate ? "updated " : ""}domain rules for ${window.location.hostname}`)
    chrome.runtime.sendMessage({
        what: "rules",
        data: {
            "hostname": window.location.hostname
        }
    }, function (response) {
        console.log(`Received response from background script`, response)
        if (response?.hostname == window.location.hostname)
            updateStyleElement(response.domainRules);
    })
}

// Modify the webpage CSS by adding a <style> element (inside the <head> element) with the rules
function updateStyleElement(rules, stylesheetId="managed-custom-css-extension-stylesheet") {

    // remove any existing stylesheet created by the extension
    document.getElementById(stylesheetId)?.remove()

    // if rules object is empty, then log 'inactive' and do not create a new <style> tag
    if (!Object.keys(rules).length) {
        console.info(`Managed Custom CSS is inactive on this domain: ${window.location.hostname}`);
        return;
    }

    // if rules object is nonempty, proceed with creating a style tag
    console.info(`Managed Custom CSS is active on this domain: ${window.location.hostname}`);
    let style = document.createElement("style");
    style.setAttribute("id", stylesheetId);

    // for each rule, append syntactically correct CSS to the style element
    for (let [selector, declarations] of Object.entries(rules)) {
        let ruleToAppend = `${selector} /**/ {\n`;

        for (let [property, value] of Object.entries(declarations))
            ruleToAppend += `\t${property}: ${value} !important; /**/ \n`

        ruleToAppend += `}\n`
        style.append(ruleToAppend);
    }

    // add the new style element to the webpage
    document.head.appendChild(style);
    console.log(`Managed Custom CSS has added a <style> tag to this page with ${Object.keys(rules).length} rule(s).`)

}