import { VM } from '@ethereumjs/vm';
import { Common, Chain, Hardfork } from '@ethereumjs/common';
import { Address, Account } from '@ethereumjs/util';
import { Block } from '@ethereumjs/block';
import { encodeDeployData, encodeFunctionData, decodeFunctionResult } from 'viem';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const artifact = JSON.parse(readFileSync('src/generated/contract.json', 'utf8'));
const common = new Common({ chain: Chain.Mainnet, hardfork: Hardfork.Shanghai });
const vm = await VM.create({ common });
const accounts = [4097, 4098, 4099, 4100].map(n => `0x${n.toString(16).padStart(40, '0')}`);
for (const account of accounts) await vm.stateManager.putAccount(Address.fromString(account), Account.fromAccountData({ balance: 10n ** 20n }));
let timestamp = 1000n;
const block = () => Block.fromBlockData({ header: { timestamp } }, { common });
const deployment = await vm.evm.runCall({
  caller: Address.fromString(accounts[0]),
  data: Buffer.from(encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: [accounts[3]] }).slice(2), 'hex'),
  gasLimit: 10_000_000n,
  block: block(),
});
assert.equal(deployment.execResult.exceptionError, undefined, 'contract must deploy');
const address = deployment.createdAddress;
assert(address, 'deployment must return a contract address');
let checks = 0;
async function check(label, fn) { await fn(); checks++; console.log(`✓ ${label}`); }
async function call(account, functionName, args = [], shouldRevert = false) {
  const result = await vm.evm.runCall({
    caller: Address.fromString(account), to: address,
    data: Buffer.from(encodeFunctionData({ abi: artifact.abi, functionName, args }).slice(2), 'hex'),
    gasLimit: 10_000_000n, block: block(),
  });
  if (shouldRevert) { assert(result.execResult.exceptionError, `${functionName} must reject this caller/input`); return; }
  assert.equal(result.execResult.exceptionError, undefined, `${functionName} must succeed`);
  return decodeFunctionResult({ abi: artifact.abi, functionName, data: `0x${Buffer.from(result.execResult.returnValue).toString('hex')}` });
}
const read = (functionName, args = []) => call(accounts[0], functionName, args);
const room = '0x00112233445566778899aabbccddeeff';
await check('project administrator is assigned', async () => assert.equal((await read('owner')).toLowerCase(), accounts[3]));
await check('unknown room rejects membership', async () => assert.equal(await read('isMember', [room, accounts[0]]), false));
await check('room owner becomes a member', async () => { await call(accounts[0], 'registerRoom', [room]); assert.equal(await read('isMember', [room, accounts[0]]), true); });
await check('duplicate room ids cannot replace ownership', () => call(accounts[1], 'registerRoom', [room], true));
await check('unauthorized wallet cannot approve members', () => call(accounts[1], 'setMember', [room, accounts[1], true], true));
await check('owner can approve another wallet', async () => { await call(accounts[0], 'setMember', [room, accounts[1], true]); assert.equal(await read('isMember', [room, accounts[1]]), true); });
await check('owner can remove another wallet', async () => { await call(accounts[0], 'setMember', [room, accounts[1], false]); assert.equal(await read('isMember', [room, accounts[1]]), false); });
await check('unauthorized wallet cannot close room', () => call(accounts[1], 'closeRoom', [room], true));
await check('administrator can retire a room', async () => { await call(accounts[3], 'closeRoom', [room]); assert.equal(await read('isMember', [room, accounts[0]]), false); });
await check('closed rooms cannot receive memberships', () => call(accounts[0], 'setMember', [room, accounts[1], true], true));
const second = '0xff112233445566778899aabbccddeeff';
await check('rooms expire after 24 hours', async () => { await call(accounts[0], 'registerRoom', [second]); timestamp += 86401n; assert.equal(await read('isMember', [second, accounts[0]]), false); });
console.log(`${checks} contract checks passed.`);
