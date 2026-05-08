import type { Abi } from "viem";

export const votingFactoryAbi = [
  {
    inputs: [{ internalType: "string", name: "orgName", type: "string" }],
    name: "deploy",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "string", name: "orgName", type: "string" }],
    name: "getContractByName",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "orgByOwner",
    outputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "address", name: "contractAddress", type: "address" },
      { internalType: "uint256", name: "deployedAt", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  }
] as const satisfies Abi;

export const onchainVotingAbi = [
  {
    inputs: [{ internalType: "address", name: "account", type: "address" }],
    name: "addMember",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "closeProposal",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "string", name: "title", type: "string" },
      { internalType: "string", name: "description", type: "string" },
      { internalType: "string[]", name: "options", type: "string[]" },
      { internalType: "uint256", name: "durationSeconds", type: "uint256" }
    ],
    name: "createProposal",
    outputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "proposalId", type: "uint256" }],
    name: "getFullProposal",
    outputs: [
      {
        components: [
          { internalType: "string", name: "title", type: "string" },
          { internalType: "string", name: "description", type: "string" },
          { internalType: "string[]", name: "options", type: "string[]" },
          { internalType: "uint256[]", name: "voteCounts", type: "uint256[]" },
          { internalType: "uint256", name: "deadline", type: "uint256" },
          { internalType: "bool", name: "closed", type: "bool" },
          { internalType: "address", name: "creator", type: "address" },
          { internalType: "uint256", name: "totalVotes", type: "uint256" },
          { internalType: "bool", name: "quorumReached", type: "bool" },
          { internalType: "uint256", name: "winningIndex", type: "uint256" },
          { internalType: "string", name: "winningOption", type: "string" }
        ],
        internalType: "struct OnchainVoting.ProposalDetails",
        name: "details",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" }
    ],
    name: "hasVoted",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "", type: "address" }],
    name: "isMember",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "proposalCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "proposalId", type: "uint256" },
      { internalType: "uint256", name: "optionIndex", type: "uint256" }
    ],
    name: "vote",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
] as const satisfies Abi;
