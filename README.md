# Manifest – AI Sticky Notes (Chrome Built-in AI)

**Manifest** is a Chrome Extension that turns your to-do list into smart sticky notes, powered by Chrome’s built-in AI.  
It auto-categorizes tasks, sets reminders, and motivates you with a minimal Google-color design.

### ✨ Features
- Add, edit, postpone, skip, or mark tasks done
- AI-based auto-categorization using Chrome’s `LanguageModel.prompt()` API  
- Smart reminders with popup notifications
- Sticky-note color themes (Google palette)
- Day-wise task history and motivational quotes

### 🧠 APIs Used
- **Chrome Prompt API (Built-in AI / Gemini Nano)** – to analyze and categorize user tasks  
  (`await self.ai.languageModel.prompt()`)

### 🛠️ Tech Stack
HTML | CSS | JavaScript | Chrome Extensions Manifest V3 | Chrome Built-in AI

### 🚀 How to Run
1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this folder
5. Open the popup and start adding tasks

### 📸 Demo
Video demo (YouTube): 
