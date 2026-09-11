import QtQuick
import QtTest
import qs.Commons
import ".." as Zoom

Rectangle {
  id: scene
  width: 360
  height: 480
  color: Color.background
  Zoom.MenuContent { id: menu; x: 24; y: 24; width: 312 }
  TestCase {
    name: "ZoomMenu"
    when: windowShown
    SignalSpy { id: spy; target: menu; signalName: "actionRequested" }
    function meeting(sharing) { return {state:"meeting",title:"Weekly team meeting",muted:true,cameraOn:false,sharing:sharing,capabilities:{mic:true,video:true,share:true,copy:true,chat:true,participants:true,leave:true}} }
    function init() { menu.meetingState=meeting(false); menu.busy=false; menu.cursor=-1; menu.resetJoin(); menu.feedback=""; spy.clear() }
    function test_click_and_keyboard() {
      tryVerify(function(){return findChild(menu,"leave").y > findChild(menu,"copy").y})
      var copy=findChild(menu,"copy");verify(copy);mouseClick(copy);compare(spy.signalArguments[0][0],"copy")
      menu.moveCursor(1);compare(menu.cursor,0);menu.activate(menu.cursor);compare(spy.count,2)
      menu.busy=true;mouseClick(copy);menu.activate(0);compare(spy.count,2)
    }
    function test_state_rows() {
      compare(menu.rows[1].action,"unmute");compare(menu.rows[2].action,"camera-on")
      menu.meetingState=meeting(true);compare(menu.rows[0].action,"stop-share");verify(menu.rows.every(function(r){return r.action!=="share"}))
      menu.meetingState={state:"idle",title:"No active meeting",capabilities:{}};compare(menu.rows.length,3);compare(menu.rows[0].action,"start");compare(menu.rows[1].action,"join");compare(menu.rows[2].action,"show")
    }
    function test_idle_join() {
      menu.meetingState={state:"idle",clipboardMeeting:true,capabilities:{}}
      compare(menu.rows[0].action,"join-clipboard")
      menu.activate(2);compare(menu.joining,true);compare(spy.count,0)
      var field=findChild(menu,"joinField");tryCompare(field,"activeFocus",true)
      field.text="https://example.zoom.us/j/12345678901?pwd=test"
      keyClick(Qt.Key_Return)
      compare(spy.signalArguments[0][0],"join");compare(spy.signalArguments[0][1],field.text)
      menu.resetJoin();compare(field.text,"");compare(menu.joining,false)
      menu.meetingState={state:"unknown",capabilities:{}};compare(menu.rows.length,1)
    }
    function test_disabled_keyboard() {
      var s=meeting(false);s.capabilities.copy=false;menu.meetingState=s
      menu.moveCursor(1);compare(menu.cursor,1)
      menu.activate(0);compare(spy.count,0)
    }
    function test_visuals() {
      Color.foreground="#e4e8ef";Color.background="#171b23";Color.accent="#86baff";Color.urgent="#f07c85"
      menu.meetingState=meeting(false)
      waitForRendering(menu);grabImage(scene).save('build/meeting-dark.png')
      menu.meetingState=meeting(true)
      waitForRendering(menu);grabImage(scene).save('build/sharing-dark.png')
      Color.foreground="#263344";Color.background="#f4f5f7";Color.accent="#2457a8";Color.urgent="#b83046"
      waitForRendering(menu);grabImage(scene).save('build/sharing-light.png')
      menu.meetingState={state:"idle",title:"No active meeting",capabilities:{}}
      waitForRendering(menu);grabImage(scene).save('build/idle-light.png')
      menu.meetingState={state:"idle",title:"No active meeting",clipboardMeeting:true,capabilities:{}}
      menu.joining=true
      waitForRendering(menu);grabImage(scene).save('build/join-light.png')
    }
  }
}
