# Onchain Vote

A Web3 portfolio dApp where an organisation can create proposals, manage member wallets, collect votes, and read results from a smart contract on BSC Testnet.

## Stack

- Solidity smart contract with Hardhat
- React + TypeScript frontend with Vite
- Wagmi + Viem wallet and contract integration
- Browser wallet authentication through Wagmi injected connectors

## Features

- Deployable `VotingFactory` platform contract
- Per-organisation `OnchainVoting` contracts deployed by the factory
- Owner-managed organisation membership
- Member-only proposal creation and voting
- One vote per member per proposal
- Proposal finalization by owner or proposal creator after the voting deadline
- Proposal winner, total vote, and quorum read helpers
- Live proposal results loaded from chain
- Contract address persistence in local storage

## Mainnet Notes

- The contract includes a configurable `quorum`, defaulting to `2` votes.
- `getWinner` returns the leading option by vote count. If there is a tie, the earliest option with that high score is returned.
- `closeProposal` can only be called after the proposal deadline. Live votes cannot be closed early.
- Read functions validate `proposalId` and revert with `Proposal does not exist` for invalid IDs.
- `getFullProposal` returns proposal metadata, options, vote counts, total votes, quorum status, and the current winner in one call for frontend efficiency.

## Run Locally

Install dependencies:

```bash
npm install
```

Compile the contract:

```bash
npm run compile
```

Start a local Hardhat chain:

```bash
npm run node
```

In another terminal, deploy the contract:

```bash
npm run deploy:local
```

Copy the deployed contract address into the frontend.

Start the React app:

```bash
npm run dev
```

Open the Vite URL, connect a wallet, and use a Hardhat local account in MetaMask for local testing.

## Deploy To BSC Testnet

Create a local `.env` or set these environment variables in your terminal:

```bash
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.bnbchain.org:8545
PRIVATE_KEY=0xyour_testnet_wallet_private_key
```

Fund that wallet with BSC Testnet BNB, then deploy:

```bash
npm run deploy:bsc-testnet
```

Current BSC Testnet factory:

```text
0x53f791179C9730Dc8Afe1De4cb4Bf4463e7354C6
```

Set that address as `VITE_FACTORY_ADDRESS` for frontend builds, or use the default already configured in the app. In your browser wallet, switch to BSC Testnet before connecting.

## Factory Flow

The platform deploys one `VotingFactory` contract. When an organisation signs up, the frontend calls `deploy(orgName)` on the factory. The factory deploys a dedicated `OnchainVoting` instance owned by that organisation wallet and stores it in the registry.

The frontend resolves the connected wallet's organisation contract by calling `orgByOwner(wallet)` on the factory. If the returned contract address is zero, the dashboard shows onboarding to deploy a new organisation. If a contract exists, proposal and member actions are routed to that organisation-specific `OnchainVoting` contract.

## Contract

The voting contract lives at `contracts/OnchainVoting.sol`.

The factory contract lives at `contracts/VotingFactory.sol`.

The factory deploy script lives at `scripts/deploy.ts`.

Frontend ABIs are committed in `src/contracts/` so the UI can run without importing generated Hardhat artifacts.
