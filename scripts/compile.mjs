import solc from 'solc';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
const input = {language:'Solidity',sources:{'NadwaveRooms.sol':{content:readFileSync('contracts/NadwaveRooms.sol','utf8')}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const error of output.errors ?? []) { if (error.severity === 'error') throw new Error(error.formattedMessage); console.warn(error.formattedMessage); }
const contract = output.contracts['NadwaveRooms.sol'].NadwaveRooms;
mkdirSync('src/generated',{recursive:true});
writeFileSync('src/generated/contract.json',JSON.stringify({abi:contract.abi,bytecode:'0x'+contract.evm.bytecode.object,compiler:solc.version()},null,2)+'\n');
console.log(`Compiled NadwaveRooms (${contract.evm.bytecode.object.length/2} bytes).`);
