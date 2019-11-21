if (!document.createXULElement) {
  throw Error("this page must be loaded via the chrome: protocol");
}

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyGetter(this, "gSystemPrincipal", () =>
  Services.scriptSecurityManager.getSystemPrincipal()
);

class MainWindow {
  constructor() {
    const browserContent = document.getElementById("browser_content");
    browserContent.loadend = this.addListeners();
  }

  static restart() {
    Services.obs.notifyObservers(null, "startupcache-invalidate");
    window.location.reload();
  }

  addListeners() {
    const browserContent = document.getElementById("browser_content");
    Services.ppmm.addMessageListener("browser:loadURI", event => {
      // NOTE user input
      let url;

      try {
        url = new URL(event.data.url);
      } catch (e) {
        console.error(`DevBrowser: could not parse URL ${event}`);
        throw e;
      }

      if (url.protocol == "about:") {
        browserContent.src = event.data.url;
        Services.ppmm.addMessageListener("browser:loadURI");
      } else if (url.protocol == "https:" || url.protocol == "http:") {
        browserContent.src = event.data.url;
      } else {
        throw new Error(`DevBrowser: unknown protocol ${url.protocol}`);
      }
    });

    Services.ppmm.addMessageListener("browser:goBack", () => {
      browserContent.goBack();
    });

    Services.ppmm.addMessageListener("browser:goForward", () => {
      browserContent.goForward();
    });

    Services.ppmm.addMessageListener("browser:stop", () => {
      browserContent.stop();
    });

    Services.ppmm.addMessageListener("browser:reload", () => {
      browserContent.reload();
    });

    Services.ppmm.addMessageListener("browser:sidebar", () => {
      if (this.showSidebar) {
        document.getElementById("browser_sidebar_container").style =
          "visibility: hidden; display:none";
        document.getElementById("browser_content_container").style = "left: 0";
        this.showSidebar = false;
      } else {
        document.getElementById("browser_sidebar_container").style =
          "visibility: visible; display:block";
        document.getElementById("browser_content_container").style =
          "left: 200px";
        this.showSidebar = true;
      }
    });

    Services.ppmm.addMessageListener("statusBar:hide", () => {
      document.getElementById("browser_statusbar_container").style =
        "visibility: hidden; display: none;";
      document.getElementById("browser_content_container").style = "bottom: 0";
    });

    Services.ppmm.addMessageListener(`browser:search`, event => {
      // FIXME validate user input!
      const searchText = event.data.searchText;
      //console.debug(document, browserContent);
      browserContent.src = `https://searchfox.org/mozilla-central/search?q=${searchText}`;
    });

    Services.ppmm.addMessageListener("statusBar:searchText", event => {
      // FIXME validate user input!
      const searchText = event.data.searchText;
      browserContent.finder.findAgain(searchText);
    });

    Services.ppmm.addMessageListener("browser:goBack", () => {
      document.getElementById("browser_content").goBack();
    });

    Services.ppmm.addMessageListener("browser:goForward", () => {
      document.getElementById("browser_content").goForward();
    });

    Services.ppmm.addMessageListener("browser:stop", () => {
      document.getElementById("browser_content").stop();
    });

    Services.ppmm.addMessageListener("browser:reload", () => {
      document.getElementById("browser_content").reload();
    });

    Services.ppmm.addMessageListener("statusBar:hide", () => {
      document.getElementById("browser_statusbar_container").style =
        "visibility: hidden; display: none;";
    });

    let metaDown = false;
    document.addEventListener("keydown", event => {
      const backArrow = 37;
      const forwardArrow = 39;

      if (event.key == "Meta") {
        metaDown = true;
      }

      if (event.key == "l" && metaDown) {
        document.getElementById("browser_controls").focus();
        Services.ppmm.broadcastAsyncMessage("MainWindow:addressbar.select");
      }

      if (event.key == "f" && metaDown) {
        document.getElementById("browser_statusbar_container").style =
          "visibility: visible; display:block";
        document.getElementById("browser_content_container").style =
          "bottom: 30px";

        document.getElementById("browser_statusbar").focus();
        Services.ppmm.broadcastAsyncMessage("MainWindow:search.select");
      }

      if (event.keyCode == backArrow && metaDown) {
        browserContent.goBack();
      }

      if (event.keyCode == forwardArrow && metaDown) {
        browserContent.goForward();
      }
    });

    document.addEventListener("keyup", event => {
      if (event.key == "Meta") {
        metaDown = false;
      }
    });
  }
}

