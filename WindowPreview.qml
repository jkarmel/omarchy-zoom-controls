import QtQuick
import QtQuick.Effects
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import "WindowPreview.js" as Preview

Rectangle {
  id: root
  property var toplevel: null
  property bool live: false
  readonly property bool hasSource: !!(root.toplevel && root.toplevel.wayland)
  readonly property var frame: Preview.fit(capture.sourceSize.width, capture.sourceSize.height, width, height)

  visible: hasSource
  implicitHeight: Math.round(width * 9 / 16)
  radius: Style.space(6)
  color: Qt.tint(Commons.Color.background, Qt.rgba(Commons.Color.foreground.r, Commons.Color.foreground.g, Commons.Color.foreground.b, 0.05))
  clip: true

  Item {
    id: captureFrame
    anchors.centerIn: parent
    width: root.frame.width
    height: root.frame.height

    Item {
      id: maskShape
      anchors.fill: parent
      visible: false
      layer.enabled: true
      Rectangle {
        anchors.fill: parent
        radius: root.radius
        color: "white"
        antialiasing: true
      }
    }

    Item {
      anchors.fill: parent
      layer.enabled: true
      layer.effect: MultiEffect {
        maskEnabled: true
        maskSource: maskShape
        maskThresholdMin: 0.3
        maskSpreadAtMin: 0.3
      }

      ScreencopyView {
        id: capture
        anchors.fill: parent
        captureSource: root.live && root.hasSource ? root.toplevel.wayland : null
        live: root.live && root.visible
        paintCursor: false
      }
    }
  }

  Rectangle {
    anchors.fill: parent
    z: 1
    radius: root.radius
    color: "transparent"
    border.width: 1
    border.color: Qt.tint(Commons.Color.background, Qt.rgba(Commons.Color.foreground.r, Commons.Color.foreground.g, Commons.Color.foreground.b, 0.2))
  }

  Text {
    textFormat: Text.PlainText
    anchors.centerIn: parent
    visible: !capture.hasContent
    text: "󰕧"
    color: Commons.Color.foreground
    opacity: 0.5
    font.family: Style.font.family
    font.pixelSize: Style.font.title * 2
  }
}
