# Onchain Vote

A Web3 portfolio dApp where an organisation can create proposals, manage member wallets, collect votes, and read results from a smart contract on BSC Testnet.

## Stack

- Solidity smart contract with Hardhat
- React + TypeScript frontend with Vite
- Wagmi + Viem wallet and contract integration
- Browser wallet authentication through Wagmi injected connectors

## Features

- Deployable `OnchainVoting` contract
- Owner-managed organisation membership
- Member-only proposal creation and voting
- One vote per member per proposal
- Proposal closing by owner or proposal creator
- Live proposal results loaded from chain
- Contract address persistence in local storage

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

Copy the deployed contract address into the frontend. In your browser wallet, switch to BSC Testnet before connecting.

## Contract

The contract lives at `contracts/OnchainVoting.sol`.

The deploy script lives at `scripts/deploy.ts`.

The frontend ABI is committed at `src/contracts/OnchainVoting.json` so the UI can run without importing generated Hardhat artifacts.
