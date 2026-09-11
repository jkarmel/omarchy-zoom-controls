pragma Singleton
import QtQuick

QtObject {
  property int cornerRadius: 4
  property int normalBorderWidth: 1
  readonly property QtObject spacing: QtObject {
    property int xs: 3
    property int sm: 4
    property int md: 6
    property int lg: 8
    property int panelPadding: 18
    property int controlPaddingX: 10
    property int controlPaddingY: 6
    property int controlGap: 8
  }
  readonly property QtObject font: QtObject {
    property string family: "monospace"
    property int caption: 10
    property int bodySmall: 11
    property int body: 12
    property int title: 14
    property int icon: 14
  }
  function space(value) { return value }
  function alpha(color, amount) { return Qt.rgba(color.r, color.g, color.b, amount) }
  function normalFillFor(foreground, accent) { return alpha(foreground, 0.04) }
  function hoverFillFor(foreground, accent) { return alpha(foreground, 0.08) }
  function selectedFillFor(foreground, accent) { return alpha(accent, 0.18) }
  function focusFillFor(foreground, accent) { return alpha(accent, 0.08) }
  function pressedFillFor(foreground, accent) { return alpha(accent, 0.22) }
  function selectionFillFor(foreground, accent) { return alpha(accent, 0.35) }
  function selectedStateColor(foreground, accent) { return accent }
  function controlFill(focused, hot, foreground, accent) {
    return focused ? focusFillFor(foreground, accent) : hot ? hoverFillFor(foreground, accent) : normalFillFor(foreground, accent)
  }
}
