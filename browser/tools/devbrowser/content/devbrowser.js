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
    const remote = Services.prefs.getBoolPref(
      "browser.tabs.remote.autostart",
      true
    );

    this.browserControls = new Browser(
      "browser_controls",
      remote,
      "chrome://devbrowser/content/components/browserControls.xhtml",
      "browser_controls_container"
    );

    this.sideBar = new Browser(
      "browser_sidebar",
      remote,
      "chrome://devbrowser/content/components/sideBar.xhtml",
      "browser_sidebar_container"
    );
    this.showSidebar = false;

    this.statusBar = new Browser(
      "browser_statusbar",
      remote,
      "chrome://devbrowser/content/components/statusBar.xhtml",
      "browser_statusbar_container"
    );

    this.browserContent = new Browser(
      "browser_content",
      remote,
      "https://example.com",
      "browser_content_container"
    );

    this.privilegedContent = new Browser(
      "privileged_content",
      false,
      "about:about",
      "browser_privileged_container"
    );

    this.addListeners();
  }

  addListeners() {
    window.openContextMenu = () => {
      console.log("context menu open");
    };

    Services.ppmm.addMessageListener("browser:loadURI", event => {
      // NOTE user input
      let url;
      try {
        url = new URL(event.data.url);
      } catch (ex) {
        console.error(`DevBrowser: could not parse URL ${event}`);
        throw ex;
      }

      const browser_content = document.getElementById("browser_content");
      const privileged_content = document.getElementById("privileged_content");

      if (url.protocol == "about:") {
        document.getElementById("browser_content_container").style =
          "visibility: hidden; display:none";
        document.getElementById("browser_privileged_container").style =
          "visibility: visible; display:block";

        privileged_content.loadURI(event.data.url, {
          triggeringPrincipal: gSystemPrincipal,
        });
      } else if (url.protocol == "https:" || url.protocol == "http:") {
        document.getElementById("browser_content_container").style =
          "visibility: visible; display:block";
        document.getElementById("browser_privileged_container").style =
          "visibility: hidden; display:none";

        browser_content.loadURI(event.data.url, {
          triggeringPrincipal: gSystemPrincipal,
        });
      } else {
        throw new Error(`DevBrowser: unknown protocol ${url.protocol}`);
      }
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

    Services.ppmm.addMessageListener("browser:search", event => {
      // FIXME validate user input!
      const searchText = event.data.searchText;
      document
        .getElementById("browser_content")
        .loadURI(
          `https://searchfox.org/mozilla-central/search?q=${searchText}`,
          {
            triggeringPrincipal: gSystemPrincipal,
          }
        );
    });

    Services.ppmm.addMessageListener("statusBar:searchText", event => {
      // FIXME validate user input!
      const searchText = event.data.searchText;
      document.getElementById("browser_content").finder.findAgain(searchText);
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
        document.getElementById("browser_content").goBack();
      }

      if (event.keyCode == forwardArrow && metaDown) {
        document.getElementById("browser_content").goForward();
      }
    });

    document.addEventListener("keyup", event => {
      if (event.key == "Meta") {
        metaDown = false;
      }
    });
  }

  static restart() {
    Services.obs.notifyObservers(null, "startupcache-invalidate");
    window.location.reload();
  }
}

/**
 * Creates a local or remote browser.
 */
class Browser {
  constructor(id, remote, url, container) {
    console.debug("Browser initialized:", id, remote, url, container);

    const browser = document.createXULElement("browser");
    browser.setAttribute("id", id);
    browser.setAttribute("type", "content");
    browser.setAttribute("remote", remote);

    document.getElementById(container).append(browser);

    browser.loadURI(url, { triggeringPrincipal: gSystemPrincipal });

    this.id = id;
    this.browser = browser;

    window.openContextMenu = function() {};

    this.addListeners();

    return browser;
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

        // FIXME this should be MainWindow's job now.
        // document.getElementById("browser_controls_container").blur();
        // document.getElementById("browser_content_container").focus();
      },
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

    this.browser.addProgressListener(
      progressListener,
      Ci.nsIWebProgress.NOTIFY_ALL
    );
  }
}

try {
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      const result = new MainWindow();
      console.log("MainWindow result:", result);
    },
    { once: true }
  );
} catch (e) {
  console.error("DevBrowser fatal error", e);
  throw e;
}
