// Minimal bridge: the page can ask the shell to quit, and nothing else.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- sandboxed preloads must be CommonJS
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voidFrontierDesktop', {
  quit: () => ipcRenderer.send('void-frontier:quit'),
});
