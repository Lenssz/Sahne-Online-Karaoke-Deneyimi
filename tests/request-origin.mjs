import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const environment = { APP_URL: 'https://studio.example.com' };
async function load(file, imports) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, URL, Headers, Request, Response,
    process: { env: environment },
    require: name => Object.hasOwn(imports, name) ? imports[name] : require(name),
  });
  return exports;
}

const origin = await load('../lib/request-origin.ts', { 'server-only': {} });
const request = (target, source, extra = {}) => new Request(target, {
  method: 'POST', headers: { ...(source !== null ? { Origin: source } : {}), ...extra },
});
const cases = [
  ['Local access with a public APP_URL', 'http://localhost:3000/api/roles', 'http://localhost:3000', {}, true],
  ['IPv4 loopback', 'http://127.0.0.1:3000/api/roles', 'http://127.0.0.1:3000', {}, true],
  ['IPv6 loopback', 'http://[::1]:3000/api/roles', 'http://[::1]:3000', {}, true],
  ['Configured public site behind a tunnel', 'http://localhost:3000/api/roles', 'https://studio.example.com', { Host: 'studio.example.com' }, true],
  ['Unconfigured public site', 'https://other.example.com/api/roles', 'https://other.example.com', {}, false],
  ['Cross-site request to local app', 'http://localhost:3000/api/roles', 'https://evil.example.com', {}, false],
  ['Missing origin', 'http://localhost:3000/api/roles', null, {}, false],
  ['Opaque origin', 'http://localhost:3000/api/roles', 'null', {}, false],
  ['Different local port', 'http://localhost:3000/api/roles', 'http://localhost:4000', {}, false],
  ['Public target with a forged local Host', 'https://other.example.com/api/roles', 'http://localhost:3000', { Host: 'localhost:3000' }, false],
  ['Local URL with a public Host', 'http://localhost:3000/api/roles', 'http://localhost:3000', { Host: 'other.example.com' }, false],
  ['Forwarded Host does not grant access', 'https://other.example.com/api/roles', 'http://localhost:3000', { 'X-Forwarded-Host': 'localhost:3000' }, false],
  ['Deceptive localhost hostname', 'http://localhost.evil.example.com:3000/api/roles', 'http://localhost.evil.example.com:3000', {}, false],
  ['Origin with a path', 'http://localhost:3000/api/roles', 'https://studio.example.com/path', {}, false],
  ['Origin with credentials', 'http://localhost:3000/api/roles', 'https://user@studio.example.com', {}, false],
];
for (const [label, target, source, extra, expected] of cases) {
  assert.equal(origin.isTrustedRequest(request(target, source, extra)), expected, label);
}
assert.equal(origin.isTrustedOrigin(new Headers({ Origin: 'http://localhost:3000', Host: 'localhost:3000' })), true, 'Local server action');
assert.equal(origin.isTrustedOrigin(new Headers({ Origin: 'http://localhost:3000', Host: 'other.example.com' })), false, 'Server action Host mismatch');
environment.APP_URL = 'not-a-url';
assert.equal(origin.isTrustedRequest(request('http://localhost:3000/api/roles', 'http://localhost:3000')), true, 'Local use does not require a public URL');
assert.equal(origin.isTrustedRequest(request('https://other.example.com/api/roles', 'https://other.example.com')), false, 'Invalid configuration does not allow public origins');
environment.APP_URL = 'https://studio.example.com';

let authenticated = true;
let admin = true;
let rpcCalls = 0;
const route = await load('../app/api/rooms/[roomId]/roles/route.ts', {
  'next/cache': { revalidatePath() {} },
  'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  '@/lib/auth': { getViewer: async () => authenticated ? { isAdmin: admin, db: { rpc: async () => { rpcCalls++; return { error: null }; } } } : null },
  '@/lib/storage-cleanup': { drainStorageCleanup: async () => ({ pending: false }) },
  '@/lib/request-origin': origin,
});
const roomId = '10000000-0000-4000-8000-000000000001';
const roleId = '10000000-0000-4000-8000-000000000002';
const context = { params: Promise.resolve({ roomId }) };
const roleRequest = source => new Request(`http://localhost:3000/api/rooms/${roomId}/roles`, {
  method: 'POST', headers: { Origin: source, 'Content-Type': 'application/json' },
  body: JSON.stringify({ roleId }),
});
assert.equal((await route.POST(roleRequest('http://localhost:3000'), context)).status, 200, 'Role claiming works locally while APP_URL is public');
assert.equal(rpcCalls, 1);
assert.equal((await route.POST(roleRequest('https://evil.example.com'), context)).status, 403, 'Cross-site claim denied before RPC');
assert.equal(rpcCalls, 1);
authenticated = false;
assert.equal((await route.POST(roleRequest('http://localhost:3000'), context)).status, 403, 'No session cannot claim a role');
assert.equal(rpcCalls, 1);
authenticated = true; admin = false;
assert.equal((await route.DELETE(roleRequest('http://localhost:3000'), context)).status, 403, 'A member cannot remove a role owner');
assert.equal(rpcCalls, 1);
let inviteHeaders = new Headers({ Origin: 'http://localhost:3000', Host: 'localhost:3000' });
let inviteAllowed = true;
let inviteCalls = 0;
let inviteToken = 'a'.repeat(64);
const inviteActions = await load('../app/admin/actions.ts', {
  'next/cache': { revalidatePath() {} },
  'next/navigation': { redirect() { throw new Error('Unexpected redirect'); } },
  'next/headers': { headers: async () => inviteHeaders },
  '@/lib/request-origin': origin,
  '@/lib/auth': { requireAdmin: async () => {
    if (!inviteAllowed) throw new Error('ADMIN_REQUIRED');
    return { db: { rpc: async (name, fields) => {
      assert.equal(name, 'create_room_invite_link');
      assert.equal(fields.p_room, roomId);
      inviteCalls++;
      return { data: inviteToken, error: null };
    } } };
  } },
});
const form = new FormData();
form.set('room_id', roomId);
const localInvite = await inviteActions.inviteRoom({}, form);
assert.equal(localInvite.url, `http://localhost:3000/invite#token=${inviteToken}`, 'Local test invitation does not use configured public APP_URL');
inviteHeaders = new Headers({ Origin: 'https://studio.example.com', Host: 'studio.example.com' });
assert.equal((await inviteActions.inviteRoom({}, form)).url, `https://studio.example.com/invite#token=${inviteToken}`, 'Public invitation uses the verified public address');
const createdInvites = inviteCalls;
inviteHeaders = new Headers({ Origin: 'https://untrusted.example', Host: 'untrusted.example' });
assert.ok((await inviteActions.inviteRoom({}, form)).error, 'Untrusted origin cannot generate invitations');
assert.equal(inviteCalls, createdInvites);
inviteHeaders = new Headers({ Host: 'localhost:3000' });
assert.ok((await inviteActions.inviteRoom({}, form)).error, 'Missing origin cannot generate invitations');
assert.equal(inviteCalls, createdInvites);
inviteHeaders = new Headers({ Origin: 'http://localhost:3000', Host: 'localhost:3000' });
inviteToken = 'invalid token';
assert.ok((await inviteActions.inviteRoom({}, form)).error, 'Malformed token is never used in a link');
const previousCalls = inviteCalls;
inviteAllowed = false;
await assert.rejects(inviteActions.inviteRoom({}, form), /ADMIN_REQUIRED/, 'A member cannot generate invitations');
assert.equal(inviteCalls, previousCalls);
console.log('29 origin, role authorization and invitation checks passed.');
