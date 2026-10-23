#!/usr/bin/env node
'use strict';
// Compatibility entry point for existing shortcuts. All inference uses Codex.
require('./codex-bridge.js').main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
