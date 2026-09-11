.pragma library
function rows(s) {
  var out = [];
  var c = s.capabilities || {};
  if (s.state === "meeting") {
    if (s.sharing) out.push({action:"stop-share", label:"Stop sharing", icon:"󰓛", enabled:!!c.share, danger:true});
    out.push({action:"copy",label:"Copy invite link",icon:"󰌷",enabled:!!c.copy});
    out.push({action:s.muted ? "unmute" : "mute",label:s.muted === null ? "Microphone unavailable" : s.muted ? "Unmute" : "Mute",icon:s.muted ? "󰍭" : "󰍬",enabled:!!c.mic});
    out.push({action:s.cameraOn ? "camera-off" : "camera-on",label:s.cameraOn === null ? "Camera unavailable" : s.cameraOn ? "Turn camera off" : "Turn camera on",icon:s.cameraOn ? "󰕧" : "󰕨",enabled:!!c.video});
    if (!s.sharing) out.push({action:"share",label:"Share screen…",icon:"󰍹",enabled:!!c.share});
    out.push({action:"chat",label:"Chat",icon:"󰍡",enabled:!!c.chat});
    out.push({action:"participants",label:"Participants",icon:"󰡉",enabled:!!c.participants});
    out.push({action:"show",label:"Show meeting",icon:"󰖯",enabled:true});
    out.push({action:"leave",label:"Leave meeting",icon:"󰗼",enabled:!!c.leave,danger:true});
  } else {
    if (s.state === "idle" || s.state === "offline") {
      if (s.clipboardMeeting) out.push({action:"join-clipboard",label:"Join copied meeting",icon:"󰌷",enabled:true});
      out.push({action:"start",label:"Start meeting",icon:"󰐕",enabled:true});
      out.push({action:"join",label:"Join meeting…",icon:"󰖟",enabled:true});
    }
    out.push({action:"show",label:"Open Zoom",icon:"󰕧",enabled:true});
  }
  return out;
}
function summary(s) {
  if (s.state !== "meeting") return s.state === "idle" ? "No active meeting" : s.state === "unknown" ? "Controls unavailable" : "Zoom is not connected";
  return (s.sharing ? "Sharing · " : "") + (s.muted === null ? "Audio not connected" : s.muted ? "Muted" : "Mic on") + " · " + (s.cameraOn === null ? "Camera unavailable" : s.cameraOn ? "Camera on" : "Camera off");
}
