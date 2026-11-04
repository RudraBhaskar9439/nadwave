import {createPublicClient,createWalletClient,custom,http,getAddress,isAddress,type Address,type Hash,type EIP1193Provider} from 'viem'
import artifact from './generated/contract.json'
export const PROJECT_OWNER = getAddress('0xd1DcAAFf9356d5a42f2eE6F90179C4509386a83f'.toLowerCase())
export const chain = {id:10143,name:'Monad Testnet',nativeCurrency:{name:'Monad',symbol:'MON',decimals:18},rpcUrls:{default:{http:['https://testnet-rpc.monad.xyz']}},blockExplorers:{default:{name:'Monadscan',url:'https://testnet.monadscan.com'}},testnet:true} as const
export const publicClient=createPublicClient({chain,transport:http()})
export const abi=artifact.abi
type Injected = EIP1193Provider & {providers?:Injected[];isMetaMask?:boolean}
declare global {interface Window {ethereum?:Injected}}
export function provider() {
  const root=window.ethereum
  const selected=root?.providers?.find(p=>p.isMetaMask)??root
  if (!selected) throw new Error('Open this app in the browser where MetaMask is installed, then connect your wallet.')
  return selected
}
export function subscribeWalletAccountChange(onChange:(address?:Address)=>void) {
  if(!window.ethereum)return ()=>{}
  const injected=provider() as unknown as {on?:(event:string,listener:(value?:unknown)=>void)=>void;removeListener?:(event:string,listener:(value?:unknown)=>void)=>void}
  const changed=(accounts?:unknown)=>{
    const account=Array.isArray(accounts)?accounts[0]:undefined
    onChange(typeof account==='string'&&isAddress(account)?getAddress(account):undefined)
  }
  const disconnected=()=>onChange(undefined)
  injected.on?.('accountsChanged',changed)
  injected.on?.('disconnect',disconnected)
  return ()=>{injected.removeListener?.('accountsChanged',changed);injected.removeListener?.('disconnect',disconnected)}
}
export async function connectWallet() {
  const injected=provider()
  const accounts=await injected.request({method:'eth_requestAccounts'}) as Address[]
  if (!accounts[0]) throw new Error('No wallet account was selected.')
  return getAddress(accounts[0])
}
export async function ensureMonad() {
  const injected=provider()
  try { await injected.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x279f'}]}) }
  catch(error) {
    if ((error as {code?:number}).code!==4902) throw error
    await injected.request({method:'wallet_addEthereumChain',params:[{chainId:'0x279f',chainName:chain.name,nativeCurrency:chain.nativeCurrency,rpcUrls:[...chain.rpcUrls.default.http],blockExplorerUrls:[chain.blockExplorers.default.url]}]})
    await injected.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x279f'}]})
  }
}
async function finalizedReceipt(hash:Hash) {
  const receipt=await publicClient.waitForTransactionReceipt({hash,confirmations:2,timeout:120000})
  if(receipt.status!=='success')throw new Error('The transaction reverted. No changes were applied.')
  const deadline=Date.now()+30000
  while((await publicClient.getBlock({blockTag:'finalized'})).number<receipt.blockNumber){
    if(Date.now()>deadline)throw new Error('Transaction confirmed but finalization is delayed. Check the explorer before trying again.')
    await new Promise(resolve=>setTimeout(resolve,500))
  }
  return receipt
}
export async function deployRegistry(onHash:(hash:Hash)=>void) {
  const account=await connectWallet(); await ensureMonad()
  const client=createWalletClient({account,chain,transport:custom(provider())})
  const hash=await client.deployContract({abi,bytecode:artifact.bytecode as `0x${string}`,args:[PROJECT_OWNER]})
  onHash(hash)
  const receipt=await finalizedReceipt(hash)
  if (!receipt.contractAddress) throw new Error('Contract deployment failed.')
  return getAddress(receipt.contractAddress)
}
export async function writeRoom(address:Address,functionName:'registerRoom'|'setMember'|'closeRoom',args:unknown[],onHash?:(hash:Hash)=>void) {
  const account=await connectWallet(); await ensureMonad()
  const client=createWalletClient({account,chain,transport:custom(provider())})
  const {request}=await publicClient.simulateContract({address,abi,functionName,args,account})
  const hash=await client.writeContract(request);onHash?.(hash)
  await finalizedReceipt(hash)
  return hash
}
export async function isMember(contract:Address,id:`0x${string}`,address:Address) {
  return Boolean(await publicClient.readContract({address:contract,abi,functionName:'isMember',args:[id,address],blockTag:'finalized'}))
}
export async function roomOperator(contract:Address,id:`0x${string}`) {
  const room=await publicClient.readContract({address:contract,abi,functionName:'rooms',args:[id]}) as [Address,bigint,boolean]
  return room[0]
}
export async function verifyRegistry(address:string) {
  if(!isAddress(address)) throw new Error('Enter a valid contract address.')
  const [owner,lifetime]=await Promise.all([publicClient.readContract({address,abi,functionName:'owner'}),publicClient.readContract({address,abi,functionName:'ROOM_LIFETIME'})])
  if(String(owner).toLowerCase()!==PROJECT_OWNER.toLowerCase() || lifetime!==86400n) throw new Error('This contract is not a Nadwave registry for the configured project owner.')
  return getAddress(address)
}
export async function signIdentity(message:string,address:Address) {
  return createWalletClient({account:address,transport:custom(provider())}).signMessage({message})
}
export function errorMessage(error:unknown) {
  const item=error as {shortMessage?:string;message?:string;code?:number}
  return item.code===4001?'Wallet request cancelled. You can try again.':(item.shortMessage||item.message||'Something went wrong. Please try again.').slice(0,220)
}
