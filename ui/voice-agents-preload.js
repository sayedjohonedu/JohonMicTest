const { contextBridge, ipcRenderer } = require('electron');

function onChannel(channel, cb) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, cb);
}

contextBridge.exposeInMainWorld('agentAPI', {
  platform: process.platform,
  // Agent CRUD
  getAgents:    ()           => ipcRenderer.invoke('agents-get-all'),
  addAgent:     (data)       => ipcRenderer.invoke('agents-add', data),
  updateAgent:  (id, updates)=> ipcRenderer.invoke('agents-update', { id, updates }),
  deleteAgent:  (id)         => ipcRenderer.invoke('agents-delete', id),
  resetJarvis:  ()           => ipcRenderer.invoke('agents-reset-jarvis'),
  reorderAgents:(ids)        => ipcRenderer.invoke('agents-reorder', ids),

  // LLM profiles (for the profile dropdown)
  vaultGetLlmProfiles: ()    => ipcRenderer.invoke('vault-get-llm-profiles'),
  // Live sync
  onAgentsUpdated: (cb)      => onChannel('agents-updated', () => cb()),
  // Window controls
  closeWindow:  ()           => ipcRenderer.send('close-voice-agents-window'),
  // Theme & config
  getConfig:    ()           => ipcRenderer.invoke('get-config'),
  onConfigUpdate: (cb)       => onChannel('config-updated', (_, cfg) => cb(cfg)),
  // File browse dialog (for file-system block)
  browseForFile: ()          => ipcRenderer.invoke('agents-browse-file'),
  // JS block enable (persists voiceAgentsConfig.jsEnabled = true)
  enableJs:     ()           => ipcRenderer.invoke('agents-enable-js'),
  // Real-execution test: runs buildPipeline + LLM call on main process
  runAgentTest: (agentId, testInput, testValues) =>
    ipcRenderer.invoke('agents-run-test', { agentId, testInput, testValues }),
});

