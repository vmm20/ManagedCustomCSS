/*
    This system allows 6 types of configurations.
    In the UniversalRules policy, the administrator can:
        1) Apply rule group to all websites
        2) Apply single rule to all websites
    In the MasterConfiguration policy, the administrator can:
        3) Apply rule group to website group
        4) Apply single rule to website group
        5) Apply rule group to single website
        6) Apply single rule to single website
*/

var AdminPolicy = {
    WebsiteGroups: {},
    RuleGroups: {},
    UniversalRules: {},
    MasterConfiguration: {}
};
var runtimeSettings = {};


chrome.storage.managed.get((managedStorage) => {
    AdminPolicy = { ...managedStorage };
    refreshRuntimeSettings();
});

chrome.storage.managed.onChanged.addListener((changes) => {
    for (let [policyName, policyChanges] of Object.entries(changes))
        AdminPolicy[policyName] = { ...policyChanges.newValue };
    refreshRuntimeSettings();
});



// Store injectable CSS for a given tab and frame, then inject it
chrome.runtime.onMessage.addListener((request, sender) => {
    let hostname = request.hostname;
    let cssToInject = buildInjectableCSS(hostname);
    chrome.storage.local.set({
        [[sender.tab.id, sender.frameId]]: cssToInject
    });
    chrome.scripting.insertCSS({
        css: cssToInject,
        origin: "USER",
        target: {
            tabId: sender.tab.id,
            frameIds: [sender.frameId]
        }
    });
})

// if injected CSS changes, pick up the storage change event and remove the old CSS from the webpage
chrome.storage.local.onChanged.addListener((changes) => {
    for (let [key, valueChanges] of Object.entries(changes)) {
        let [tabId, frameId] = key.split(",").map((value) => { return Number(value) });
        // if the storage entry was modified, it will have the newValue property
        // if the storage entry was deleted because a tab was closed, it will not have the newValue property
        if (valueChanges.newValue) {
            chrome.tabs.removeCSS(tabId, {
                code: valueChanges.oldValue ?? "",
                frameId: frameId,
                cssOrigin: "user"
            });
        }
    }
})

// when a tab is closed, clear all associated entries from local storage
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.get((storage) => {
        chrome.storage.local.remove(Object.keys(storage).filter((value) => {
            return value.startsWith(`${tabId},`);
        }))
    });
})

// clear local storage when browser starts just in case the last exit was abnormal
chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.clear();
})



// Use the admin policies to create the runtimeSettings object, which maps hostnames (and * for universal) directly to rules
function refreshRuntimeSettings() {
    runtimeSettings = {};       // clear runtime settings if they already exist

    // steps 1 and 2: apply rule groups and individual rules to all websites
    for (let rg of AdminPolicy.UniversalRules?.ruleGroups ?? []) {
        if (!AdminPolicy.RuleGroups?.[rg])
            console.warn(`Rule group '${rg}' specified in UniversalRules does not exist.`);
        // step 1: apply rule groups to all websites if rule groups exist in the settings
        runtimeSettings["*"] = { ...runtimeSettings["*"], ...AdminPolicy.RuleGroups?.[rg] }
    }
    // step 2: apply individual rules to all websites
    runtimeSettings["*"] = { ...runtimeSettings["*"], ...AdminPolicy.UniversalRules?.ruleIndivs };

    // steps 3 and 4: apply rule groups and individual rules to website groups
    for (let [groupTitle, groupSettings] of Object.entries({ ...AdminPolicy.MasterConfiguration?.websiteGroups })) {
        if (!AdminPolicy.WebsiteGroups?.[groupTitle]) {
            console.warn(`Website group '${groupTitle}' does not exist.`);
            continue;
        }
        for (let hostname of AdminPolicy.WebsiteGroups[groupTitle] /* hostnames */) {
            // step 3: apply rule groups to website groups if rule groups exist in the settings
            for (let rg of groupSettings.ruleGroups ?? []) {
                if (!AdminPolicy.RuleGroups?.[rg])
                    console.warn(`Rule group '${rg}' specified in website group ${groupTitle} does not exist.`);
                runtimeSettings[hostname] = { ...runtimeSettings[hostname], ...AdminPolicy.RuleGroups?.[rg] }
            }
            // step 4: apply individual rules to website groups
            runtimeSettings[hostname] = { ...runtimeSettings[hostname], ...groupSettings.ruleIndivs }
        }
    }

    // steps 5 and 6: apply rule groups and individual rules to individual websites
    for (let [hostname, indivSettings] of Object.entries({ ...AdminPolicy.MasterConfiguration?.websiteIndivs })) {
        // step 5: apply rule groups to individual websites if rule groups exist in the settings
        for (let rg of indivSettings.ruleGroups ?? []) {
            if (!AdminPolicy.RuleGroups?.[rg])
                console.warn(`Rule group '${rg}' does not exist.`);
            runtimeSettings[hostname] = { ...runtimeSettings[hostname], ...AdminPolicy.RuleGroups?.[rg] }
        }
        // step 6: apply individual rules to individual websites
        runtimeSettings[hostname] = { ...runtimeSettings[hostname], ...indivSettings.ruleIndivs }
    }

    console.info(`Runtime settings for Managed Custom CSS have been refreshed successfully.`);
    chrome.tabs.query({}, function (tabs) {
        for (let tab of tabs)
            chrome.tabs.sendMessage(tab.id, "refreshedPolicy")
        console.info(`All tabs have been notified of refreshed policy.`);
    })
}


// Build a CSS string to inject into tabs with the given hostname
function buildInjectableCSS(hostname) {
    let output = "";
    // for each rule, append syntactically correct CSS to the style element
    for (let [selector, declarations] of Object.entries({ ...runtimeSettings["*"], ...runtimeSettings[hostname] })) {
        output += `${selector} /**/ {\n`;
        for (let [property, value] of Object.entries({ ...declarations }))
            output += `\t${property}: ${value} !important; /**/ \n`
        output += `}\n`
    }
    return output;
}