/**
 * Base class for ActorParents below.
 */
class ActorParent {
  constructor(id, container, remote, url) {
    console.debug("ActorParent initialized:", id, container, remote, url);

    const browser = document.createXULElement("browser");
    browser.setAttribute("id", id);
    browser.setAttribute("type", "content");
    browser.setAttribute("remote", remote);
    document.getElementById(container).appendChild(browser);

    browser.src = url;

    this.id = id;
    this.browser = browser;

    window.openContextMenu = function() {};

    this.addListeners();
  }

  addListeners() {}
}

class ControlsActorParent extends ActorParent {
  constructor(...args) {
    super(...args);
  }
}

class ContentActorParent extends ActorParent {
  constructor(...args) {
    super(...args);
  }

  addListeners() {
    const progressListener = {
      QueryInterface: ChromeUtils.generateQI([
        Ci.nsIWebProgressListener,
        Ci.nsISupportsWeakReference,
      ]),

      onStateChange(webProgress, request, flags, status) {
        if (flags & Ci.nsIWebProgressListener.STATE_IS_NETWORK) {
          console.debug("onStateChange", webProgress, request, flags, status);

          if (flags & Ci.nsIWebProgressListener.STATE_STOP) {
            console.log("stopped");
            Services.ppmm.broadcastAsyncMessage("MainWindow:loading.stopped");
          }
        }
      },
      onLocationChange(webProgress, request, location, flags) {
        Services.ppmm.broadcastAsyncMessage("MainWindow:loading.started");
        console.debug(
          "onLocationChange",
          webProgress,
          request,
          location,
          flags
        );

        Services.ppmm.broadcastAsyncMessage("MainWindow:location.change", {
          url: location.spec,
        });

        document.getElementById("browser_controls_container").blur();
        document.getElementById("browser_content_container").focus();
      },
      onLocationChange(webProgress, request, location, flags) {},
      onProgressChange(
        webProgress,
        request,
        curSelfProgress,
        maxSelfProgress,
        curTotalProgress,
        maxTotalProgress
      ) {
        console.debug(
          "onProgressChange",
          webProgress,
          request,
          curSelfProgress,
          maxSelfProgress,
          curTotalProgress,
          maxTotalProgress
        );
      },
      onSecurityChange(webProgress, request, state) {
        console.debug(this.id, "onSecurityChange", webProgress, request, state);
      },
      onContentBlockingEvent(webProgress, request, event) {
        console.debug("onContentBlockingEvent", webProgress, request, event);
      },
      onStatusChange(webProgress, request, status, message) {
        console.debug("onStatusChange", webProgress, request, status, message);
      },
    };

    let webProgress = window.docShell
      .QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIWebProgress);

    webProgress.addProgressListener(
      progressListener,
      Ci.nsIWebProgress.NOTIFY_ALL
    );
  }
}

class SidebarActorParent extends ActorParent {
  constructor(...args) {
    super(...args);
  }
}
class StatusbarActorParent extends ActorParent {
  constructor(...args) {
    super(...args);
  }
}

const remote = Services.prefs.getBoolPref(
  "browser.tabs.remote.autostart",
  true
);

new ContentActorParent(
  "browser_content",
  "browser_content_container",
  remote,
  "chrome://devbrowser/content/components/home.xhtml"
);

new ControlsActorParent(
  "browser_controls",
  "browser_controls_container",
  remote,
  "chrome://devbrowser/content/components/browserControls.xhtml"
);
new SidebarActorParent(
  "browser_sidebar",
  "browser_sidebar_container",
  remote,
  "chrome://devbrowser/content/components/sideBar.xhtml"
);
new StatusbarActorParent(
  "browser_statusbar",
  "browser_statusbar_container",
  remote,
  "chrome://devbrowser/content/components/statusBar.xhtml"
);

try {
  const mainWindow = new MainWindow();
  console.debug("MainWindow startup:", mainWindow);
} catch (e) {
  console.error("DevBrowser fatal error", e);
  throw e;
}
