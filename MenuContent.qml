pragma ComponentBehavior: Bound
import QtQuick
import QtQuick.Controls
import qs.Commons
import "MenuModel.js" as Model

Column {
  id: root
  property var meetingState: ({state: "offline", capabilities: {}})
  readonly property var themeFont: Style.font
  property bool busy: false
  property string feedback: ""
  property bool feedbackError: false
  property int cursor: -1
  readonly property var rows: Model.rows(meetingState)
  property bool joining: false
  readonly property bool editing: joining && joinField.activeFocus
  signal actionRequested(string action, string value)
  signal editingFinished()
  onMeetingStateChanged: if (meetingState.state !== "idle" && meetingState.state !== "offline") resetJoin()
  function resetJoin() { joining = false; joinField.text = "" }
  function submitJoin() { if (!busy && joinField.text.trim()) actionRequested("join", joinField.text.trim()) }
  spacing: Style.space(12)
  width: Style.space(310)

  function tint(color, amount) { return Qt.tint(Color.background, Qt.rgba(color.r, color.g, color.b, amount)) }
  function activate(index) {
    if (!busy && index >= 0 && index < rows.length && rows[index].enabled)
      if (rows[index].action === "join") { joining = true; Qt.callLater(function() { joinField.forceActiveFocus() }) }
      else actionRequested(rows[index].action, "")
  }
  function moveCursor(delta) {
    for (var n = 0; n < rows.length; n++) {
      cursor = (cursor + delta + rows.length) % rows.length
      if (rows[cursor].enabled) return
    }
  }

  Column {
    width: parent.width
    spacing: Style.space(5)
    Row {
      width: parent.width
      spacing: Style.space(8)
      Text { text: "Zoom"; color: Color.foreground; font.family: root.themeFont.family; font.pixelSize: root.themeFont.title; font.bold: true }
      Rectangle {
        visible: root.meetingState.state === "meeting"
        anchors.verticalCenter: parent.verticalCenter
        width: liveText.implicitWidth + Style.space(12)
        height: liveText.implicitHeight + Style.space(5)
        radius: Style.space(4)
        color: root.tint(root.meetingState.sharing ? Color.urgent : Color.accent, 0.17)
        Text { id: liveText; anchors.centerIn: parent; text: root.meetingState.sharing ? "SHARING" : "IN MEETING"; color: root.meetingState.sharing ? Color.urgent : Color.accent; font.family: root.themeFont.family; font.pixelSize: root.themeFont.caption; font.bold: true }
      }
    }
    Text { width: parent.width; text: root.meetingState.title || "Open Zoom to connect"; color: Color.foreground; font.family: root.themeFont.family; font.pixelSize: root.themeFont.body; wrapMode: Text.Wrap; maximumLineCount: 2; elide: Text.ElideRight }
    Text { width: parent.width; text: Model.summary(root.meetingState); color: Color.foreground; opacity: 0.65; font.family: root.themeFont.family; font.pixelSize: root.themeFont.caption; wrapMode: Text.Wrap }
  }
  Rectangle { width: parent.width; height: 1; color: root.tint(Color.foreground, 0.15) }
  Column {
    width: parent.width
    spacing: Style.space(2)
    Repeater {
      model: root.rows
      delegate: AbstractButton {
        id: row
        required property var modelData
        required property int index
        objectName: modelData.action
        width: parent.width
        implicitHeight: Style.space(36)
        enabled: modelData.enabled && !root.busy
        hoverEnabled: true
        Accessible.name: modelData.label
        onClicked: root.activate(index)
        background: Rectangle {
          radius: Style.space(5)
          color: row.down ? root.tint(Color.accent, 0.23) : row.hovered || root.cursor === row.index ? root.tint(Color.foreground, 0.09) : "transparent"
        }
        contentItem: Row {
          leftPadding: Style.space(9)
          spacing: Style.space(11)
          opacity: row.enabled ? 1 : 0.4
          Text { anchors.verticalCenter: parent.verticalCenter; width: Style.space(23); text: row.modelData.icon; color: row.modelData.danger ? Color.urgent : Color.foreground; font.family: root.themeFont.family; font.pixelSize: root.themeFont.title }
          Text { anchors.verticalCenter: parent.verticalCenter; text: row.modelData.label; color: row.modelData.danger ? Color.urgent : Color.foreground; font.family: root.themeFont.family; font.pixelSize: root.themeFont.body }
        }
      }
    }
  }
  Column {
    width: parent.width
    visible: root.joining
    spacing: Style.space(8)
    TextField {
      id: joinField
      objectName: "joinField"
      width: parent.width
      enabled: !root.busy
      placeholderText: "Zoom link or meeting ID"
      Accessible.name: placeholderText
      selectByMouse: true
      color: Color.foreground
      placeholderTextColor: root.tint(Color.foreground, 0.5)
      font.family: root.themeFont.family
      font.pixelSize: root.themeFont.body
      background: Rectangle { radius: Style.space(5); color: root.tint(Color.foreground, 0.04); border.color: joinField.activeFocus ? Color.accent : root.tint(Color.foreground, 0.2) }
      onAccepted: root.submitJoin()
      Keys.onEscapePressed: { root.resetJoin(); root.editingFinished() }
    }
    Row {
      spacing: Style.space(8)
      Button {
        id: submit
        objectName: "joinSubmit"
        text: "Join"
        enabled: !root.busy && joinField.text.trim() !== ""
        onClicked: root.submitJoin()
        contentItem: Text { text: submit.text; color: Color.foreground; opacity: submit.enabled ? 1 : 0.4; font.family: root.themeFont.family; font.pixelSize: root.themeFont.body; horizontalAlignment: Text.AlignHCenter }
        background: Rectangle { radius: Style.space(5); color: root.tint(Color.accent, submit.down ? 0.35 : 0.2) }
      }
      Button {
        id: cancel
        text: "Cancel"
        enabled: !root.busy
        onClicked: { root.resetJoin(); root.editingFinished() }
        contentItem: Text { text: cancel.text; color: Color.foreground; font.family: root.themeFont.family; font.pixelSize: root.themeFont.body; horizontalAlignment: Text.AlignHCenter }
        background: Rectangle { radius: Style.space(5); color: root.tint(Color.foreground, cancel.down ? 0.15 : 0.07) }
      }
    }
  }
  Text {
    width: parent.width
    visible: text !== ""
    text: root.busy ? "Working…" : root.feedback
    color: root.feedbackError ? Color.urgent : Color.foreground
    opacity: root.feedbackError ? 1 : 0.7
    font.family: root.themeFont.family
    font.pixelSize: root.themeFont.caption
    wrapMode: Text.Wrap
  }
}
