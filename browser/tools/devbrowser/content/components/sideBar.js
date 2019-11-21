// FIXME begin remove chrome dependency
if (!document.createXULElement) {
  throw Error("this page must be loaded via the chrome:// protocol");
}

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const messageManager = Services.cpmm;
// FIXME end remove chrome dependency

class SideBar {
  constructor() {
    this.statusBar = document.getElementById("status_bar");
    this.search = document.getElementById("search");
    this.find = document.getElementById("find");
    this.location = document.getElementById("location");

    this.addListeners();
  }

  addListeners() {
    this.statusBar.addEventListener("click", event => {
      switch (event.target.parentNode.id) {
        case "search":
          messageManager.sendAsyncMessage(`statusBar:search`, {
            search: event.target.parentNode.id,
          });
          break;
        case "find":
          messageManager.sendAsyncMessage(`statusBar:find`, {
            search: event.target.parentNode.id,
          });
          break;
      }
    });

    this.search.onkeypress = event => {
      const returnKey = 13;

      if (event.keyCode == returnKey) {
        messageManager.sendAsyncMessage(`statusBar:search`, {
          search: event.target.value,
        });
      }
    };

    messageManager.addMessageListener("mainWindow:location", event => {
      if (!document.getElementById("location_value")) {
        const location = ((document.createElement("text").value =
          event.target.value).id = "location_value");
        document.getElementById("location").appendChild(location);
      } else {
        const location = document.getElementById("location_value");
        location.value = event.target.value;
      }
    });
  }

  static restart() {
    window.location.reload();
  }
}

try {
  new SideBar();
} catch (e) {
  console.error(`Uncaught Browser Error: ${e}`);
  throw e;
}
