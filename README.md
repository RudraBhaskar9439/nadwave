# Nadwave

**Your people. Your frequency.**

Private live audio rooms, optional camera sharing, and encrypted ephemeral chat with wallet-approved membership on Monad.

[Open Nadwave](https://nadwave.vercel.app) · [Run locally](#quick-start) · [Monad testnet faucet](https://faucet.monad.xyz) · [Monad documentation](https://docs.monad.xyz)

**Deployment:** public HTTPS frontend on Vercel with the deployed Monad testnet room registry. The source repository remains private. Local startup is also available.

**Call readiness:** the WebRTC call flow, media controls, connection status, retry behavior, and server-side TURN integration are implemented. The Metered account has been created; production relay operation and a real two-device audio/video call still require verification. Encrypted local-tab chat has been demonstrated.

- Registry: [`0x07a577d7cb5de074841e7a47f12ed3e7defde923`](https://testnet.monadscan.com/address/0x07a577d7cb5de074841e7a47f12ed3e7defde923)
- Deployment: [`0x749876a2…a3e6e756`](https://testnet.monadscan.com/tx/0x749876a2a8bae80fb2721e85776baa72e298ecbc168c585911f70101a3e6e756)
- Network: Monad testnet, chain ID **10143**.

## What you can do

- Create an invite-only room without a wallet or transaction.
- Share one invitation containing a random room identifier and a 256-bit secret.
- Talk over encrypted, peer-to-peer WebRTC audio.
- Turn on a low-bandwidth camera stream when a conversation needs a face.
- See actual media connection status and retry a failed connection.
- Send encrypted chat messages that stay in connected browsers.
- Deploy a room registry from MetaMask on Monad testnet.
- Create wallet-approved rooms, approve or remove wallets, and close rooms onchain.
- Independently verify membership before admitting peers. Membership is checked again every 15 seconds.

Nadwave is a hackathon MVP for small groups, designed around a maximum of eight participants. It does not record audio or store message history. The interface reports actual connected peers; no sample conversations or fabricated network activity are shown.

## Quick start

### Downloadable demo bundle

The source-and-build bundle includes `dist/`. Start it without installing npm dependencies:

```bash
sh start-demo.command
```

Open **http://127.0.0.1:5173** and keep that terminal window open. This launcher requires Python 3 and serves only this computer. It serves the static build, not Vercel API functions; local-tab chat and direct WebRTC remain available, while the TURN endpoint requires Vercel hosting or `vercel dev`.

### Source checkout

Use Node.js **24.x** and npm.

```bash
npm ci
npm run compile
npm run dev
```

Open the local address printed by Vite. Microphone access works on `localhost` and HTTPS.

```bash
npm run check      # Compile Solidity, check permissions/encryption, build production app
npm run build      # TypeScript check and production build
npm run preview    # Preview production output
```

Invite chat and direct WebRTC need no application API key. The optional TURN relay requires two **server-side** environment variables described below. No wallet seed phrase or private-key environment variable is required.

## Two-minute demo

1. Choose **Create a room**, enter a room name and display name, and create an invitation room.
2. Choose **Invite people** and open the link in a second tab of the same browser for the verified chat demo. Cross-device use requires working public signaling and WebRTC.
3. Join with a different display name. The participant list updates after peers connect.
4. Send messages from both browsers. Enable the microphone to talk; optionally enable the camera. Use headphones to avoid feedback.
5. Leave the room. Rejoining starts with an empty chat history.

For a single-device demonstration, browser audio playback may require an additional click. Opening the same microphone in multiple tabs may cause feedback; keep one microphone muted.

### Local chat fallback

If public signaling relays cannot connect browsers, demonstrate encrypted chat in two tabs of the **same browser and origin**. The interface shows **Local tab chat linked** for this connection. This fallback uses encrypted `BroadcastChannel` messages; it does not provide cross-device connectivity or carry camera/audio streams. Sending and receiving chat in both directions was tested in two local tabs.

The local-tab indicator is separate from **Live media link connected**. A chat connection does not prove that microphone or camera media is flowing. Cross-device audio/video and TURN operation remain unverified until the real-call acceptance test below passes.

## Deploy on Monad

The application targets **Monad testnet**, chain ID **10143**, using `https://testnet-rpc.monad.xyz`. It does not spend mainnet MON.

1. Open the hosted app in the browser where MetaMask is installed, or use the local app.
2. Connect an account with test MON to register rooms and change membership. Obtain test MON from the faucet if necessary.
3. Use the deployed registry above. Another browser can connect it through **Use an existing registry**, or open the app with `?registry=0x07a577d7cb5de074841e7a47f12ed3e7defde923`.
4. Create a room with **Approve members on Monad** selected. Sign the room registration transaction.
5. Approve an invitee's wallet in **Manage access**, then share the invitation separately.

To deploy an independent registry instead, choose **Deploy room registry** in **Monad connection**, then review and sign its deployment transaction in MetaMask. The app waits for confirmation, saves the contract address in that browser, and links to the explorer.

The project administrator passed to the constructor is:

```text
0xd1DcAAFf9356d5a42f2eE6F90179C4509386a83f
```

This address can retire rooms. Each room creator controls that room's membership. Merely knowing an address cannot sign or deploy transactions; the paying account must authorize deployment in its wallet. Deployment bytecode and ABI are generated from the included Solidity source by `npm run compile`.

The recorded deployment above was signed in MetaMask and confirmed with a successful receipt. New room registrations and membership changes still require their own wallet signatures and testnet gas.

## Architecture

```mermaid
flowchart LR
    A[Browser A] <-->|Encrypted signaling| R[Public Nostr relays]
    B[Browser B] <-->|Encrypted signaling| R
    A <-->|WebRTC audio/video + AES-GCM chat| B
    A -->|Fetch ICE configuration| I[Vercel /api/ice]
    B -->|Fetch ICE configuration| I
    I -->|Server-side provider API key| T[Metered TURN]
    A <-->|Encrypted media relay when required| T
    B <-->|Encrypted media relay when required| T
    A -->|Read membership / signed transactions| M[Monad room registry]
    B -->|Read membership| M
```

- **React, TypeScript, Vite:** responsive studio interface and browser application.
- **Trystero / Nostr:** peer discovery and WebRTC connection establishment. Signaling descriptions are encrypted with the invitation secret.
- **Web Crypto:** additional AES-256-GCM encryption for chat and authentication packets, with a fresh random IV for every message.
- **Viem:** MetaMask connection, chain switching, signatures, deployment and contract calls.
- **Solidity:** public room ownership, membership, 24-hour expiry and room closure.
- **Vercel:** serves the frontend from `dist/` and runs `/api/ice` to retrieve TURN configuration. There is no application message-history server.
- **Metered TURN:** optional relay for networks where direct WebRTC fails. The provider API key stays in the server function; browsers receive the ICE credentials required by WebRTC.

Wallet-approved rooms bind a signed identity to the room ID, registry, network, peer ID and session expiry. A peer must possess the invite secret and prove an approved wallet before the application activates that peer's communication channel. Membership reads use finalized state. Session signatures expire after one hour.

## Privacy and trust

- Invite secrets are placed in the URL fragment, which browsers do not send in HTTP requests. Treat the full invite link like a password.
- In invitation rooms, anyone who receives the complete link can join. Display names are not verified identities.
- Onchain rooms additionally require an approved wallet signature. Wallet identities, membership changes and room ownership are public on Monad.
- Chat is ephemeral and limited to the latest 200 messages in each browser. Late joiners do not receive earlier messages. Senders receive no delivery guarantee when nobody else is connected.
- Audio and camera streams use WebRTC transport encryption. Chat also has application-layer AES-GCM encryption. Neither hides IP addresses from peers or traffic metadata from network infrastructure.
- Removing a wallet prevents cooperating clients from continuing communication after the next membership check, normally within 15 seconds. Already-received messages and recordings cannot be revoked. Rotate the invitation by creating a new room after a leaked invite.
- The project administrator can close any registered room but cannot decrypt chat through the contract.
- Public signaling relays, RPC providers and browser networking must be available. Nostr is used only for discovery; message content and audio travel peer to peer.
- A same-origin `BroadcastChannel` fallback supports encrypted local-tab chat without a signaling relay. Its connection indicator distinguishes that local demo path from WebRTC peers.
- The TURN integration requires the Metered server environment variables. The account exists; a working production relay path has not yet been verified. If the endpoint is unavailable, the app reports that state and attempts direct STUN connections. Restrictive networks may still prevent media.
- Metered dashboard/free-plan keys are not treated as ephemeral credentials. Rotate credentials manually when needed and monitor the selected plan's quota. The public ICE endpoint has same-origin checks and per-instance throttling, not global quota enforcement.
- This is a hackathon prototype, not an audited secure messenger. It has no moderation backend, archival storage, identity recovery or production service guarantee.

## Tests

`npm run check` covers Solidity compilation, wallet permission boundaries, duplicate room protection, member approval/removal, administrator closure, expiry, encrypted message round trips, wrong-key/tamper rejection, malformed invite rejection and the production build.

The current suite passes **29 automated checks: 11 contract checks and 18 Node tests**, followed by a production build. Coverage includes encrypted messages and invitations, peer capacity, stream grouping, microphone/camera capture lifecycle, leaving during capture, late peers, relay configuration, and the server ICE endpoint.

Previously demonstrated: bidirectional local-tab chat and the confirmed Monad testnet deployment above. A real microphone/camera call across two devices and the configured TURN relay remain acceptance checks.

The Vercel production deployment also passed a fresh `npm ci` and build on Node.js 24.

Contract checks use a local EthereumJS VM; media lifecycle tests use controlled streams and peers. These checks do not substitute for hardware microphone/camera permission tests, a real two-device call, or a confirmed relay path.

## Repository layout

```text
contracts/             Room registry and retained upstream source
licenses/              Upstream license notices
scripts/               Contract compilation and EVM checks
api/                   Server-side ICE credential endpoint
tests/                 ICE endpoint checks
src/                   UI, encrypted transport and wallet integration
src/generated/         Compiled deployment artifact
public/                Static assets
vercel.json            Vercel build and hosting configuration
```

## Vercel hosting

Production URL: **https://nadwave.vercel.app**

The Vercel project is connected to the private GitHub repository `RudraBhaskar9439/nadwave`. Pushes to `main` are configured to deploy to production automatically.

The tracked `vercel.json` configures the Vite application. Use these project settings:

| Setting | Value |
| --- | --- |
| Node.js | `24.x` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | Server-only Metered settings for TURN; see below |

After authenticating the Vercel CLI, run `vercel --prod` from the project directory to publish a new production build. Local Vercel account/project linkage lives in ignored `.vercel/`; it is not part of the private source repository. Keep source repository visibility private independently of the public website.

## TURN setup and call acceptance

Selected provider: **Metered**, using its free plan with **20 GB per month**. The account/application has been created at `rudra9439.metered.live`. Production credentials and a real relay path must be verified before claiming TURN is operational.

1. Select the Metered application `rudra9439.metered.live`. Account credentials stay with the account owner.
2. Obtain the application domain and a **credential-scoped API key** that can retrieve TURN credentials. Do not use an account-wide administration key.
3. Add these server environment variables to the Vercel project, then redeploy:

   | Variable | Value |
   | --- | --- |
   | `METERED_TURN_DOMAIN` | `rudra9439.metered.live` |
   | `METERED_TURN_API_KEY` | Credential-scoped provider API key |

4. Keep both values on the server. Never use a `VITE_` prefix, put the provider key in frontend code, or commit filled credential files. `.env.example` contains placeholders only.
5. Verify `/api/ice` returns usable ICE configuration with `relayConfigured: true`. Missing settings or a provider failure returns an explicit unavailable response; the client can still try direct STUN.

The server requests `GET https://<domain>/api/v1/turn/credentials` with `region=global`. It validates the provider response, preserves TURN UDP/TCP/TLS entries, caches successful configuration for five minutes, and does not expose the provider API key in the response. Browsers necessarily receive TURN usernames/passwords to establish media connections. The dashboard/free-plan key is not assumed to expire automatically; use manual rotation and quota monitoring.

Before claiming a completed live-call demo:

1. Open the deployed app on two devices, ideally on different networks, and join the same invite.
2. Grant microphone and camera access deliberately on each device. Use headphones and verify actual received audio and video in both directions.
3. Check that the app reports **Live media link connected**, not only local-tab chat. Exercise mute, camera toggle, reconnect, and leave; leaving must stop capture.
4. Confirm a selected relay candidate using browser WebRTC diagnostics when testing TURN. A successful ICE API response alone does not prove that a relay carried media.

**Pending:** verification of the production ICE endpoint and a real two-device/relay acceptance test. No live-call or relay success is claimed yet.

## Credits and license

Nadwave adapts the MIT-licensed public broadcast registry from [Patio](https://github.com/victxx/patio), the project behind [Patio Station](https://ethglobal.com/showcase/patio-station-17k0a). The original concept credits ariutokintumi, Antoine De Vuyst and victorxva. The upstream registry and copyright notice are retained in this repository.

The current full Patio application is not included in its public transport extract. Nadwave's interface, wallet membership flow, encrypted chat and WebRTC adaptation are implemented here. Patio's pending-transaction media mechanism is replaced because Monad's documented RPC does not expose the pending transaction data it needs.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [licenses/Patio-MIT.txt](licenses/Patio-MIT.txt) and [LICENSE](LICENSE). Third-party dependencies retain their own licenses. Disclose reused code when submitting to a hackathon and follow the event's existing-code rules.
