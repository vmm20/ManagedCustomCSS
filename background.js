/*
    This system allows 4 types of configurations in the master configuration.
        1) Apply rule group to website group
        2) Apply single rule to website group
        3) Apply rule group to single website
        4) Apply single rule to single website
*/

var WebsiteGroups, RuleGroups, MasterConfiguration = {};
var runtimeSettings = {};


readAdminPolicies(false);
chrome.storage.managed.onChanged.addListener(readAdminPolicies);


function readAdminPolicies(isUpdate=true) {
    chrome.storage.managed.get(function(managedStorage) {
        ( { WebsiteGroups, RuleGroups, MasterConfiguration } = managedStorage );
        buildRuntimeSettings(isUpdate);
        if(isUpdate) {
            chrome.tabs.query({}, function(tabs) {
                console.log(`Notifying all tabs that policy has been updated.`);
                for(let tab of tabs) {
                    chrome.tabs.sendMessage(tab.id, {
                        "what": "updatedPolicy"
                    })
                }
            })
        }
    });    
}


// Use the admin policies to create the runtimeSettings object, which maps hostnames directly to rules
function buildRuntimeSettings(update=true) {
    runtimeSettings = {};       // clear runtime settings if they already exist

    // steps 1 and 2: apply rule groups and individual rules to website groups
    for(let [groupTitle, groupSettings] of Object.entries( {...MasterConfiguration?.websiteGroups} )) {
        if(!WebsiteGroups?.[groupTitle]) {
            console.warn(`Website group '${groupTitle}' does not exist.`);
            continue;
        }
        let hostnames = WebsiteGroups[groupTitle];
        for(let hostname of hostnames) {

            // step 1: apply rule groups to website groups if rule groups exist in the settings
            for(let rg of groupSettings.ruleGroups || []) {
                if(!RuleGroups?.[rg])
                    console.warn(`Rule group '${rg}' does not exist.`);
                runtimeSettings[hostname] = {...runtimeSettings[hostname], ...RuleGroups?.[rg]}
            }
            // step 2: apply individual rules to website groups
            runtimeSettings[hostname] = {...runtimeSettings[hostname], ...groupSettings.ruleIndivs}
        }
    }

    // steps 3 and 4: apply rule groups and individual rules to individual websites
    for(let [hostname, indivSettings] of Object.entries( {...MasterConfiguration?.websiteIndivs} )) {
        
        // step 3: apply rule groups to individual websites if rule groups exist in the settings
        for(let rg of indivSettings.ruleGroups || []) {
            if(!RuleGroups?.[rg])
                console.warn(`Rule group '${rg}' does not exist.`);
            runtimeSettings[hostname] = {...runtimeSettings[hostname], ...RuleGroups?.[rg]}
        }
        // step 4: apply individual rules to individual websites
        runtimeSettings[hostname] = {...runtimeSettings[hostname], ...indivSettings.ruleIndivs}
    }

    console.info(`Runtime settings for Managed Custom CSS have been ${update ? "updated" : "built"} successfully.`);
}

// Respond to rules requests as they arrive
chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        let hostname = request.data.hostname;
        if(request.what == "rules") {
            sendResponse({
                "hostname": hostname,   // send hostname in case one tab has multiple content scripts in iframes
                "domainRules": {...runtimeSettings[hostname]}   // will send {} when hostname has no rules
            })
        }
    }
)
