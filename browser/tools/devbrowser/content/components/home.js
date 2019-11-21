"use strict";

// FIXME begin remove chrome dependency
if (!document.createXULElement) {
  throw Error("this page must be loaded via the chrome:// protocol");
}

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const messageManager = Services.cpmm;
// FIXME end remove chrome dependency

class Home {
    constructor() {
        this.search = document.getElementById("search");
        this.submit = document.getElementById("submit");

        this.addListeners();
    }

    addListeners() {
        this.submit.addEventListener("click", event => {
            const searchText = document.getElementById("search").value;
            messageManager.sendAsyncMessage("browser:search", {searchText: searchText});
        });

        search.addEventListener("keydown", event => {
            const returnKey = 13;

            if (event.keyCode == returnKey) {
                const searchText = document.getElementById("search").value;
                messageManager.sendAsyncMessage("browser:search", {searchText: searchText});
            }
        });
    }
}

try {
    const result = new Home();
    console.log("Home startup result:", result);
} catch (e) {
    console.log("Home fatal error:", e);
    throw e;
}