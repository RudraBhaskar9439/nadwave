# Nadwave

**Your people. Your frequency.**

Private live audio rooms, optional camera sharing, and encrypted ephemeral chat with wallet-approved membership on Monad.

[Run the local demo](#quick-start) · [Monad testnet faucet](https://faucet.monad.xyz) · [Monad documentation](https://docs.monad.xyz)

**Demo status:** local application only. No hosted website or live contract deployment has been performed.

## What you can do

- Create an invite-only room without a wallet or transaction.
- Share one invitation containing a random room identifier and a 256-bit secret.
- Talk over encrypted, peer-to-peer WebRTC audio.
- Turn on a low-bandwidth camera stream when a conversation needs a face.
- Send encrypted chat messages that stay in connected browsers.
- Deploy a room registry from MetaMask on Monad testnet.
- Create wallet-approved rooms, approve or remove wallets, and close rooms onchain.
- Independently verify membership before admitting peers. Membership is checked again every 15 seconds.

Nadwave is a hackathon MVP for small groups, designed around a maximum of eight participants. It does not record audio or store message history. The interface reports actual connected peers; no sample conversations or fabricated network activity are shown.

## Quick start

Use Node.js 22.12+ or 24+, and npm.

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

No API keys, seed phrases, backend account, or private-key environment variables are required.

## Two-minute demo

1. Choose **Create a room**, enter a room name and display name, and create an invitation room.
2. Choose **Invite people** and open the link in a second browser or device.
3. Join with a different display name. The participant list updates after peers connect.
4. Send messages from both browsers. Enable the microphone to talk; optionally enable the camera. Use headphones to avoid feedback.
5. Leave the room. Rejoining starts with an empty chat history.

For a single-device demonstration, browser audio playback may require an additional click. Opening the same microphone in multiple tabs may cause feedback; keep one microphone muted.

## Deploy on Monad

The application targets **Monad testnet**, chain ID **10143**, using `https://testnet-rpc.monad.xyz`. It does not spend mainnet MON.

1. Open the local app in the browser where MetaMask is installed.
2. Connect the account that will pay deployment gas. Obtain test MON from the faucet if necessary.
3. Open **Monad connection** and choose **Deploy room registry**.
4. Review and sign the transaction in MetaMask. The app waits for the receipt and shows an explorer link.
5. The deployed registry is saved locally in that browser. Another browser can connect it through **Use an existing registry**, or open the app with `?registry=0xYOUR_CONTRACT_ADDRESS`.
6. Create a room with **Approve members on Monad** selected. Sign the room registration transaction.
7. Approve an invitee's wallet in **Manage access**, then share the invitation separately.

The project administrator passed to the constructor is:

```text
0xd1DcAAFf9356d5a42f2eE6F90179C4509386a83f
```

This address can retire rooms. Each room creator controls that room's membership. Merely knowing an address cannot sign or deploy transactions; the paying account must authorize deployment in its wallet. Deployment bytecode and ABI are generated from the included Solidity source by `npm run compile`.

**Contract activation:** the frontend includes a wallet deployment flow. The registry becomes live only after its deployment transaction has been signed and confirmed. An explorer link in the app identifies that transaction and contract.

## Architecture

```mermaid
flowchart LR
    A[Browser A] <-->|Encrypted signaling| R[Public Nostr relays]
    B[Browser B] <-->|Encrypted signaling| R
    A <-->|WebRTC audio/video + AES-GCM chat| B
    A -->|Read membership / signed transactions| M[Monad room registry]
    B -->|Read membership| M
```

- **React, TypeScript, Vite:** responsive studio interface and browser application.
- **Trystero / Nostr:** peer discovery and WebRTC connection establishment. Signaling descriptions are encrypted with the invitation secret.
- **Web Crypto:** additional AES-256-GCM encryption for chat and authentication packets, with a fresh random IV for every message.
- **Viem:** MetaMask connection, chain switching, signatures, deployment and contract calls.
- **Solidity:** public room ownership, membership, 24-hour expiry and room closure.
- **Static hosting:** production output lives in `dist/`; there is no application message server.

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
- No TURN service is configured by default. Restrictive corporate networks, carrier-grade NAT and some mobile networks may prevent connections. Add a managed TURN service before relying on the app in those environments.
- This is a hackathon prototype, not an audited secure messenger. It has no moderation backend, archival storage, identity recovery or production service guarantee.

## Tests

`npm run check` covers Solidity compilation, wallet permission boundaries, duplicate room protection, member approval/removal, administrator closure, expiry, encrypted message round trips, wrong-key/tamper rejection, malformed invite rejection and the production build.

The contract checks run on a local EthereumJS VM. They do not prove a live Monad deployment or test MetaMask signatures on a user's behalf. Browser-to-browser transport and microphone behavior need testing on the intended devices and networks.

## Repository layout

```text
contracts/             Room registry and retained upstream source
licenses/              Upstream license notices
scripts/               Contract compilation and EVM checks
src/                   UI, encrypted transport and wallet integration
src/generated/         Compiled deployment artifact
public/                Static assets
.openai/hosting.json   Hosting identity and static build location
```

## Optional hosting

If hosting is needed later, run `npm run build` and deploy `dist/` to an HTTPS static host. Keep any source repository private independently of the website's visibility. `.openai/hosting.json` contains an unpublished Sites hosting identity, not credentials or proof of deployment.

## Credits and license

Nadwave adapts the MIT-licensed public broadcast registry from [Patio](https://github.com/victxx/patio), the project behind [Patio Station](https://ethglobal.com/showcase/patio-station-17k0a). The original concept credits ariutokintumi, Antoine De Vuyst and victorxva. The upstream registry and copyright notice are retained in this repository.

The current full Patio application is not included in its public transport extract. Nadwave's interface, wallet membership flow, encrypted chat and WebRTC adaptation are implemented here. Patio's pending-transaction media mechanism is replaced because Monad's documented RPC does not expose the pending transaction data it needs.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [licenses/Patio-MIT.txt](licenses/Patio-MIT.txt) and [LICENSE](LICENSE). Third-party dependencies retain their own licenses. Disclose reused code when submitting to a hackathon and follow the event's existing-code rules.
