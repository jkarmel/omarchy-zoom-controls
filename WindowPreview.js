.pragma library

var ZOOM_CLASS = "zoom-controls-chromium"

function findZoomToplevel(values, className) {
  var expected = String(className || ZOOM_CLASS)
  if (!values) return null
  for (var i = 0; i < values.length; i++) {
    var toplevel = values[i]
    if (!toplevel) continue
    var ipc = toplevel.lastIpcObject || {}
    var appId = String((toplevel.wayland && toplevel.wayland.appId) || "")
    if (String(ipc.class || "") === expected ||
        String(ipc.initialClass || "") === expected ||
        appId === expected) return toplevel
  }
  return null
}

function fit(sourceWidth, sourceHeight, frameWidth, frameHeight) {
  var sw = Number(sourceWidth), sh = Number(sourceHeight)
  var fw = Math.max(0, Number(frameWidth) || 0), fh = Math.max(0, Number(frameHeight) || 0)
  if (!(sw > 0) || !(sh > 0) || !(fw > 0) || !(fh > 0)) return {width: fw, height: fh}
  var sourceAspect = sw / sh
  var frameAspect = fw / fh
  if (sourceAspect >= frameAspect) return {width: Math.round(fw), height: Math.round(fw / sourceAspect)}
  return {width: Math.round(fh * sourceAspect), height: Math.round(fh)}
}

if (typeof module !== "undefined") module.exports = {
  ZOOM_CLASS: ZOOM_CLASS,
  findZoomToplevel: findZoomToplevel,
  fit: fit
}
