devbrowser
==========

devbrowser is a minimal web browser for desktop platforms. It is intended for:

- Platform developers who want a simple testbed.
- Prototyping new browser features.

..image:: images/screenshot-home.png
..image:: images/screenshot-google.png

Design and Architecture

devbrowser supports two models:

1. Single-process

This is not the default, and the `browser.tabs.remote.autostart` and
`fission.autostart` prefs must be se to `false` (see the Running section below).

Single-process mode runs both the privileged and web content code in the same
process, to ease platform debugging. This is not an officially supported
Tier-1 Firefox configuration and may eventually be removed or modified, as Firefox
changes and as multi-process debugging improves.

2. Multi-process

This is the default. The architecture is as follows:

Main Window:
    This is a chrome-privileged window started by the main process, which loads
    the various Browser Components that make up the UI. The Main Window is
    responsible for brokering messages between the remote content processes it
    creates and the main process.

    NOTE: the intention is to change this to be content-privileged and in a remote
    content process, except for the ability to send messages to the main process,
    and to be able to create new remote processes. Besides the security advantage
    of this approach, the other reason this should change is to have the main
    thread of the main window free to process messages from the browser components
    so as not to cause lag between user interaction and the application doing something.

Browser Components:
    The UI that the user interacts with, such as the back button and the address bar.
    Each component is loaded into its own remote content-privileged process. The main
    thread of each component is *only* for user interaction. WASM and JS modules may be
    loaded and run in workers, but they *cannot synchronously interact with the UI*.

Browser Services (aka Main Process):
    Provides services to the browser such as: add-ons manager, update services,
    sync, etc. It is run in a process which may interact with the underlying OS,
    but as above, *cannot synchronously access the main UI*. Access to and from
    the Browser Components must be brokered as messages through the Main Window.

Core Platform:
    Services such as graphics, rendering, networking, security.
    These are compiled for the native platform, and host the above services.

Browser Components
------------------

Browser components are built using web technologies, such as XHTML, JS, WASM, and CSS.
They are able to pass very limited messages to and receive notifications from the Main Window,
but are otherwise unprivileged.

devbrowser is builting using these components:

- BrowserControls:  back/forward buttons, address bar, menu.
- BrowserStatusBar: find-in-page, current location of link on hover.
- BrowserSideBar:   left or right side-bar.
- BrowserContent:   the area in which to load web content.

The Main Window is responsible for layout of the Browser Componets,
and also receiving and passing messages between the remote processes the
Browser Components are loaded into. For example, typing in the address bar
of the BrowserControls will cause the following message:

  BrowserControls -> MainWindow: `loadURI, {"url": "https://example.com"}`

The Main Window then validates this, and re-sends the message to the BrowserContent
component:

  MainWindow -> BrowserContent: `loadURI, {"url": "https://example.com"}`

Flow of control
---------------

.. mermaid::
  graph TD
  A[MainProcess] -->B(MainWindow)
  B --> C[BrowserControls ]
  B --> D[BrowserStatusBar]
  B --> E[BrowserSideBar]
  B --> F[BrowserContent]

In this graph, the main process first creates a remote content process, with chrome
privileges, and loads the MainWindow into it. This is done by loading an XHTML
page from the chrome: protocol.

NOTE: as implemented currently, there is no separation between the main processes
and the main window. While this works, it means that the main window could be
too busy to process messages in a timely manner which gives the user experience
of lag between e.g. button click and re-action, and is likely to cause users to
click the same button multiple times (making the problem worse).

The MainWindow creates 4 remote content processes, but not with chrome privileges.
Finally, Browser Components are loaded into each of these.

Running

Other helpful flags are `--jsdebugger` to automatically open DevTools on initial load,
or `--start-debugger-server` to start a debugger server for use with a remote DevTools
instance.

The main browser UI can then be hot-reloaded via the DevTools console:

  MainWindow.restart();
