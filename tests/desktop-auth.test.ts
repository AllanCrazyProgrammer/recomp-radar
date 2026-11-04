import test from 'node:test';
import assert from 'node:assert/strict';
import {loginUrl,parseCallback,parseLoginParams,validCallbackOrigin} from '../lib/desktop-auth.ts';

const nonce='0b6c2f1e-3a4d-4e5f-8a9b-1c2d3e4f5a6b';

test('callback can only point to the local app server',()=>{
 assert.ok(validCallbackOrigin('http://localhost:47821'));
 assert.ok(validCallbackOrigin('http://127.0.0.1:47821'));
 for(const bad of ['https://localhost:47821','http://localhost','http://evil.test:47821','http://localhost.evil.test:1','http://localhost:47821/x','http://user@localhost:1'])assert.equal(validCallbackOrigin(bad),false,bad);
});

test('login URL round-trips and rejects tampered parameters',()=>{
 const url=new URL(loginUrl('http://localhost:47821','google',nonce,'http://localhost:47821'));
 assert.deepEqual(parseLoginParams(url.search),{provider:'google',nonce,callback:'http://localhost:47821'});
 assert.equal(parseLoginParams('?desktop-login=google&nonce=x&cb=http://localhost:47821'),null);
 assert.equal(parseLoginParams(`?desktop-login=facebook&nonce=${nonce}&cb=http://localhost:47821`),null);
 assert.equal(parseLoginParams(`?desktop-login=google&nonce=${nonce}&cb=https://evil.test`),null);
});

test('callback body requires the nonce and a usable token',()=>{
 assert.ok(parseCallback({nonce,provider:'google',idToken:'eyJhbGciOiJSUzI1NiJ9.payload.sig'}));
 assert.ok(parseCallback({nonce,provider:'github',accessToken:'gho_abcdefghijklmnop'}));
 assert.equal(parseCallback({nonce,provider:'github',idToken:'eyJhbGciOiJSUzI1NiJ9.x.y'}),null);
 assert.equal(parseCallback({nonce:'nope',provider:'google',idToken:'eyJhbGciOiJSUzI1NiJ9.x.y'}),null);
 assert.equal(parseCallback({nonce,provider:'google',idToken:'bad token with spaces'}),null);
 assert.equal(parseCallback(null),null);
});
