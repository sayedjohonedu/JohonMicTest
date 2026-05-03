/**
 * http-port.js
 * Singleton that stores the dynamic HTTP server port assigned at startup.
 * This lets the IPC handler in ipc-handlers.js re-launch the STT chrome bridge
 * on the correct port without requiring a full app restart.
 */

let _port = null;

function setHttpPort(port) {
  _port = port;
}

function getHttpPort() {
  return _port;
}

module.exports = { setHttpPort, getHttpPort };
