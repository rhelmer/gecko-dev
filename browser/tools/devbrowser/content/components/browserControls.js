"use strict";

// FIXME begin remove chrome dependency
if (!document.createXULElement) {
  throw Error("this page must be loaded via the chrome:// protocol");
}

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const messageManager = Services.cpmm;
// FIXME end remove chrome dependency

class BrowserControls {
  constructor() {
    this.controls = document.getElementById("controls");
    this.back = document.getElementById("back");
    this.forward = document.getElementById("forward");
    this.reload = document.getElementById("reload");
    this.reload_image = document.getElementById("reload-image");
    this.addressbar = document.getElementById("addressbar");
    this.sidebar = document.getElementById("sidebar");

    this.addListeners();
  }

  addListeners() {
    this.controls.addEventListener("click", event => {
      switch (event.target.parentNode.id) {
        case "back":
          messageManager.sendAsyncMessage(`browser:goBack`);
          break;
        case "forward":
          messageManager.sendAsyncMessage(`browser:goForward`);
          break;
        case "reload":
          messageManager.sendAsyncMessage(`browser:reload`);
          break;
        case "sidebar":
          messageManager.sendAsyncMessage(`browser:sidebar`);
          break;
      }
    });

    this.addressbar.onkeypress = event => {
      const returnKey = 13;

      if (event.keyCode == returnKey) {
        const rawAddress = event.target.value;
        let newUrl = rawAddress;
        try {
          newUrl = new URL(rawAddress);
        } catch (ex) {
          try {
            newUrl = new URL(`https://${rawAddress}`);
          } finally {
            messageManager.sendAsyncMessage(`browser:loadURI`, {
              url: newUrl.toString(),
            });
          }
        }
        messageManager.sendAsyncMessage(`browser:loadURI`, {
          url: newUrl.toString(),
        });
      }
    };

    messageManager.addMessageListener("MainWindow:addressbar.select", () => {
      document.getElementById("addressbar").select();
    });
    messageManager.addMessageListener("MainWindow:loading.started", () => {
      document.getElementById("reload-image").src = "assets/stop.svg";
    });
    messageManager.addMessageListener("MainWindow:loading.stopped", () => {
      document.getElementById("reload-image").src = "assets/reload.svg";
    });
    messageManager.addMessageListener("MainWindow:location.change", event => {
      document.getElementById("addressbar").value = event.data.url;
    });
  }

  static restart() {
    window.location.reload();
  }
}

try {
  new BrowserControls();
} catch (e) {
  console.error(`Uncaught Browser Error: ${e}`);
  throw e;
}
