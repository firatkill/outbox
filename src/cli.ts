#!/usr/bin/env node

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(__OUTBOX_VERSION__);
}
