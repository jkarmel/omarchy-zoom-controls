import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui as Ui
import "MenuModel.js" as Model

Ui.Panel {
  id: root
  moduleName: "jkarmel.zoom-controls"
  ipcTarget: "zoom-controls"
  manageIpc: false
  IpcHandler {
    target: "zoom-controls"
    function open(): void { root.open() }
    function close(): void { root.close() }
    function toggle(): void { root.toggle() }
    function refresh(): void { root.refresh() }
    function status(): string { return JSON.stringify(root.meetingState) }
    function actions(): string { return JSON.stringify({rows:menu.rows, joining:menu.joining, height:menu.implicitHeight}) }
  }
  property var meetingState: ({state:"offline",capabilities:{}})
  property string feedback: ""
  property bool feedbackError: false
  readonly property string helper: decodeURIComponent(Qt.resolvedUrl("bin/zoom-controls").toString().replace(/^file:\/\//, ""))
  readonly property var helperEnvironment: {
    const result = {PATH: "/usr/bin"}
    const keys = ["HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "LC_CTYPE", "DISPLAY",
      "WAYLAND_DISPLAY", "XDG_RUNTIME_DIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
      "XDG_STATE_HOME", "XDG_CACHE_HOME", "XDG_SESSION_TYPE", "XDG_CURRENT_DESKTOP",
      "DBUS_SESSION_BUS_ADDRESS", "HYPRLAND_INSTANCE_SIGNATURE", "OMARCHY_REQUEST_WORKSPACE",
      "ZOOM_CONTROLS_CONFIG"]
    for (const key of keys) {
      const value = Quickshell.env(key)
      if (value !== "") result[key] = value
    }
    return result
  }
  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function refresh() { if (!poll.running && !actionProcess.running) poll.running = true }
  function act(action, value) {
    if (actionProcess.running) return
    if (action !== "show" && (!meetingState.checkedAt || Date.now() - meetingState.checkedAt > 8000)) {
      feedback = "Updating meeting controls — try again."
      refresh()
      return
    }
    feedback = ""
    feedbackError = false
    actionProcess.command = [helper, action, meetingState.token || "", value || ""]
    actionProcess.running = true
    if (["share", "chat", "participants", "leave", "show", "start", "join", "join-clipboard"].indexOf(action) >= 0) close()
  }
  Component.onCompleted: refresh()
  onOpenedChanged: if (!opened) menu.resetJoin(); else if (opened) { refresh(); menu.cursor = -1; Qt.callLater(function() { keys.forceActiveFocus() }) }
  Timer { interval: root.opened ? 1000 : 2500; running: true; repeat: true; onTriggered: root.refresh() }
  Process {
    id: poll
    clearEnvironment: true
    environment: root.helperEnvironment
    command: [root.helper, "status"]
    onRunningChanged: if (running) pollDeadline.restart(); else pollDeadline.stop()
    stdout: StdioCollector {
      // The external supervisor bounds bytes before forwarding any output.
      waitForEnd: false
      onDataChanged: if (text.length > 65536) poll.signal(15)
      onStreamFinished: {
        try {
          const s = JSON.parse(text)
          // A poll begun before an action must not overwrite newer state.
          if (!actionProcess.running) root.meetingState = s
        } catch (e) { root.meetingState = {state:"unknown",title:"Cannot read Zoom controls",capabilities:{}} }
      }
    }
  }
  Process {
    id: actionProcess
    clearEnvironment: true
    environment: root.helperEnvironment
    stdout: StdioCollector {
      waitForEnd: false
      onDataChanged: if (text.length > 65536) actionProcess.signal(15)
      onStreamFinished: {
        try {
          const r = JSON.parse(text)
          root.feedbackError = !r.ok
          root.feedback = r.error || r.message || ""
        } catch (e) { root.feedbackError = true; root.feedback = "Zoom did not respond. Reopen the menu to check its state." }
        if (root.feedbackError && !root.opened) root.open()
      }
    }
    onRunningChanged: {
      if (running) actionDeadline.restart()
      else { actionDeadline.stop(); Qt.callLater(function() { root.refresh(); clearFeedback.restart() }) }
    }
  }
  // Independent shell deadlines cover a stalled or broken helper supervisor.
  Timer { id: pollDeadline; interval: 10000; onTriggered: poll.signal(15) }
  Timer { id: actionDeadline; interval: 65000; onTriggered: actionProcess.signal(15) }
  Timer { id: clearFeedback; interval: 7000; onTriggered: root.feedback = "" }
  Ui.BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    text: "󰕧"
    fontSize: 17
    foreground: root.meetingState.sharing ? Color.urgent : root.meetingState.state === "meeting" ? Color.accent : root.barForeground
    tooltipText: "Zoom · " + Model.summary(root.meetingState)
    onPressed: root.toggle()
  }
  Ui.KeyboardPanel {
    id: popup
    anchorItem: button
    owner: root
    bar: root.bar
    open: root.opened
    focusTarget: keys
    contentWidth: popup.fittedContentWidth(Style.space(310))
    contentHeight: popup.fittedContentHeight(menu.implicitHeight, Style.space(620))
    Ui.PanelKeyCatcher {
      id: keys
      anchors.fill: parent
      blocked: menu.editing
      onMoveRequested: function(dx,dy) { menu.moveCursor(dy) }
      onActivateRequested: menu.activate(menu.cursor)
      onCloseRequested: root.close()
      onTabRequested: function(direction) { root.switchPanel(direction) }
      Flickable {
        anchors.fill: parent
        contentWidth: width
        contentHeight: menu.implicitHeight
        clip: true
        interactive: contentHeight > height
        MenuContent {
          id: menu
          width: parent.width
          meetingState: root.meetingState
          busy: actionProcess.running
          feedback: root.feedback
          feedbackError: root.feedbackError
          onActionRequested: function(action, value) { root.act(action, value) }
          onEditingFinished: keys.forceActiveFocus()
        }
      }
    }
  }
}
