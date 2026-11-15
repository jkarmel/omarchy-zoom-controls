function validWorkspaceName(name) {
  return typeof name === 'string' && name.trim() !== '' && name.length <= 255 && !/[\x00-\x1f\x7f]/.test(name);
}

export function activeWorkspaceName(activeWindow, monitors) {
  const windowName = activeWindow?.workspace?.name;
  if (validWorkspaceName(windowName)) return windowName;
  const focused = Array.isArray(monitors) ? monitors.find(monitor => monitor?.focused) : null;
  if (!focused) return '';
  const specialName = focused.specialWorkspace?.name;
  if (validWorkspaceName(specialName)) return specialName;
  const activeName = focused.activeWorkspace?.name;
  return validWorkspaceName(activeName) ? activeName : '';
}

export function focusWorkspaceDispatch(name) {
  if (!validWorkspaceName(name)) return null;
  return 'hl.dsp.focus({ workspace = ' + JSON.stringify(name) + ' })';
}
