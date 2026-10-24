'use strict';
const readline = require('node:readline');
const mode = process.argv[2] || 'normal';
let loggedIn = mode === 'existing', pending;
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  const { id, method } = JSON.parse(line);
  if (method === 'initialize') return send({ id, result: {} });
  if (method === 'initialized') return;
  if (method === 'account/read') return send({ id, result: { account: loggedIn ? { type: 'chatgpt', email: 'not-returned@example.invalid', planType: 'plus' } : null, requiresOpenaiAuth: true } });
  if (method === 'account/login/start') {
    const loginId = 'fixture-login';
    send({ id, result: { type: 'chatgpt', loginId, authUrl: mode === 'bad-url' ? 'https://auth.openai.com.attacker.invalid/' : 'https://auth.openai.com/authorize?state=fixture' } });
    if (mode === 'pending' || mode === 'bad-url') return;
    pending = setTimeout(() => { loggedIn = true; send({ method: 'account/login/completed', params: { loginId, success: true, error: null } }); }, mode === 'browser' ? 500 : 40);
    return;
  }
  if (method === 'account/login/cancel') { clearTimeout(pending); return send({ id, result: {} }); }
  send({ id, error: { message: 'Unexpected fixture method.' } });
});
