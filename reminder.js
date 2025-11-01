// reminder.js
(async function(){
  const taskId = decodeURIComponent(location.hash.slice(1));
  const textEl = document.getElementById("text");

  // Load task text to display
  const { active } = await chrome.storage.local.get(["active"]);
  const t = (active || []).find(x => x.id === taskId);
  textEl.textContent = t ? t.text : "It's time!";

  document.getElementById("snooze5").onclick = async () => {
    chrome.runtime.sendMessage({ type:"SNOOZE_TASK", taskId, minutes:5 }, () => window.close());
  };

  document.getElementById("done").onclick = async () => {
    // Move to history (Done) immediately
    const { active, history } = await chrome.storage.local.get(["active","history"]);
    const idx = (active||[]).findIndex(x => x.id === taskId);
    if (idx >= 0) {
      const t = active[idx];
      active.splice(idx,1);
      const key = new Date().toISOString().slice(0,10);
      (history[key] ||= []).unshift({ text:t.text, category:t.category, status:"done", timeISO:new Date().toISOString() });
      await chrome.storage.local.set({ active, history });
    }
    window.close();
  };

  document.getElementById("close").onclick = () => window.close();
})();
