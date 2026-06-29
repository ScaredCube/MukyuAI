// Electron Preload Script
// Used to safely expose APIs from main process to renderer process (context isolation)

window.addEventListener('DOMContentLoaded', () => {
  console.log('MukyuAI Preload Loaded');
});
