pragma Singleton
import QtQuick

QtObject {
  property color foreground: "#d6e2ee"
  property color background: "#16242d"
  property color accent: "#8bc9eb"
  property color urgent: "#ff6655"
  property color muted: "#7892a2"
  readonly property QtObject menu: QtObject {
    property color background: "#16242d"
    property color text: "#d6e2ee"
    property color border: "#8bc9eb"
    property color scrim: "#99000000"
    property color selectedBackground: "#334b6a7b"
    property color selectedText: "#8bc9eb"
  }
  readonly property QtObject tooltip: QtObject {
    property color background: "#16242d"
    property color text: "#d6e2ee"
    property color border: "#8bc9eb"
  }
}
