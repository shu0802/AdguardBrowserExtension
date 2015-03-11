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
var BrowserTab, BrowserTabs, BrowserWindow;

(function () {

	//Tab events implementation

	var SafariTabEvent = function () {
		BaseEvent.apply(this, arguments);
	};
	SafariTabEvent.prototype = {

		__proto__: BaseEvent.prototype,

		specifyListener: function (listener) {
			return function (event) {
				if (event.target instanceof SafariBrowserTab) {
					listener(new BrowserTab(event.target));
				}
			};
		}
	};

	var OnLoadingTabEvent = function (target) {
		BaseEvent.call(this, target, "message", false);
	};
	OnLoadingTabEvent.prototype = {

		__proto__: BaseEvent.prototype,

		specifyListener: function (listener) {
			return function (event) {
				if (event.name == "loading" && event.message == event.target.url) {
					listener(new BrowserTab(event.target));
				}
			};
		}
	};

	//Browser Tab implementation
	BrowserTab = function (tab) {
		this.safariTab = tab;
		this._eventTarget = tab;
		this._messageDispatcher = tab.page;
	};
	BrowserTab.prototype = {
		get url() {
			return this.safariTab.url;
		},
		get title() {
			return this.safariTab.title;
		},
		close: function () {
			this.safariTab.close();
		},
		activate: function () {
			this.safariTab.activate();
			this.safariTab.browserWindow.activate();
		},
		reload: function (url) {
			this.safariTab.url = (url || this.safariTab.url);
		},
		executeScript: function (details, callback) {
			callback();
		},
		insertCSS: function (details, callback) {
			callback();
		},
		get active() {
			return this.safariTab == safari.application.activeBrowserWindow.activeTab;
		},
		equals: function (t) {
			return this.safariTab == t.safariTab;
		},
		sendMessage: sendMessage
	};

	//Browser Tabs collection implementation

	BrowserTabs = function () {

		this.safariTabs = [];
		this.framesInfo = [];

		this._onTabClosed = this._onTabClosed.bind(this);
	};
	BrowserTabs.prototype = {
		set: function (tab, value) {
			if (!tab) {
				return;
			}
			var index = this.safariTabs.indexOf(tab.safariTab);
			if (index < 0) {
				this.safariTabs.push(tab.safariTab);
				this.framesInfo.push(value);
			} else {
				this.framesInfo[index] = value;
			}
		},
		get: function (tab) {
			if (!tab) {
				return null;
			}
			var index = this.safariTabs.indexOf(tab.safariTab);
			return index >= 0 ? this.framesInfo[index] : null;
		},
		has: function (tab) {
			return tab && this.safariTabs.indexOf(tab.safariTab) >= 0;
		},
		clear: function () {
			while (this.safariTabs.length > 0) {
				this._delete(this.safariTabs[0]);
			}
		},
		collection: function () {
			return this.framesInfo;
		},
		remove: function (tab) {
			this._delete(tab.safariTab);
		},
		_delete: function (tab) {
			var index = this.safariTabs.indexOf(tab);
			if (index >= 0) {
				this.safariTabs.splice(index, 1);
				this.framesInfo.splice(index, 1);
				tab.removeEventListener("close", this._onTabClosed, false);
			}
		},
		_onTabClosed: function (event) {
			this._delete(event.target);
		}
	};

	//Browser Windows implementation

	BrowserWindow = function (win) {
		this._win = win;
	};
	BrowserWindow.prototype = {
		get visible() {
			return this._win.visible;
		},
		getAllTabs: function (callback) {
			callback(this._win.tabs.map(function (tab) {
				return new BrowserTab(tab);
			}));
		},
		getActiveTab: function (callback) {
			callback(new BrowserTab(this._win.activeTab));
		},
		openTab: function (url, background, callback) {
			var tab = this._win.openTab();
			tab.url = url;
			if (callback) {
				callback(new BrowserTab(tab));
			}
		}
	};

	//Background page proxy for Safari implementation

	var SafariProxy = {

		tabs: [],
		objects: [],

		addToObjects: function (obj, objects) {
			var objectId = objects.indexOf(obj);
			if (objectId < 0) {
				objectId = objects.push(obj) - 1;
			}
			return objectId;
		},

		serializeCollection: function (collection, objects, memo) {

			memo = memo || {specs: [], arrays: []};

			var items = [];
			for (var i = 0; i < collection.length; i++) {
				items.push(this.serializeObject(collection[i], objects, memo));
			}

			return items;
		},

		serializeObject: function (obj, objects, memo) {

			if (typeof obj == "object" && obj != null || typeof obj == "function") {

				if (obj.constructor == Array) {

					memo = memo || {specs: [], arrays: []};

					var idx = memo.arrays.indexOf(obj);
					if (idx >= 0) {
						return memo.specs[idx];
					}

					var spec = {type: "array"};
					memo.specs.push(spec);
					memo.arrays.push(obj);

					spec.items = this.serializeCollection(obj, objects, memo);
					return spec;
				}

				if (obj.constructor != Date && obj.constructor != RegExp) {
					return {type: "object", objectId: this.addToObjects(obj, objects)};
				}
			}

			return {type: "value", value: obj};
		},

		deserializeObject: function (spec, objects, tab, memo) {

			switch (spec.type) {
				case "value":
					return spec.value;
				case "lookupSavedObject":
					return objects[spec.objectId];
				case "callback":
					return this.createCallback(spec.callbackId, tab);
				case "object":
				case "array":

					memo = memo || {specs: [], objects: []};

					var index = memo.specs.indexOf(spec);
					if (index >= 0) {
						return memo.objects[index];
					}

					var obj = spec.type == "array" ? [] : {};

					memo.specs.push(spec);
					memo.objects.push(obj);

					if (spec.type == "array") {
						for (var i = 0; i < spec.items.length; i++) {
							obj.push(this.deserializeObject(spec.items[i], objects, tab, memo));
						}
					} else {
						for (var k in spec.properties) {
							if (spec.properties.hasOwnProperty(k)) {
								obj[k] = this.deserializeObject(spec.properties[k], objects, tab, memo);
							}
						}
					}

					return obj;
			}
		},

		createCallback: function (callbackId, tab) {
			var self = this;
			return function () {
				var index = self.tabs.indexOf(tab);
				if (index >= 0) {
					var objects = self.objects[index];
					var contextId = self.addToObjects(this, objects);
					var args = self.serializeCollection(arguments, objects);
					tab.page.dispatchMessage("safariProxyCallback", {
						callbackId: callbackId,
						contextId: contextId,
						args: args
					});
				}
			};
		},

		createObjectCache: function (tab) {

			var objects = [window];
			this.tabs.push(tab);
			this.objects.push(objects);

			tab.addEventListener("close", function () {
				var index = this.tabs.indexOf(tab);
				if (index >= 0) {
					this.tabs.splice(index, 1);
					this.objects.splice(index, 1);
				}
			}.bind(this));

			return objects;
		},

		getObjectCache: function (tab) {
			var index = this.tabs.indexOf(tab);
			var objects;
			if (index >= 0) {
				objects = this.objects[index];
			} else {
				objects = this.createObjectCache(tab);
				this.objects[index] = objects;
			}
			return objects;
		},

		onError: function (error) {
			if (error instanceof Error) {
				error = error.message;
			}
			return {successResponse: false, errorResponse: error};
		},

		processMessage: function (message, tab) {

			var obj, value;
			var objects = this.getObjectCache(tab);

			switch (message.type) {

				case "getProperty":

					obj = objects[message.objectId];
					try {
						value = obj[message.property];
					} catch (e) {
						return this.onError(e);
					}
					return {successResponse: true, result: this.serializeObject(value, objects)};

				case "setProperty":

					obj = objects[message.objectId];
					value = this.deserializeObject(message.value, objects, tab);
					try {
						obj[message.property] = value;
					} catch (e) {
						return this.onError(e);
					}
					return {successResponse: true};

				case "callFunction":

					var callFunction = objects[message.functionId];
					var callContext = objects[message.contextId];

					var args = [];
					for (var i = 0; i < message.args.length; i++) {
						args.push(this.deserializeObject(message.args[i], objects, tab));
					}

					try {
						var result = callFunction.apply(callContext, args);
					} catch (e) {
						return this.onError(e);
					}
					return {successResponse: true, result: this.serializeObject(result, objects)};

				case "lookupObject":

					obj = objects[message.objectId];
					var lookupResult = {properties: {}, isFunction: typeof obj == "function"};

					Object.getOwnPropertyNames(obj).forEach(function (prop) {
						lookupResult.properties[prop] = {
							enumerable: Object.prototype.propertyIsEnumerable.call(obj, prop)
						};
					});

					if (obj.__proto__) {
						lookupResult.prototypeId = this.addToObjects(obj.__proto__, objects);
					}

					if (obj == Object.prototype) {
						lookupResult.prototypeType = "Object";
					}
					if (obj == Function.prototype) {
						lookupResult.prototypeType = "Function";
					}
					return lookupResult;
			}
		}
	};

	var emptyListener = {
		addListener: function () {
		}
	};

	// Web Request Blocking implementation

	function getRequestDetails(message, tab) {

		var requestType;
		switch (message.type) {
			case "main_frame":
				requestType = "DOCUMENT";
				break;
			case "sub_frame":
				requestType = "SUBDOCUMENT";
				break;
			default :
				requestType = message.type.toUpperCase();
				break;
		}

		return {
			requestUrl: message.url,                //request url
			requestType: requestType,               //request type
			frameId: message.frameId,               //id of this frame (only for main_frame and sub_frame types)
			requestFrameId: message.requestFrameId, //id of frame where request is executed
			tab: new BrowserTab(tab)                //request tab
		};
	}

	ext.webRequest = {

		onBeforeRequest: {

			requestListeners: [],

			processMessage: function (message, tab) {

				var requestDetails = getRequestDetails(message, tab);

				for (var i = 0; i < this.requestListeners.length; i++) {

					var requestListener = this.requestListeners[i];

					var result = requestListener(requestDetails);
					if (result === false) {
						return false;
					}
				}

				return true;
			},

			addListener: function (listener) {
				this.requestListeners.push(listener);
			},

			removeListener: function (listener) {
				var index = this.requestListeners.indexOf(listener);
				if (index >= 0) {
					this.requestListeners.splice(index, 1);
				}
			}
		},
		handlerBehaviorChanged: function () {
		},
		onCompleted: emptyListener,
		onErrorOccurred: emptyListener,
		onHeadersReceived: {

			requestListeners: [],

			processMessage: function (message, tab) {

				var requestDetails = getRequestDetails(message, tab);

				for (var i = 0; i < this.requestListeners.length; i++) {
					var requestListener = this.requestListeners[i];
					requestListener(requestDetails);
				}

				return true;
			},

			addListener: function (listener) {
				this.requestListeners.push(listener);
			},

			removeListener: function (listener) {
				var index = this.requestListeners.indexOf(listener);
				if (index >= 0) {
					this.requestListeners.splice(index, 1);
				}
			}
		},
		onBeforeSendHeaders: emptyListener
	};

	//Synchronous message passing implementation

	safari.application.addEventListener("message", function (event) {
		if (event.name != "canLoad") {
			return;
		}
		var messageHandler;
		switch (event.message.type) {
			case "safariWebRequest":
				messageHandler = ext.webRequest.onBeforeRequest;
				break;
			case "safariHeadersRequest":
				messageHandler = ext.webRequest.onHeadersReceived;
				break;
			case "safariProxy":
				messageHandler = SafariProxy;
				break;
		}
		event.message = messageHandler.processMessage(event.message.data, event.target);
	}, true);

	//Extension API for background page

	ext.app = {};
	ext.app.getDetails = function () {
		return {
			version: safari.extension.bundleVersion
		};
	};

	ext.windows = {};
	ext.windows.getAll = function (callback) {
		callback(safari.application.browserWindows.map(function (win) {
			return new BrowserWindow(win);
		}));
	};
	ext.windows.getLastFocused = function (callback) {
		callback(new BrowserWindow(safari.application.activeBrowserWindow));
	};
	ext.windows.getOrCreate = function (callback) {
		var win = safari.application.activeBrowserWindow;
		if (!win) {
			win = safari.application.openBrowserWindow();
		}
		callback(new BrowserWindow(win));
	};

	ext.tabs = {
		onLoading: new OnLoadingTabEvent(safari.application),
		onCreated: new SafariTabEvent(safari.application, "open", true),
		onCompleted: new SafariTabEvent(safari.application, "navigate", true),
		onActivated: new SafariTabEvent(safari.application, "activate", true),
		onRemoved: new SafariTabEvent(safari.application, "close", true),
		onUpdated: new SafariTabEvent(safari.application, "navigate", true)
	};

	ext.backgroundPage = {
		getWindow: function () {
			return safari.extension.globalPage.contentWindow;
		}
	};

	ext.onMessage = new OnMessageEvent(safari.application);

	ext.webNavigation = {
		onCreatedNavigationTarget: emptyListener
	};

	/* Browser actions */

	function setBrowserAction(tab, name, value) {
		var items = safari.extension.toolbarItems;
		for (var i = 0; i < items.length; i++) {
			var item = items[i];
			if (item.identifier == "AdguardOpenOptions" && tab.safariTab == safari.application.activeBrowserWindow.activeTab) {
				item[name] = value;
			}
		}
	}

	ext.browserAction = {
		setBrowserAction: function (tab, icon, badge, badgeColor, title) {
			//set title
			setBrowserAction(tab, "label", title);
			setBrowserAction(tab, "toolTip", title);
			//set badge
			setBrowserAction(tab, "badge", badge);
		}
	};

	ext.windows.onFocusChanged = {
		addListener: function (listener) {
			safari.application.addEventListener("activate", listener, true);
		}
	};

	ext.contextMenus = {
		removeAll: function () {
		},
		create: function () {
		}
	}
})();
