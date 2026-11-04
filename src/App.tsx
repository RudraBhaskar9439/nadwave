import deployment from './deployment.json'
import {useEffect,useRef,useState,type FormEvent} from 'react'
import {ArrowDownLeft,ArrowRight,AudioLines,Check,ChevronDown,ExternalLink,Globe2,Headphones,Link2,Loader2,LockKeyhole,MessageCircle,Mic,MicOff,Plus,Radio,Send,Settings2,ShieldCheck,Signal,Users,Video,Volume2,VolumeX,Wallet,X} from 'lucide-react'
import {isAddress,type Address,type Hash} from 'viem'
import {inviteURL,newInvite,parseInvite,type Invite} from './crypto'
import {startSession,type Session,type Chat,type Person} from './realtime'
import {PROJECT_OWNER,chain,connectWallet,deployRegistry,errorMessage,isMember,roomOperator,subscribeWalletAccountChange,verifyRegistry,writeRoom} from './wallet'

const short=(value:string)=>`${value.slice(0,6)}…${value.slice(-4)}`
const time=(value:number)=>new Date(value).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
function AudioPlayer({stream,muted}:{stream:MediaStream;muted:boolean}) {
 const ref=useRef<HTMLAudioElement>(null)
 const [blocked,setBlocked]=useState(false)
 useEffect(()=>{if(ref.current){ref.current.srcObject=stream;void ref.current.play().catch(()=>setBlocked(true))}},[stream])
 return <><audio ref={ref} autoPlay playsInline muted={muted}/>{blocked&&<button className="small-button" onClick={()=>{void ref.current?.play().then(()=>setBlocked(false))}}>Enable incoming audio</button>}</>
}
function CameraPlayer({stream}:{stream:MediaStream}) {
 const ref=useRef<HTMLVideoElement>(null)
 useEffect(()=>{if(ref.current){ref.current.srcObject=stream;void ref.current.play().catch(()=>{})}},[stream])
 return <video ref={ref} autoPlay playsInline muted className="camera-tile" aria-label="Participant camera"/>
}
function Modal({title,children,onClose}:{title:string;children:React.ReactNode;onClose:()=>void}) {
 const ref=useRef<HTMLDialogElement>(null)
 useEffect(()=>{ref.current?.showModal();return()=>ref.current?.close()},[])
 return <dialog ref={ref} onCancel={onClose} aria-label={title}><div className="modal-head"><span className="eyebrow">NADWAVE / PRIVATE FREQUENCIES</span><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div><h2>{title}</h2>{children}</dialog>
}
export default function App() {
 const [invite,setInvite]=useState<Invite>()
 const [pending,setPending]=useState<Invite>()
 const [dialog,setDialog]=useState<'create'|'join'|'network'|'about'|null>(null)
 const [displayName,setDisplayName]=useState(sessionStorage.getItem('nadwave-name')||'')
 const [roomName,setRoomName]=useState('The listening room')
 const [link,setLink]=useState('')
 const [registry,setRegistry]=useState<Address|undefined>(()=>{const value=new URLSearchParams(location.search).get('registry')||localStorage.getItem('nadwave-registry')||deployment.address;return value&&isAddress(value)?value:undefined})
 const [contractInput,setContractInput]=useState('')
 const [onchain,setOnchain]=useState(!!registry)
 const [wallet,setWallet]=useState<Address>()
 const [operator,setOperator]=useState<Address>()
 const [approveAddress,setApproveAddress]=useState('')
 const [busy,setBusy]=useState('')
 const [notice,setNotice]=useState('')
 const [error,setError]=useState('')
 const [tx,setTx]=useState<Hash>()
 const [people,setPeople]=useState<Person[]>([])
 const [chats,setChats]=useState<Chat[]>([])
 const [message,setMessage]=useState('')
 const [mic,setMic]=useState(false)
 const [deaf,setDeaf]=useState(false)
 const [streams,setStreams]=useState<Record<string,MediaStream>>({})
 const [camera,setCamera]=useState<MediaStream>()
 const [cameraOn,setCameraOn]=useState(false)
 const [active,setActive]=useState(false)
 const [localLink,setLocalLink]=useState(false)
 const [copied,setCopied]=useState(false)
 const session=useRef<Session|undefined>(undefined)
 const chatEnd=useRef<HTMLDivElement>(null)
 const generation=useRef(0)

 useEffect(()=>{function read(){if(!location.hash)return;try{setPending(parseInvite(location.href));setDialog('join')}catch(e){setError(errorMessage(e))}}read();window.addEventListener('hashchange',read);return()=>{window.removeEventListener('hashchange',read);generation.current++;session.current?.leave()}},[])
 useEffect(()=>subscribeWalletAccountChange(address=>{if(session.current)leave();setWallet(address)}),[registry])
 useEffect(()=>{const container=chatEnd.current?.parentElement;if(container)container.scrollTop=container.scrollHeight},[chats.length])
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),5000);return()=>clearTimeout(timer)},[notice])
 async function run(label:string,fn:()=>Promise<void>){setError('');setBusy(label);try{await fn()}catch(e){setError(errorMessage(e))}finally{setBusy('')}}
 async function connect(){const account=await connectWallet();setWallet(account);return account}
 async function enter(next:Invite){
   const request=++generation.current
   session.current?.leave();setActive(false);setPeople([]);setChats([]);setStreams({});setMic(false);setLocalLink(false);setCamera(undefined);setCameraOn(false)
   let account=wallet
   if(next.contract){account=await connect();setOperator(await roomOperator(next.contract,next.id))}else setOperator(undefined)
   const nextSession=await startSession(next,displayName,account,{
    onPeople:setPeople,onLocalLink:setLocalLink,onChat:chat=>setChats(old=>[...old.slice(-199),chat]),
    onStream:(stream,id)=>setStreams(old=>({...old,[id+':'+stream.id]:stream})),
    onLeave:id=>setStreams(old=>Object.fromEntries(Object.entries(old).filter(([key])=>!key.startsWith(id+':')))),
    onError:message=>{setError(message);if(message.includes('ended')||message.includes('expired')){setActive(false);setMic(false);setStreams({});setCamera(undefined);setCameraOn(false)}},
   })
   if(request!==generation.current){nextSession.leave();return}
   session.current=nextSession;setInvite(next);setPending(undefined);setActive(true);setDialog(null)
   sessionStorage.setItem('nadwave-name',displayName.trim());history.replaceState(null,'',inviteURL(next))
 }
 function leave(){generation.current++;session.current?.leave();session.current=undefined;setInvite(undefined);setActive(false);setLocalLink(false);setChats([]);setPeople([]);setStreams({});setMic(false);setCamera(undefined);setCameraOn(false);setOperator(undefined);history.replaceState(null,'',location.pathname+(registry?'?registry='+registry:''))}
 async function create(event:FormEvent){event.preventDefault();await run('Creating your room',async()=>{
  const next=newInvite(roomName)
  if(onchain){if(!registry)throw new Error('Deploy or connect a registry first.');await connect();await writeRoom(registry,'registerRoom',[next.id],setTx);next.contract=registry}
  await enter(next)
 })}
 async function join(event:FormEvent){event.preventDefault();await run('Joining frequency',async()=>{await enter(pending??parseInvite(link))})}
 async function send(event:FormEvent){event.preventDefault();if(!session.current||!message.trim())return;const text=message;setMessage('');try{const chat=await session.current.send(text);setChats(old=>[...old.slice(-199),chat])}catch(e){setMessage(text);setError(errorMessage(e))}}
 async function copyInvite(){if(!invite)return;try{await navigator.clipboard.writeText(inviteURL(invite));setCopied(true);setTimeout(()=>setCopied(false),2500)}catch{setLink(inviteURL(invite));setNotice('Clipboard unavailable. Open Invite and copy the link manually.')}}
 const roomPeople=active?[{id:'self',name:displayName||'You',address:wallet},...people]:[]
 const isOwner=!!wallet&&!!operator&&wallet.toLowerCase()===operator.toLowerCase()
 return <div className="app-shell">
  <aside className="sidebar">
   <a className="brand" href={location.pathname} onClick={e=>{e.preventDefault();if(!active)leave()}} aria-label="Nadwave home"><span className="brand-mark"><AudioLines size={25}/></span>nadwave<span className="brand-dot">®</span></a>
   <div className="workspace"><span className="workspace-icon"><Radio size={18}/></span><div><strong>Your airspace</strong><small>Private by invitation</small></div><ChevronDown size={15}/></div>
   <span className="nav-label">WORKSPACE</span>
   <button className="nav-item selected" onClick={()=>{if(!active)setDialog('create')}}><Radio size={18}/>Live rooms<span className="nav-count">{active?1:0}</span></button>
   <button className="nav-item" onClick={()=>{setPending(undefined);setLink('');setDialog('join')}}><Link2 size={18}/>Join a frequency<ArrowDownLeft size={14}/></button>
   <button className="nav-item" onClick={()=>setDialog('network')}><ShieldCheck size={18}/>Monad connection<span className={'tiny-dot '+(registry?'online':'')}/></button>
   <div className="room-label"><span className="nav-label">YOUR FREQUENCIES</span><button className="icon-button" aria-label="Create room" onClick={()=>setDialog('create')}><Plus size={17}/></button></div>
   {invite?<button className="frequency-item"><span className="tiny-dot online"/><span>{invite.name}</span><LockKeyhole size={13}/></button>:<p className="sidebar-empty">A little quieter here.<br/>Start a room. Bring your people.</p>}
   <button className="new-frequency" onClick={()=>setDialog('create')}><Plus size={17}/>Create a room</button>
   <div className="sidebar-bottom"><div className="privacy-card"><ShieldCheck size={22}/><strong>Good conversations.<br/>No audience required.</strong><p>Your voice travels peer to peer.<br/>Your messages stay encrypted.</p><button onClick={()=>setDialog('about')}>How Nadwave works <ArrowRight size={14}/></button></div>
   <button className="profile" onClick={()=>setDialog('network')}><span className="avatar small">{(displayName||'N').slice(0,1).toUpperCase()}</span><span><strong>{displayName||'Your space'}</strong><small>{wallet?short(wallet):'Wallet not connected'}</small></span><Settings2 size={17}/></button></div>
  </aside>
  <div className="main-shell">
   <header className="topbar"><div className="breadcrumb">Workspace<span>/</span><strong>{invite?'Live room':'Live rooms'}</strong></div><div className="top-actions"><span className="network-pill"><span className={'tiny-dot '+(registry?'online':'')}/>Monad testnet</span><button className="wallet-button" onClick={()=>void run('Connecting wallet',async()=>{await connect();setNotice('Wallet connected.')} )}><Wallet size={15}/>{wallet?short(wallet):'Connect wallet'}</button></div></header>
   <main>
    <div className="page-heading"><div><div className="eyebrow"><span className="tiny-dot online"/>A LITTLE LESS NOISE. A LITTLE MORE CONNECTION.</div><h1>{invite?invite.name:<>Your people.<br className="mobile-break"/> Your frequency.</>}</h1><p>{invite?'A private corner of the internet. Make yourself at home.':'Drop into a conversation that belongs to you.'}</p></div><button className="primary-button" onClick={()=>{if(invite)void copyInvite();else setDialog('create')}}>{invite?<Link2 size={17}/>:<Plus size={18}/>} {invite?(copied?'Invite copied':'Invite people'):'Create a room'}</button></div>
    {(error||notice)&&<div className={'notification '+(error?'error':'')} role={error?'alert':'status'}><span>{error||notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={()=>{setError('');setNotice('')}}><X size={16}/></button></div>}
    <div className="studio-grid">
     <section className="studio" aria-label="Live audio room">
      <div className="studio-top"><span className="live-pill"><span className={'tiny-dot '+(active?'online':'')}/>{active?'ROOM OPEN':'READY WHEN YOU ARE'}</span><span><LockKeyhole size={13}/>{invite?.contract?'Wallet approved':'Invite only'}</span></div>
      <div className={'record-space '+(mic?'is-playing':'')}>{(cameraOn||Object.values(streams).some(s=>s.getVideoTracks().length>0))&&<div className="camera-grid">{cameraOn&&camera&&<CameraPlayer stream={camera}/>} {Object.entries(streams).filter(([,s])=>s.getVideoTracks().length>0).map(([id,s])=><CameraPlayer key={id} stream={s}/>)}</div>}<div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="record"><div className="record-groove"/><div className="record-label"><AudioLines size={38} strokeWidth={1.4}/><span>NADWAVE</span><small>SIDE A / YOUR FREQUENCY</small></div><div className="record-hole"/></div><span className="record-tag">EST. 2026 — STAY ON YOUR WAVELENGTH</span></div>
      <div className="studio-title"><span className="eyebrow">{active?'THE CHANNEL IS YOURS':'FIND YOUR SIGNAL'}</span><h2>{active?(mic?'You’re on air.':'You’re in good company.'):'Small rooms. Real connection.'}</h2><p>{active?(people.length?`${people.length+1} people here. No recordings. Just this moment.`:'You’re the first one here. Share an invite to start the conversation.'):'A live voice room, a private chat, and a place to just be.'}</p></div>
      <div className="waveform" aria-hidden="true">{Array.from({length:47},(_,i)=><i key={i} style={{height:`${8+Math.sin(i*1.8)**2*24}px`,animationDelay:`${i*.04}s`}}/>)}</div>
      <div className="studio-footer"><span><ShieldCheck size={14}/>Encrypted peer to peer</span><span><Signal size={14}/>{active?(localLink?'Local tab chat linked':`${people.length} peer${people.length===1?'':'s'} connected`):'No session active'}</span></div>
     </section>
     <section className="chat-panel" aria-label="Room chat"><div className="chat-header"><h2><MessageCircle size={18}/>Room chat</h2><span className="label">EPHEMERAL</span></div><div className="chat-body">
      <div className="chat-welcome"><span className="chat-symbol"><LockKeyhole size={22}/></span><strong>A conversation, just for this room.</strong><p>Messages are encrypted and live only in connected browsers. Nothing is saved to a server.</p></div>
      {chats.map(chat=><div className={'chat-message '+(chat.person.id===session.current?.self.id?'own':'')} key={chat.id}><span className="avatar mini">{chat.person.name.slice(0,1).toUpperCase()}</span><div><div className="message-meta"><strong>{chat.person.name}</strong>{chat.person.address&&<ShieldCheck size={12}/>}<time>{time(chat.at)}</time></div><p>{chat.text}</p></div></div>)}<div ref={chatEnd}/>
     </div><form className="chat-input" onSubmit={send}><input aria-label="Message" placeholder={active?'Say something good…':'Create or join a room to chat'} value={message} onChange={e=>setMessage(e.target.value)} maxLength={2000} disabled={!active}/><button aria-label="Send message" disabled={!active||!message.trim()}><Send size={17}/></button></form><p className="chat-hint"><LockKeyhole size={11}/>Only connected participants receive messages.</p></section>
    </div>
    {localLink&&<p className="local-hint">Local tab chat is connected. Audio and camera between devices require a WebRTC connection.</p>}<div className="below-grid"><section className="participants"><div className="section-heading"><h2>In this room <span>{roomPeople.length.toString().padStart(2,'0')}</span></h2><Users size={17}/></div>{roomPeople.length?<div className="people-list">{roomPeople.map((person,i)=><div className="person" key={person.id}><span className={'avatar '+(i===0?'host':'')}>{person.name.slice(0,1).toUpperCase()}</span><div><strong>{person.name}{i===0?' (you)':''}</strong><small>{i===0?(mic?'Microphone on':'Microphone off'):(person.address?'Wallet verified':'Invite access')}</small></div>{i===0?(mic?<Mic size={15}/>:<MicOff size={15}/>):<Headphones size={15}/>}</div>)}</div>:<div className="empty-people"><span className="avatar faded"><Users size={19}/></span><p>There’s room for your people.<br/><small>Create a frequency and send the first invite.</small></p></div>}</section>
    <section className="connection-card"><span className="connection-icon"><Globe2 size={22}/></span><div><span className="eyebrow">POWERED BY MONAD</span><h3>Your room. Your rules.</h3><p>{invite?.contract?'Membership is verified on Monad. Only approved wallets can connect.':'Add wallet-approved membership with a room registry on Monad testnet.'}</p></div><button className="text-button" onClick={()=>setDialog('network')}>{registry?'Manage access':'Set up Monad'}<ArrowRight size={17}/></button></section></div>
    <footer className="page-footer"><span>MADE FOR CONVERSATIONS THAT MATTER.</span><button onClick={()=>setDialog('about')}>About Nadwave <ArrowRight size={12}/></button></footer>
   </main>
   <div className="control-bar"><div className="control-status"><span className={'status-symbol '+(active?'active':'')}><Radio size={19}/></span><div><strong>{invite?.name||'You’re off the air'}</strong><small>{active?'Private room · Peer to peer':'Your next conversation starts here'}</small></div></div><div className="audio-controls"><button className={'control '+(mic?'mic-live':'')} aria-label={mic?'Mute microphone':'Enable microphone'} disabled={!active||!!busy} onClick={()=>void run('Opening microphone',async()=>{if(session.current)setMic(await session.current.microphone())})}>{mic?<Mic size={20}/>:<MicOff size={20}/>}</button><button className="control" aria-label={deaf?'Unmute incoming audio':'Mute incoming audio'} disabled={!active} onClick={()=>setDeaf(!deaf)}>{deaf?<VolumeX size={20}/>:<Volume2 size={20}/>}</button><button className={'control '+(cameraOn?'mic-live':'')} aria-label={cameraOn?'Turn camera off':'Turn camera on'} disabled={!active||!!busy} onClick={()=>void run('Opening camera',async()=>{if(session.current){const stream=await session.current.camera();setCamera(stream);setCameraOn(stream.getVideoTracks()[0].enabled)}})}><Video size={18}/></button><span className="control-divider"/>{active?<button className="leave-button" onClick={leave}>Leave room</button>:<button className="primary-button compact" onClick={()=>setDialog('create')}>Start a frequency<ArrowRight size={15}/></button>}</div><span className="control-lock"><LockKeyhole size={14}/>PRIVATE BY DESIGN</span></div>
  </div>
  {Object.entries(streams).filter(([,stream])=>stream.getAudioTracks().length>0).map(([id,stream])=><AudioPlayer key={id} stream={stream} muted={deaf}/>)}
  {busy&&<div className="busy" role="status"><Loader2 size={17} className="spin"/>{busy}…</div>}
  {dialog==='create'&&<Modal title="A frequency of your own." onClose={()=>setDialog(null)}><p className="modal-description">Bring a few good people together. Your invite is the key.</p><form onSubmit={create}><label>Room name<input autoFocus required maxLength={60} value={roomName} onChange={e=>setRoomName(e.target.value)}/></label><label>Your display name<input required maxLength={32} value={displayName} placeholder="What should we call you?" onChange={e=>setDisplayName(e.target.value)}/></label><label className="check-label"><input type="checkbox" checked={onchain} disabled={!registry} onChange={e=>setOnchain(e.target.checked)}/><span><strong>Approve members on Monad</strong><small>{registry?'Wallet approval + invite required. Room lasts 24 hours.':'Set up the Monad registry to enable wallet approval.'}</small></span></label>{!registry&&<button type="button" className="text-button" onClick={()=>setDialog('network')}>Set up Monad first<ArrowRight size={15}/></button>}{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button full" disabled={!!busy}>Create private room<ArrowRight size={17}/></button></form></Modal>}
  {dialog==='join'&&<Modal title={pending?`Join ${pending.name}`:'Tune into a frequency.'} onClose={()=>{setDialog(null);setPending(undefined)}}><p className="modal-description">Open your invitation. Join the conversation.</p><form onSubmit={join}>{!pending&&<label>Invite link<textarea required placeholder="Paste a Nadwave invite link" value={link} onChange={e=>setLink(e.target.value)} rows={3}/></label>}<label>Your display name<input autoFocus required maxLength={32} value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder="What should we call you?"/></label>{pending?.contract&&<p className="info"><ShieldCheck size={17}/>This room requires an approved wallet on Monad testnet.</p>}{error&&<p className="form-error" role="alert">{error}</p>}<button className="primary-button full" disabled={!!busy}>Join private room<ArrowRight size={17}/></button></form></Modal>}
  {dialog==='network'&&<Modal title="Your Monad connection." onClose={()=>setDialog(null)}><p className="modal-description">Deploy once. Create rooms. Choose who gets access.</p><div className="network-info"><span><span className="tiny-dot online"/>Monad testnet</span><a href="https://faucet.monad.xyz" target="_blank" rel="noreferrer">Get test MON<ExternalLink size={13}/></a></div><p className="small-copy">Project administrator: <code>{short(PROJECT_OWNER)}</code><br/>Deployment needs test MON and a MetaMask signature. No mainnet funds are used.</p><button className="primary-button full" disabled={!!busy} onClick={()=>void run('Waiting for deployment signature',async()=>{const account=await connect();const address=await deployRegistry(setTx);setRegistry(address);localStorage.setItem('nadwave-registry',address);setContractInput(address);setWallet(account);setOnchain(true);setNotice('Registry deployed. You can now create wallet-approved rooms.')})}><ShieldCheck size={17}/>{registry?'Deploy another registry':'Deploy room registry'}</button>{registry&&<div className="registry-address"><Check size={17}/><a href={`${chain.blockExplorers.default.url}/address/${registry}`} target="_blank" rel="noreferrer">Registry {short(registry)}<ExternalLink size={13}/></a></div>}<details><summary>Use an existing registry</summary><label>Registry contract address<input value={contractInput} placeholder="0x…" onChange={e=>setContractInput(e.target.value)}/></label><button className="secondary-button full" disabled={!!busy} onClick={()=>void run('Verifying registry',async()=>{const address=await verifyRegistry(contractInput);setRegistry(address);localStorage.setItem('nadwave-registry',address);setOnchain(true);setNotice('Registry connected.')})}>Verify and connect</button></details>
   {invite?.contract&&<div className="membership"><h3>Room membership</h3><p className="small-copy">Approve a wallet, then share the invite separately. Members and room ownership are public onchain.</p>{isOwner?<><label>Member wallet<input placeholder="0x…" value={approveAddress} onChange={e=>setApproveAddress(e.target.value)}/></label><div className="button-row"><button className="secondary-button" disabled={!!busy||!isAddress(approveAddress)} onClick={()=>void run('Approving wallet',async()=>{await writeRoom(invite.contract!,'setMember',[invite.id,approveAddress,true],setTx);setNotice('Wallet approved. Share the invite link with this person.')})}>Approve</button><button className="secondary-button" disabled={!!busy||!isAddress(approveAddress)} onClick={()=>void run('Removing wallet',async()=>{await writeRoom(invite.contract!,'setMember',[invite.id,approveAddress,false],setTx);setNotice('Wallet removed. Peers recheck access every 15 seconds.')})}>Remove</button></div><button className="danger-button full" disabled={!!busy} onClick={()=>void run('Closing room',async()=>{await writeRoom(invite.contract!,'closeRoom',[invite.id],setTx);leave();setDialog(null);setNotice('Room closed on Monad.')})}>Close room on Monad</button></>:<p className="info">Only this room’s owner can manage membership.</p>}</div>}
   {tx&&<a className="transaction" href={`${chain.blockExplorers.default.url}/tx/${tx}`} target="_blank" rel="noreferrer">View latest transaction<ExternalLink size={13}/></a>}{error&&<p className="form-error" role="alert">{error}</p>}</Modal>}
  {dialog==='about'&&<Modal title="A quieter kind of social." onClose={()=>setDialog(null)}><div className="about-copy"><p>Nadwave brings small groups together through live audio and ephemeral chat. No feeds, no recordings, no message database.</p><p><strong>Private invites.</strong> Every room gets a random 256-bit key inside the link’s fragment. The website server does not receive that fragment. Anyone with the full link can access an invite-only room.</p><p><strong>Wallet-approved rooms.</strong> Monad records ownership, membership and expiry. Peers verify a signed wallet identity before connecting and recheck membership every 15 seconds.</p><p><strong>Peer-to-peer media.</strong> WebRTC encrypts audio in transit; chat also uses AES-256-GCM. Public Nostr relays help browsers find each other. Network metadata and peer IP addresses are not hidden.</p><p>Built for small groups of up to eight people. Restrictive networks may require a TURN server. No message history or recovery is provided.</p><p className="small-copy">Adapted from Patio’s MIT-licensed registry. Communication uses Trystero. <a href="https://github.com/victxx/patio" target="_blank" rel="noreferrer">Original project<ExternalLink size={12}/></a></p></div></Modal>}
 </div>
}
