/**
 * This file is part of Adguard Browser Extension (https://github.com/AdguardTeam/AdguardBrowserExtension).
 *
 * Adguard Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Adguard Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with Adguard Browser Extension.  If not, see <http://www.gnu.org/licenses/>.
 */
var tabsLoading = Object.create(null);

chrome.webNavigation.onCreatedNavigationTarget.addListener(function (details) {

	var sourceTab = new BrowserTab({id: details.sourceTabId});

	//don't process this request
	if (framesMap.isTabAdguardDetected(sourceTab)) {
		return;
	}

	var referrerUrl = framesMap.getFrameUrl(sourceTab, 0);
	if (!UrlUtils.isHttpRequest(referrerUrl)) {
		return;
	}

	tabsLoading[details.tabId] = {
		referrerUrl: referrerUrl,
		sourceTab: sourceTab
	};

	checkPopupBlockedRule(details.tabId, details.url, referrerUrl, sourceTab);
});

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {

	if (!(tabId in tabsLoading)) {
		return;
	}

	if ("url" in changeInfo) {
		var tabInfo = tabsLoading[tabId];
		if (tabInfo) {
			checkPopupBlockedRule(tabId, tab.url, tabInfo.referrerUrl, tabInfo.sourceTab);
		}
	}
});

function checkPopupBlockedRule(tabId, requestUrl, referrerUrl, sourceTab) {

	//is not http request or url of tab isn't ready
	if (!UrlUtils.isHttpRequest(requestUrl)) {
		return;
	}

	delete tabsLoading[tabId];

	var requestEvent = webRequestService.processRequest(sourceTab, requestUrl, referrerUrl, "POPUP");

	if (requestEvent.requestBlocked) {
		//remove popup tab
		chrome.tabs.remove(tabId);
		//fix log event type from "POPUP" to "DOCUMENT"
		requestEvent.logEvent.requestType = "DOCUMENT";
		webRequestService.postProcessRequest(requestEvent);
	}
}
