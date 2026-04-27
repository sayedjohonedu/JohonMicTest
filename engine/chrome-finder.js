// Backwards-compatible shim — all logic now lives in browser-finder.js
const { findBrowser, findChrome } = require('./browser-finder');
module.exports = { findChrome, findBrowser };
