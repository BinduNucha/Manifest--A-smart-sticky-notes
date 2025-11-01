// bg.js — reminder popup + persistent notification

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (!alarm.name.startsWith("task:")) return;
  const taskId = alarm.name.slice(5);

  const { active, history } = await chrome.storage.local.get(["active","history"]);
  const t =
    (active || []).find(x => x.id === taskId) ||
    // fallback: if it moved / reloaded, try to find text in today's history
    (history?.[new Date().toISOString().slice(0,10)] || []).find(x => x.id === taskId);

  const text = t?.text || "It's time!";

  // Show a persistent system notification
  try {
    chrome.notifications.create(`n:${taskId}`, {
      type: "basic",
      title: "Task reminder",
      message: text,
      priority: 2,
      requireInteraction: true // stays until dismissed
      // iconUrl: "icon128.png" // optional, remove if you don't have it
    });
  } catch(e) { console.warn(e); }

  // Open a centered popup window
  const ww = 360, hh = 220;
  let left = 400, top = 300;
  try {
    const displays = await chrome.system.display.getInfo();
    const b = displays?.[0]?.bounds;
    if (b) { left = b.left + Math.round((b.width - ww)/2); top = b.top + Math.round((b.height - hh)/2); }
  } catch {}

  try {
    await chrome.windows.create({
      url: `reminder.html#${encodeURIComponent(taskId)}`,
      type: "popup", width: ww, height: hh, left, top, focused: true
    });
  } catch(e) { console.warn("Popup failed:", e); }
});

// Snooze from reminder window
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "SNOOZE_TASK") {
    chrome.alarms.create(`task:${msg.taskId}`, { when: Date.now() + (msg.minutes||5)*60*1000 });
    sendResponse({ ok: true });
    return true;
  }
});
