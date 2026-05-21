import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isAddress, type Abi, type Address } from "viem";
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useSwitchChain,
  useWalletClient
} from "wagmi";
import { bscTestnet } from "wagmi/chains";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Gauge,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trophy,
  TriangleAlert,
  UserPlus,
  Vote,
  Wallet,
  X
} from "lucide-react";
import { onchainVotingAbi, votingFactoryAbi } from "./contracts/abis";

const SELECTED_ORG_KEY_PREFIX = "onchain-vote-selected-org";
const DEPLOYED_FACTORY_ADDRESS =
  import.meta.env.VITE_FACTORY_ADDRESS ?? "0x53f791179C9730Dc8Afe1De4cb4Bf4463e7354C6";
const BSCSCAN_TESTNET_BASE_URL = "https://testnet.bscscan.com";
const DEFAULT_DURATION_DAYS = 3;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const cardClass =
  "rounded-[1.15rem] border border-[#2f352d]/80 bg-[#111610]/90 shadow-[0_24px_80px_rgba(0,0,0,0.24)] backdrop-blur";
const inputClass =
  "w-full rounded-xl border border-[#3b4237] bg-[#090d0a] px-3 py-2.5 text-sm font-medium text-[#f4efe3] outline-none transition placeholder:text-[#8a8f80] focus:border-[#d8ff64] focus:ring-4 focus:ring-[#d8ff64]/15";
const primaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#d8ff64] px-4 py-2 text-sm font-extrabold text-[#12160f] shadow-[0_0_0_1px_rgba(216,255,100,0.35),0_10px_30px_rgba(216,255,100,0.15)] transition hover:bg-[#ecff9f] disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#3d4439] bg-[#171d15] px-4 py-2 text-sm font-bold text-[#f4efe3] transition hover:border-[#d8ff64]/60 hover:bg-[#20271d] disabled:cursor-not-allowed disabled:opacity-50";
const quietButtonClass =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#252d21] px-4 py-2 text-sm font-bold text-[#f4efe3] transition hover:bg-[#303928] disabled:cursor-not-allowed disabled:opacity-50";
const iconButtonClass =
  "inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#3d4439] bg-[#171d15] text-[#b8bea9] transition hover:border-[#d8ff64]/60 hover:text-[#f4efe3] disabled:cursor-not-allowed disabled:opacity-50";

type Proposal = {
  id: number;
  title: string;
  description: string;
  deadline: number;
  closed: boolean;
  creator: Address;
  options: string[];
  voteCounts: number[];
  totalVotes: number;
  quorumReached: boolean;
  winningIndex: number;
  winningOption: string;
  hasVoted: boolean;
};

type ProposalForm = {
  title: string;
  description: string;
  options: string[];
  durationDays: string;
};

type ProposalFilter = "action" | "active" | "ended" | "all";
type PendingActionType =
  | "refresh"
  | "deploy"
  | "open"
  | "create"
  | "addMember"
  | "vote"
  | "finalize";
type PendingAction = {
  type: PendingActionType;
  label: string;
  proposalId?: number;
  optionIndex?: number;
};
type ToastKind = "success" | "error" | "info";
type Toast = {
  id: number;
  kind: ToastKind;
  message: string;
};

type FullProposalResult = readonly [
  string,
  string,
  string[],
  bigint[],
  bigint,
  boolean,
  Address,
  bigint,
  boolean,
  bigint,
  string
];

type OrganisationResult = readonly [string, Address, bigint];
type FullProposalObject = {
  title: string;
  description: string;
  options: string[];
  voteCounts: bigint[];
  deadline: bigint;
  closed: boolean;
  creator: Address;
  totalVotes: bigint;
  quorumReached: boolean;
  winningIndex: bigint;
  winningOption: string;
};
type OrganisationObject = {
  name: string;
  contractAddress: Address;
  deployedAt: bigint;
};
type FullProposalRead = FullProposalResult | FullProposalObject;
type OrganisationRead = OrganisationResult | OrganisationObject;

const initialProposalForm: ProposalForm = {
  title: "",
  description: "",
  options: ["Approve", "Reject"],
  durationDays: String(DEFAULT_DURATION_DAYS)
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatDeadline(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(timestamp * 1000));
}

function formatCountdown(timestamp: number, nowMs: number) {
  const diffSeconds = Math.max(0, Math.floor((timestamp * 1000 - nowMs) / 1000));

  if (diffSeconds <= 0) return "Deadline reached";

  const days = Math.floor(diffSeconds / 86400);
  const hours = Math.floor((diffSeconds % 86400) / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function extractErrorText(error: unknown) {
  const parts: string[] = [];

  if (error instanceof Error) parts.push(error.message);

  if (typeof error === "object" && error !== null && "shortMessage" in error) {
    parts.unshift(String((error as { shortMessage: unknown }).shortMessage));
  }

  if (typeof error === "object" && error !== null && "details" in error) {
    parts.push(String((error as { details: unknown }).details));
  }

  if (typeof error === "string") parts.push(error);

  return parts.join(" ").toLowerCase();
}

function getErrorMessage(error: unknown) {
  const text = extractErrorText(error);

  if (text.includes("user rejected") || text.includes("user denied") || text.includes("rejected the request")) {
    return "Transaction cancelled. Nothing was changed.";
  }

  if (text.includes("insufficient funds")) {
    return "Your wallet does not have enough BNB for gas on BSC Testnet.";
  }

  if (text.includes("switch") && text.includes("bsc testnet")) {
    return "Switch your wallet to BSC Testnet and try again.";
  }

  if (text.includes("chain") && (text.includes("unsupported") || text.includes("mismatch"))) {
    return "Your wallet is on the wrong network. Switch to BSC Testnet.";
  }

  if (text.includes("execution reverted") || text.includes("reverted")) {
    if (text.includes("only owner")) return "Only the organisation owner can do that.";
    if (text.includes("only members")) return "Only organisation members can do that.";
    if (text.includes("already voted")) return "This wallet has already voted on that proposal.";
    if (text.includes("voting ended")) return "Voting has already ended for this proposal.";
    if (text.includes("voting still active")) return "This proposal cannot be finalized until its deadline passes.";
    if (text.includes("proposal closed")) return "This proposal has already been finalized.";
    if (text.includes("proposal does not exist")) return "That proposal could not be found.";
    if (text.includes("invalid option")) return "Choose a valid voting option.";
    if (text.includes("already a member")) return "That wallet is already a member.";
    if (text.includes("not a member")) return "That wallet is not a member of this organisation.";
    if (text.includes("you already have a contract")) return "This wallet already owns an organisation.";
    if (text.includes("name already taken")) return "That organisation name is already taken.";
    if (text.includes("organisation not found")) {
      return "No organisation was found with that name. Ask the owner for an invite link or the exact organisation name.";
    }
    if (text.includes("name required")) return "Enter an organisation name.";
    return "The contract rejected that action. Check your role, proposal status, and try again.";
  }

  if (text.includes("not a member of that organisation")) {
    return "This wallet has not been added to that organisation. Ask the owner to add this wallet or send an invite link.";
  }

  if (text.includes("invalid deployed contract address") || text.includes("invalid address")) {
    return "Enter a valid contract address.";
  }

  if (text.includes("connect your wallet")) {
    return "Connect your wallet before continuing.";
  }

  return "Something went wrong. Check the wallet transaction and try again.";
}

function getContractAddress(address: string): Address {
  if (!isAddress(address)) throw new Error("Enter a valid deployed contract address.");
  return address;
}

function normalizeOrganisation(organisation: OrganisationRead) {
  if (Array.isArray(organisation)) {
    const tuple = organisation as OrganisationResult;
    return { name: tuple[0], contractAddress: tuple[1] };
  }

  const object = organisation as OrganisationObject;
  return { name: object.name, contractAddress: object.contractAddress };
}

function normalizeProposal(id: number, proposal: FullProposalRead, hasVoted: boolean): Proposal {
  const details: FullProposalObject = Array.isArray(proposal)
    ? (() => {
        const tuple = proposal as FullProposalResult;
        return {
          title: tuple[0],
          description: tuple[1],
          options: tuple[2],
          voteCounts: tuple[3],
          deadline: tuple[4],
          closed: tuple[5],
          creator: tuple[6],
          totalVotes: tuple[7],
          quorumReached: tuple[8],
          winningIndex: tuple[9],
          winningOption: tuple[10]
        };
      })()
    : (proposal as FullProposalObject);

  return {
    id,
    title: details.title,
    description: details.description,
    options: details.options ?? [],
    voteCounts: (details.voteCounts ?? []).map((countValue: bigint) => Number(countValue)),
    deadline: Number(details.deadline),
    closed: details.closed,
    creator: details.creator,
    totalVotes: Number(details.totalVotes),
    quorumReached: details.quorumReached,
    winningIndex: Number(details.winningIndex),
    winningOption: details.winningOption,
    hasVoted
  };
}

function getProposalStatus(proposal: Proposal, nowMs: number) {
  const deadlinePassed = proposal.deadline * 1000 <= nowMs;
  if (proposal.closed) return { label: "Finalized", tone: "neutral" };
  if (deadlinePassed) return { label: "Ready to finalize", tone: "warning" };
  return { label: "Open", tone: "success" };
}

function Modal({
  title,
  description,
  onClose,
  children
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector =
      'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () =>
      Array.from(modalRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []).filter(
        (element) => !element.hasAttribute("disabled")
      );

    getFocusableElements()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      const focusableElements = getFocusableElements();
      if (event.key !== "Tab" || focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050805]/75 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${title.toLowerCase().replace(/\s+/g, "-")}-title`}
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-xl overflow-hidden rounded-[1.2rem] border border-[#30382f] bg-[#111610] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[#30382f] px-5 py-4">
          <div>
            <h2
              id={`${title.toLowerCase().replace(/\s+/g, "-")}-title`}
              className="font-serif text-xl font-bold text-[#fff8df]"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm font-medium text-[#aeb6a3]">{description}</p>
          </div>
          <button type="button" className={iconButtonClass} onClick={onClose} aria-label="Close modal">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ProposalSkeleton() {
  return (
    <article className="overflow-hidden rounded-[1.4rem] border border-[#30382f] bg-[#111610]/90 shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
      <div className="animate-pulse p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid flex-1 gap-3">
            <div className="h-3 w-24 rounded-full bg-[#293126]" />
            <div className="h-8 w-3/5 rounded-full bg-[#293126]" />
          </div>
          <div className="h-8 w-28 rounded-full bg-[#293126]" />
        </div>
        <div className="mb-6 grid gap-2">
          <div className="h-3 w-full rounded-full bg-[#20271d]" />
          <div className="h-3 w-4/5 rounded-full bg-[#20271d]" />
        </div>
        <div className="grid gap-3">
          <div className="h-16 rounded-2xl bg-[#0c110d]" />
          <div className="h-16 rounded-2xl bg-[#0c110d]" />
        </div>
      </div>
    </article>
  );
}

function App() {
  const { address: account, chain, chainId, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchingNetwork } = useSwitchChain();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [owner, setOwner] = useState<Address | "">("");
  const [isMember, setIsMember] = useState(false);
  const factoryAddress = DEPLOYED_FACTORY_ADDRESS;
  const [orgContractAddress, setOrgContractAddress] = useState<Address | "">("");
  const [organisationName, setOrganisationName] = useState("");
  const [newOrganisationName, setNewOrganisationName] = useState("");
  const [organisationLookupName, setOrganisationLookupName] = useState("");
  const [invitedOrganisationName, setInvitedOrganisationName] = useState("");
  const [autoOpenedOrganisationName, setAutoOpenedOrganisationName] = useState("");
  const [isDeployOrgOpen, setIsDeployOrgOpen] = useState(false);
  const [isCreateProposalOpen, setIsCreateProposalOpen] = useState(false);
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isTechnicalDetailsOpen, setIsTechnicalDetailsOpen] = useState(false);
  const [selectedVote, setSelectedVote] = useState<{ proposalId: number; optionIndex: number } | null>(null);
  const [proposalFilter, setProposalFilter] = useState<ProposalFilter>("action");
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [proposalForm, setProposalForm] = useState(initialProposalForm);
  const [memberAddress, setMemberAddress] = useState("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const normalizedAccount = account?.toLowerCase() ?? "";
  const isOwner = Boolean(owner) && owner.toLowerCase() === normalizedAccount;
  const hasOrganisation = Boolean(orgContractAddress);
  const isWrongNetwork = isConnected && chainId !== bscTestnet.id;
  const isLoading = Boolean(pendingAction);
  const pendingLabel = pendingAction?.label ?? "";
  const isRefreshing = pendingAction?.type === "refresh";
  const isDeployingOrganisation = pendingAction?.type === "deploy";
  const isOpeningOrganisation = pendingAction?.type === "open";
  const isPublishingProposal = pendingAction?.type === "create";
  const isAddingMember = pendingAction?.type === "addMember";
  const injectedConnector = connectors[0];
  const selectedOrgStorageKey = account
    ? `${SELECTED_ORG_KEY_PREFIX}-${account.toLowerCase()}`
    : "";
  const organisationShareUrl =
    hasOrganisation && organisationName && typeof window !== "undefined"
      ? `${window.location.origin}${window.location.pathname}?org=${encodeURIComponent(organisationName)}`
      : "";

  const notify = useCallback((kind: ToastKind, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4500);
  }, []);

  const readContract = useCallback(
    async <T,>(
      address: Address,
      abi: Abi,
      functionName: string,
      args: readonly unknown[] = []
    ) => {
      if (!publicClient) throw new Error("No chain client available.");

      return publicClient.readContract({
        address,
        abi,
        functionName,
        args
      }) as Promise<T>;
    },
    [publicClient]
  );

  const loadOrganisationData = useCallback(
    async (resolvedContract: Address, name: string) => {
      if (!account) return;

      setOrgContractAddress(resolvedContract);
      setOrganisationName(name);

      const [contractOwner, member, count] = await Promise.all([
        readContract<Address>(resolvedContract, onchainVotingAbi, "owner"),
        readContract<boolean>(resolvedContract, onchainVotingAbi, "isMember", [account]),
        readContract<bigint>(resolvedContract, onchainVotingAbi, "proposalCount")
      ]);

      const loaded: Proposal[] = [];
      for (let id = Number(count) - 1; id >= 0; id -= 1) {
        const [proposal, voted] = await Promise.all([
          readContract<FullProposalRead>(
            resolvedContract,
            onchainVotingAbi,
            "getFullProposal",
            [BigInt(id)]
          ),
          readContract<boolean>(resolvedContract, onchainVotingAbi, "hasVoted", [
            BigInt(id),
            account
          ])
        ]);

        loaded.push(normalizeProposal(id, proposal, voted));
      }

      setOwner(contractOwner);
      setIsMember(member);
      setProposals(loaded);
    },
    [account, readContract]
  );

  const refreshData = useCallback(async () => {
    if (!account || !isAddress(factoryAddress) || isWrongNetwork) return;

    setPendingAction({ type: "refresh", label: "Refreshing workspace" });

    try {
      const factory = getContractAddress(factoryAddress);
      const organisationRead = await readContract<OrganisationRead>(
        factory,
        votingFactoryAbi,
        "orgByOwner",
        [account]
      );
      const organisation = normalizeOrganisation(organisationRead);
      const resolvedContract = organisation.contractAddress;

      if (resolvedContract === ZERO_ADDRESS) {
        const rememberedContract = selectedOrgStorageKey
          ? localStorage.getItem(selectedOrgStorageKey)
          : "";

        if (rememberedContract && isAddress(rememberedContract)) {
          await loadOrganisationData(rememberedContract, organisationName || "Selected organisation");
          return;
        }

        setOwner("");
        setIsMember(false);
        setOrgContractAddress("");
        setProposals([]);
        return;
      }

      if (selectedOrgStorageKey) localStorage.setItem(selectedOrgStorageKey, resolvedContract);
      await loadOrganisationData(resolvedContract, organisation.name);
    } catch (caughtError) {
      notify("error", getErrorMessage(caughtError));
    } finally {
      setPendingAction(null);
    }
  }, [
    account,
    factoryAddress,
    isWrongNetwork,
    loadOrganisationData,
    organisationName,
    notify,
    selectedOrgStorageKey,
    readContract
  ]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (account) return;

    setOwner("");
    setIsMember(false);
    setOrgContractAddress("");
    setOrganisationName("");
    setProposals([]);
  }, [account]);

  useEffect(() => {
    const hasActiveDeadline = proposals.some(
      (proposal) => !proposal.closed && proposal.deadline * 1000 > Date.now()
    );

    if (!hasActiveDeadline) return;

    const intervalId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [proposals]);

  useEffect(() => {
    const invitedName = new URLSearchParams(window.location.search).get("org")?.trim();

    if (!invitedName) return;

    setOrganisationLookupName(invitedName);
    setInvitedOrganisationName(invitedName);
  }, []);

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const closeAccountMenu = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      setIsAccountMenuOpen(false);
    };

    document.addEventListener("keydown", closeAccountMenu);
    document.addEventListener("click", closeAccountMenu);
    return () => {
      document.removeEventListener("keydown", closeAccountMenu);
      document.removeEventListener("click", closeAccountMenu);
    };
  }, [isAccountMenuOpen]);

  const connectWallet = async () => {
    if (!injectedConnector) {
      notify("error", "Install a browser wallet such as MetaMask to continue.");
      return;
    }

    try {
      await connectAsync({ connector: injectedConnector });
      notify("success", "Wallet connected.");
    } catch (caughtError) {
      notify("error", getErrorMessage(caughtError));
    }
  };

  const switchToBscTestnet = async () => {
    try {
      await switchChainAsync({ chainId: bscTestnet.id });
      notify("success", "Switched to BSC Testnet.");
    } catch (caughtError) {
      notify("error", getErrorMessage(caughtError));
    }
  };

  const copyAddress = async (address: string, label: string) => {
    await navigator.clipboard.writeText(address);
    notify("success", `${label} copied.`);
  };

  const submitVotingTransaction = async (
    functionName: string,
    args: readonly unknown[],
    successMessage: string
  ) => {
    const actionType: PendingActionType =
      functionName === "vote"
        ? "vote"
        : functionName === "closeProposal"
          ? "finalize"
          : functionName === "addMember"
            ? "addMember"
            : "create";
    const pendingMessage =
      actionType === "vote"
        ? "Casting vote..."
        : actionType === "finalize"
          ? "Finalizing proposal..."
          : actionType === "addMember"
            ? "Adding member..."
            : "Publishing proposal...";
    const proposalId = typeof args[0] === "bigint" ? Number(args[0]) : undefined;
    const optionIndex = typeof args[1] === "bigint" ? Number(args[1]) : undefined;

    if (pendingAction && pendingAction.type !== "refresh") {
      notify("info", `Finish ${pendingAction.label.toLowerCase()} before starting another wallet action.`);
      return;
    }

    setPendingAction({
      type: actionType,
      label: pendingMessage.replace("...", ""),
      proposalId,
      optionIndex
    });

    try {
      if (!publicClient || !walletClient || !account) {
        throw new Error("Connect your wallet before sending a transaction.");
      }
      if (isWrongNetwork) throw new Error("Switch your wallet to BSC Testnet before sending a transaction.");
      if (!orgContractAddress) throw new Error("Open or deploy an organisation first.");

      const { request } = await publicClient.simulateContract({
        address: orgContractAddress,
        abi: onchainVotingAbi as Abi,
        functionName,
        args,
        account
      });

      const hash = await walletClient.writeContract(request);
      notify("info", pendingMessage);
      await publicClient.waitForTransactionReceipt({ hash });
      notify("success", successMessage);
      await refreshData();
      return true;
    } catch (caughtError) {
      notify("error", getErrorMessage(caughtError));
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const deployOrganisation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingAction && pendingAction.type !== "refresh") {
      notify("info", `Finish ${pendingAction.label.toLowerCase()} before starting another wallet action.`);
      return;
    }

    setPendingAction({ type: "deploy", label: "Deploying organisation" });

    try {
      if (!publicClient || !walletClient || !account) {
        throw new Error("Connect your wallet before deploying an organisation.");
      }
      if (isWrongNetwork) throw new Error("Switch your wallet to BSC Testnet before deploying.");

      const name = newOrganisationName.trim();
      if (!name) throw new Error("Organisation name is required.");

      const factory = getContractAddress(factoryAddress);
      const { request } = await publicClient.simulateContract({
        address: factory,
        abi: votingFactoryAbi,
        functionName: "deploy",
        args: [name],
        account
      });

      const hash = await walletClient.writeContract(request);
      notify("info", "Deploying organisation contract...");
      await publicClient.waitForTransactionReceipt({ hash });
      notify("success", "Organisation contract deployed.");
      setNewOrganisationName("");
      setIsDeployOrgOpen(false);
      await refreshData();
    } catch (caughtError) {
      notify("error", getErrorMessage(caughtError));
    } finally {
      setPendingAction(null);
    }
  };

  const openOrganisationByName = useCallback(
    async (rawName: string) => {
      if (pendingAction && pendingAction.type !== "refresh") {
        notify("info", `Finish ${pendingAction.label.toLowerCase()} before opening another organisation.`);
        return;
      }

      setPendingAction({ type: "open", label: "Opening organisation" });

      try {
        if (!account) throw new Error("Connect your wallet before opening an organisation.");
        if (isWrongNetwork) throw new Error("Switch your wallet to BSC Testnet first.");

        const name = rawName.trim();
        if (!name) throw new Error("Organisation name is required.");

        const factory = getContractAddress(factoryAddress);
        const resolvedContract = await readContract<Address>(
          factory,
          votingFactoryAbi,
          "getContractByName",
          [name]
        );
        const member = await readContract<boolean>(resolvedContract, onchainVotingAbi, "isMember", [
          account
        ]);

        if (!member) throw new Error("This wallet is not a member of that organisation.");
        if (selectedOrgStorageKey) localStorage.setItem(selectedOrgStorageKey, resolvedContract);

        await loadOrganisationData(resolvedContract, name);
        notify("success", `Opened ${name}.`);
      } catch (caughtError) {
        notify("error", getErrorMessage(caughtError));
      } finally {
        setPendingAction(null);
      }
    },
    [
      account,
      factoryAddress,
      isWrongNetwork,
      loadOrganisationData,
      notify,
      pendingAction,
      readContract,
      selectedOrgStorageKey
    ]
  );

  const findOrganisation = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await openOrganisationByName(organisationLookupName);
  };

  useEffect(() => {
    const name = invitedOrganisationName.trim();

    if (
      !name ||
      autoOpenedOrganisationName === name ||
      !isConnected ||
      isWrongNetwork ||
      hasOrganisation ||
      isLoading
    ) {
      return;
    }

    setAutoOpenedOrganisationName(name);
    void openOrganisationByName(name);
  }, [
    autoOpenedOrganisationName,
    hasOrganisation,
    invitedOrganisationName,
    isConnected,
    isLoading,
    isWrongNetwork,
    openOrganisationByName
  ]);

  const createProposal = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const options = proposalForm.options
      .map((option) => option.trim())
      .filter(Boolean);
    const durationDays = Number(proposalForm.durationDays);
    const normalizedOptions = options.map((option) => option.toLowerCase());

    if (options.length < 2) {
      notify("error", "Add at least two proposal options.");
      return;
    }

    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      notify("error", "Proposal options must be unique.");
      return;
    }

    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      notify("error", "Duration must be greater than zero days.");
      return;
    }

    const created = await submitVotingTransaction(
      "createProposal",
      [
        proposalForm.title.trim(),
        proposalForm.description.trim(),
        options,
        BigInt(Math.round(durationDays * 24 * 60 * 60))
      ],
      "Proposal created."
    );
    if (created) {
      setProposalForm(initialProposalForm);
      setIsCreateProposalOpen(false);
    }
  };

  const addMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isAddress(memberAddress)) {
      notify("error", "Enter a valid wallet address.");
      return;
    }

    const added = await submitVotingTransaction("addMember", [memberAddress], "Member added.");
    if (added) {
      setMemberAddress("");
      setIsAddMemberOpen(false);
    }
  };

  const totalVotes = useMemo(
    () =>
      proposals.reduce(
        (total, proposal) =>
          total + proposal.voteCounts.reduce((proposalTotal, count) => proposalTotal + count, 0),
        0
      ),
    [proposals]
  );

  const activeVotes = proposals.filter(
    (proposal) => !proposal.closed && proposal.deadline * 1000 > nowMs
  ).length;
  const endedVotes = proposals.filter(
    (proposal) => proposal.closed || proposal.deadline * 1000 <= nowMs
  ).length;
  const proposalsNeedingVote = proposals.filter(
    (proposal) => !proposal.closed && proposal.deadline * 1000 > nowMs && !proposal.hasVoted
  );
  const trimmedProposalOptions = proposalForm.options.map((option) => option.trim()).filter(Boolean);
  const hasDuplicateProposalOptions =
    new Set(trimmedProposalOptions.map((option) => option.toLowerCase())).size !==
    trimmedProposalOptions.length;
  const proposalOptionsPreview = trimmedProposalOptions.length > 0 ? trimmedProposalOptions : ["Option preview"];
  const visibleProposals = proposals.filter((proposal) => {
    const ended = proposal.closed || proposal.deadline * 1000 <= nowMs;
    if (proposalFilter === "action") return !ended && !proposal.hasVoted;
    if (proposalFilter === "active") return !ended;
    if (proposalFilter === "ended") return ended;
    return true;
  });
  const hasHiddenProposals = proposals.length > 0 && visibleProposals.length === 0;
  const isCaughtUp = proposalFilter === "action" && hasHiddenProposals;
  const showProposalSkeletons = (isRefreshing || isOpeningOrganisation) && hasOrganisation && proposals.length === 0;
  const emptyProposalState = !hasOrganisation
    ? {
        title: "Choose an organisation",
        description: "Deploy a workspace if you own one, or open an organisation by name after your wallet has been added.",
        kind: "organisation" as const
      }
    : proposals.length === 0
      ? {
          title: "No proposals yet",
          description: "This organisation has no on-chain decisions. Create the first proposal to start a vote.",
          kind: "new" as const
        }
      : isCaughtUp
        ? {
            title: "You're caught up",
            description: "You have voted on everything currently waiting for you.",
            kind: "caught-up" as const
          }
        : {
            title: "Nothing matches this filter",
            description: "There are proposals here, just not in the selected view.",
            kind: "filtered" as const
          };
  const createProposalDisabledReason = !isConnected
    ? "Connect your wallet first."
    : isWrongNetwork
      ? "Switch to BSC Testnet first."
      : !hasOrganisation
        ? "Open or create an organisation first."
        : !isMember
          ? "Only organisation members can create proposals."
          : "";
  const addMemberDisabledReason = !isConnected
    ? "Connect your wallet first."
    : isWrongNetwork
      ? "Switch to BSC Testnet first."
      : !hasOrganisation
        ? "Open or create an organisation first."
        : !isOwner
          ? "Only the organisation owner can add members."
          : "";
  const openOrganisationDisabledReason = !isConnected
    ? "Connect your wallet first."
    : isWrongNetwork
      ? "Switch to BSC Testnet first."
      : !isAddress(factoryAddress)
        ? "The app is not configured for this network."
        : "";
  const deployOrganisationDisabledReason = openOrganisationDisabledReason;

  const currentStep = !isConnected
    ? "connect"
    : isWrongNetwork
      ? "network"
      : !hasOrganisation
        ? "organisation"
        : !isMember
          ? "access"
          : "workspace";

  const walletPill = isConnected && account ? (
    <div className="relative">
      <button
        type="button"
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#3d4439] bg-[#171d15] px-3.5 py-2 text-sm font-semibold text-[#f4efe3] shadow-sm transition hover:bg-[#20271d]"
        onClick={(event) => {
          event.stopPropagation();
          setIsAccountMenuOpen((current) => !current);
        }}
        aria-expanded={isAccountMenuOpen}
        aria-haspopup="menu"
      >
        {shortAddress(account)}
      </button>
      {isAccountMenuOpen && (
        <div
          className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-2xl border border-[#30382f] bg-[#111610] shadow-[0_24px_80px_rgba(0,0,0,0.35)]"
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="block w-full px-4 py-3 text-left text-sm font-bold text-[#f4efe3] hover:bg-[#20271d]"
            onClick={() => {
              copyAddress(account, "Wallet address");
              setIsAccountMenuOpen(false);
            }}
          >
            Copy wallet address
          </button>
          <a
            className="block px-4 py-3 text-sm font-bold text-[#f4efe3] hover:bg-[#20271d]"
            href={`${BSCSCAN_TESTNET_BASE_URL}/address/${account}`}
            target="_blank"
            rel="noreferrer"
            onClick={() => setIsAccountMenuOpen(false)}
          >
            View on BscScan
          </a>
          <button
            type="button"
            className="block w-full border-t border-[#30382f] px-4 py-3 text-left text-sm font-bold text-[#ffb4b4] hover:bg-[#20271d]"
            onClick={() => {
              disconnect();
              setIsAccountMenuOpen(false);
            }}
          >
            Disconnect wallet
          </button>
        </div>
      )}
    </div>
  ) : (
    <button
      type="button"
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[#d8ff64] bg-[#d8ff64] px-3.5 py-2 text-sm font-semibold text-[#11160f] shadow-sm transition hover:bg-[#ecff9f] disabled:cursor-not-allowed disabled:opacity-50"
      onClick={connectWallet}
      disabled={isConnecting}
    >
      {isConnecting ? <Loader2 className="animate-spin" size={16} /> : null}
      {isConnecting ? "Opening wallet..." : "Login with wallet"}
    </button>
  );

  return (
    <div className="min-h-screen overflow-hidden bg-[#090d0a] font-sans text-[#f4efe3] antialiased">
      <div
        className="pointer-events-none fixed inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(circle at 20% 10%, rgba(216,255,100,0.16), transparent 28rem), radial-gradient(circle at 86% 18%, rgba(69,187,161,0.13), transparent 24rem), linear-gradient(135deg, rgba(244,239,227,0.07), transparent 42%)"
        }}
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(244,239,227,0.65) 1px, transparent 1px), linear-gradient(90deg, rgba(244,239,227,0.65) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          animation: "quiet-scan 18s linear infinite"
        }}
      />

      <main className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] border border-[#d8ff64]/30 bg-[#d8ff64] text-[#11160f] shadow-[0_0_40px_rgba(216,255,100,0.18)]">
              <Vote size={23} />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold tracking-tight text-[#fff8df]">Onchain Vote</h1>
              <p className="text-sm font-bold text-[#aeb6a3]">
                {hasOrganisation ? organisationName || "Organisation workspace" : "Organisation voting on BSC Testnet"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {isConnected && isWrongNetwork && (
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[#ffd166] px-4 py-2 text-sm font-extrabold text-[#211a06] transition hover:bg-[#ffe39c] disabled:cursor-not-allowed disabled:opacity-50"
                onClick={switchToBscTestnet}
                disabled={isSwitchingNetwork}
              >
                {isSwitchingNetwork ? <Loader2 className="animate-spin" size={16} /> : <TriangleAlert size={16} />}
                {isSwitchingNetwork ? "Switching..." : "Switch network"}
              </button>
            )}
            {walletPill}
          </div>
        </div>
        {pendingLabel && (
          <div className="mb-6 overflow-hidden rounded-full border border-[#30382f] bg-[#111610]/90">
            <div className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-[#d8ff64]">
              <Loader2 className="animate-spin" size={16} />
              {pendingLabel}
            </div>
            <div className="h-1 w-full overflow-hidden bg-[#0c110d]">
              <div className="h-full w-1/2 animate-[pulse_1.1s_ease-in-out_infinite] bg-[#d8ff64]" />
            </div>
          </div>
        )}
        {currentStep !== "workspace" && (
          <section className="mb-6 overflow-hidden rounded-[1.6rem] border border-[#30382f] bg-[#111610]/92 shadow-[0_30px_120px_rgba(0,0,0,0.32)] backdrop-blur" style={{ animation: "chamber-rise 520ms ease-out both" }}>
            <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
              <div className="p-6 sm:p-8">
                <span className="mb-4 inline-flex rounded-full border border-[#d8ff64]/30 bg-[#d8ff64]/10 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.18em] text-[#d8ff64]">
                  Access sequence
                </span>
                <h2 className="max-w-2xl font-serif text-4xl font-bold leading-[0.98] tracking-tight text-[#fff8df] sm:text-5xl">
                  {currentStep === "connect" && "Connect a wallet to enter an organisation workspace."}
                  {currentStep === "network" && "Switch to BSC Testnet to continue."}
                  {currentStep === "organisation" && "Open an existing organisation or deploy a new one."}
                  {currentStep === "access" && "This wallet is not a member of the selected organisation."}
                </h2>
                <p className="mt-4 max-w-xl text-base font-medium leading-7 text-[#b8bea9]">
                  {invitedOrganisationName && !hasOrganisation
                    ? `${invitedOrganisationName} is ready to open once your wallet is connected and verified as a member.`
                    : currentStep === "organisation"
                    ? "Owners create organisation workspaces. Members open an existing organisation by name after the owner adds their wallet."
                    : "The app checks wallet, network, organisation registry, and membership before enabling governance actions."}
                </p>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    className={primaryButtonClass}
                    onClick={currentStep === "connect" ? connectWallet : () => setIsDeployOrgOpen(true)}
                    title={currentStep === "connect" ? "" : deployOrganisationDisabledReason}
                    disabled={
                      isDeployingOrganisation ||
                      isConnecting ||
                      currentStep === "network" ||
                      currentStep === "access" ||
                      !isConnected && currentStep !== "connect"
                    }
                  >
                    {currentStep === "connect" ? <Wallet size={18} /> : <Plus size={18} />}
                    {currentStep === "connect" ? "Connect wallet" : "Deploy organisation"}
                  </button>
                  {currentStep !== "connect" && deployOrganisationDisabledReason && (
                    <p className="self-center text-xs font-bold text-[#8f9788] sm:col-span-2">
                      {deployOrganisationDisabledReason}
                    </p>
                  )}
                  {currentStep === "network" ? (
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={switchToBscTestnet}
                      disabled={isSwitchingNetwork}
                    >
                      <TriangleAlert size={18} />
                      Switch to BSC Testnet
                    </button>
                  ) : (
                    <form className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={findOrganisation}>
                      <input
                        className={inputClass}
                        value={organisationLookupName}
                        onChange={(event) => setOrganisationLookupName(event.target.value)}
                        placeholder="Organisation name"
                      />
                      <button
                        type="submit"
                        className={secondaryButtonClass}
                        disabled={Boolean(openOrganisationDisabledReason) || isOpeningOrganisation}
                        title={openOrganisationDisabledReason}
                      >
                        {isOpeningOrganisation ? (
                          <Loader2 className="animate-spin" size={17} />
                        ) : (
                          <Search size={17} />
                        )}
                        <span>{isOpeningOrganisation ? "Opening..." : "Open"}</span>
                      </button>
                      {openOrganisationDisabledReason && (
                        <p className="text-xs font-bold text-[#8f9788] sm:col-span-2">
                          {openOrganisationDisabledReason}
                        </p>
                      )}
                    </form>
                  )}
                </div>
              </div>

              <div className="border-t border-[#30382f] bg-[#0c110d]/80 p-6 lg:border-l lg:border-t-0">
                <div className="grid gap-3">
                  {[
                    ["Wallet", isConnected ? shortAddress(account ?? "") : "Not connected", isConnected],
                    ["Network", chain?.name ?? "Unknown", isConnected && !isWrongNetwork],
                    ["Organisation", hasOrganisation ? organisationName || "Resolved" : "Not opened", hasOrganisation],
                    ["Access", isMember ? (isOwner ? "Owner" : "Member") : "Not verified", isMember]
                  ].map(([label, value, complete]) => (
                    <div
                      className="flex items-center justify-between rounded-2xl border border-[#30382f] bg-[#151b13] p-4"
                      key={String(label)}
                    >
                      <div>
                        <p className="text-sm font-extrabold text-[#fff8df]">{label}</p>
                        <p className="text-xs font-bold text-[#8f9788]">{value}</p>
                      </div>
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full ${
                          complete ? "bg-[#d8ff64] text-[#11160f]" : "bg-[#22291f] text-[#707965]"
                        }`}
                      >
                        <CheckCircle2 size={16} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {currentStep === "workspace" && (
          <section className="mb-6 overflow-hidden rounded-[1.6rem] border border-[#30382f] bg-[#111610]/92 shadow-[0_30px_120px_rgba(0,0,0,0.32)] backdrop-blur" style={{ animation: "chamber-rise 520ms ease-out both" }}>
            <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#d8ff64]/30 bg-[#d8ff64]/10 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.14em] text-[#d8ff64]">
                    {isOwner ? "Owner workspace" : "Member workspace"}
                  </span>
                  <span className="rounded-full border border-[#3d4439] bg-[#171d15] px-3 py-1 text-xs font-bold uppercase text-[#b8bea9]">
                    {chain?.name}
                  </span>
                  <span className="rounded-full border border-[#3d4439] bg-[#171d15] px-3 py-1 text-xs font-bold uppercase text-[#b8bea9]">
                    {isOwner ? "Owner permissions" : isMember ? "Member permissions" : "No access"}
                  </span>
                </div>
                <h2 className="font-serif text-4xl font-bold leading-[0.98] tracking-tight text-[#fff8df] sm:text-5xl">
                  {organisationName || "Organisation"} governance
                </h2>
                <p className="mt-4 max-w-2xl text-base font-medium leading-7 text-[#b8bea9]">
                  Vote on active proposals, create new decisions, and manage member access from the organisation contract.
                </p>
              </div>
              <div className="grid gap-2">
                <div className="flex flex-col gap-2 sm:flex-row">
                  {isOwner && (
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => setIsAddMemberOpen(true)}
                      disabled={Boolean(addMemberDisabledReason) || isAddingMember}
                      title={addMemberDisabledReason}
                    >
                      <UserPlus size={18} />
                      Add member
                    </button>
                  )}
                  <button
                    type="button"
                    className={primaryButtonClass}
                    onClick={() => setIsCreateProposalOpen(true)}
                    disabled={Boolean(createProposalDisabledReason) || isPublishingProposal}
                    title={createProposalDisabledReason}
                  >
                    <Plus size={18} />
                    Create proposal
                  </button>
                </div>
                {(createProposalDisabledReason || (isOwner ? addMemberDisabledReason : "")) && (
                  <p className="text-xs font-bold text-[#8f9788]">
                    {createProposalDisabledReason || addMemberDisabledReason}
                  </p>
                )}
              </div>
            </div>

            <div className="grid border-t border-[#30382f]/70 bg-[#0c110d]/45 sm:grid-cols-3">
              {[
                { label: "Needs your vote", value: proposalsNeedingVote.length, icon: Vote },
                { label: "Active proposals", value: activeVotes, icon: Clock3 },
                { label: "Total votes", value: totalVotes, icon: Gauge }
              ].map((metric) => {
                const MetricIcon = metric.icon;
                return (
                  <div className="border-b border-[#30382f] p-5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0" key={metric.label}>
                    <MetricIcon className="mb-3 text-[#d8ff64]" size={20} />
                    <p className="text-sm font-bold text-[#8f9788]">{metric.label}</p>
                    <p className="mt-1 font-serif text-4xl font-bold text-[#fff8df]">{metric.value}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <aside className="order-2 grid content-start gap-4 lg:order-2">
            <section className="rounded-[1.15rem] border border-[#30382f]/70 bg-[#0c110d]/72 p-4 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-extrabold uppercase tracking-[0.16em] text-[#8f9788]">Registry / access</h2>
                <button
                  className={iconButtonClass}
                  type="button"
                  onClick={refreshData}
                  disabled={Boolean(pendingAction)}
                  aria-label="Refresh workspace"
                >
                  {isRefreshing ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                </button>
              </div>

              <div className="grid gap-3 text-sm">
                {orgContractAddress && (
                  <>
                    {organisationShareUrl && (
                      <div className="rounded-2xl bg-[#111610] p-3">
                        <p className="font-extrabold text-[#fff8df]">Member invite</p>
                        <p className="mt-1 text-xs font-bold leading-5 text-[#8f9788]">
                          Share this link with wallets you have already added as members.
                        </p>
                        <button
                          type="button"
                          className={`${secondaryButtonClass} mt-3 w-full justify-center`}
                          onClick={() => copyAddress(organisationShareUrl, "Organisation link")}
                        >
                          <Copy size={15} />
                          Copy organisation link
                        </button>
                      </div>
                    )}
                    <details
                      className="rounded-2xl bg-[#111610] p-3"
                      open={isTechnicalDetailsOpen}
                      onToggle={(event) => setIsTechnicalDetailsOpen(event.currentTarget.open)}
                    >
                      <summary className="cursor-pointer text-sm font-extrabold text-[#fff8df]">
                        Technical details
                      </summary>
                      <div className="mt-3 border-t border-[#30382f] pt-3">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#727b68]">
                          Organisation contract
                        </p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-[#8f9788]">{shortAddress(orgContractAddress)}</span>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="text-[#8f9788] hover:text-[#d8ff64]"
                              onClick={() => copyAddress(orgContractAddress, "Organisation contract")}
                              aria-label="Copy organisation contract address"
                            >
                              <Copy size={15} />
                            </button>
                            <a
                              className="text-[#8f9788] hover:text-[#d8ff64]"
                              href={`${BSCSCAN_TESTNET_BASE_URL}/address/${orgContractAddress}`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label="View organisation contract on BscScan"
                            >
                              <ExternalLink size={15} />
                            </a>
                          </div>
                        </div>
                      </div>
                    </details>
                  </>
                )}
                {!orgContractAddress && (
                  <p className="rounded-2xl bg-[#111610] p-3 text-sm font-bold text-[#8f9788]">
                    Open or deploy an organisation to activate the workspace.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[1.15rem] border border-[#30382f]/70 bg-[#0c110d]/72 p-4 backdrop-blur">
              <h2 className="mb-2 text-sm font-extrabold uppercase tracking-[0.16em] text-[#8f9788]">
                {hasOrganisation ? "Switch organisation" : "Open organisation"}
              </h2>
              <p className="mb-4 text-xs font-bold leading-5 text-[#727b68]">
                {hasOrganisation
                  ? "Opening another organisation changes the workspace shown here."
                  : "Members can open an organisation by exact name or invite link."}
              </p>
              <form className="grid gap-3" onSubmit={findOrganisation}>
                <input
                  className={inputClass}
                  value={organisationLookupName}
                  onChange={(event) => setOrganisationLookupName(event.target.value)}
                  placeholder={hasOrganisation ? "Switch to organisation name" : "Organisation name"}
                />
                <button
                  type="submit"
                  className={secondaryButtonClass}
                  disabled={Boolean(openOrganisationDisabledReason) || isOpeningOrganisation}
                  title={openOrganisationDisabledReason}
                >
                  {isOpeningOrganisation ? (
                    <Loader2 className="animate-spin" size={17} />
                  ) : (
                    <Search size={17} />
                  )}
                  {isOpeningOrganisation ? "Opening..." : "Open as member"}
                </button>
                {openOrganisationDisabledReason && (
                  <p className="text-xs font-bold text-[#8f9788]">{openOrganisationDisabledReason}</p>
                )}
              </form>
            </section>
          </aside>

          <section className="order-1 grid content-start gap-4 lg:order-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-serif text-3xl font-bold text-[#fff8df]">Proposals</h2>
                <p className="text-sm font-bold text-[#8f9788]">
                  {hasOrganisation
                    ? "A focused queue of decisions for this organisation."
                    : "Open or deploy an organisation to load proposals."}
                </p>
              </div>
              <div className="flex rounded-full border border-[#30382f] bg-[#111610] p-1">
                {[
                  { value: "action", label: "Needs vote", count: proposalsNeedingVote.length },
                  { value: "active", label: "Active", count: activeVotes },
                  { value: "ended", label: "Ended", count: endedVotes },
                  { value: "all", label: "All", count: proposals.length }
                ].map((filter) => (
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-2 text-xs font-bold transition ${
                      proposalFilter === filter.value
                        ? "bg-[#d8ff64] text-[#11160f]"
                        : "text-[#8f9788] hover:bg-[#20271d] hover:text-[#fff8df]"
                    }`}
                    key={filter.value}
                    onClick={() => setProposalFilter(filter.value as ProposalFilter)}
                  >
                    {filter.label} <span className="ml-1 opacity-70">{filter.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {showProposalSkeletons ? (
              <div className="grid gap-4" aria-label="Loading proposals">
                <ProposalSkeleton />
                <ProposalSkeleton />
              </div>
            ) : visibleProposals.length === 0 ? (
              <div className="rounded-[1.4rem] border border-[#30382f] bg-[#111610]/88 px-6 py-14 text-center shadow-[0_24px_80px_rgba(0,0,0,0.2)]">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#30382f] bg-[#151b13] text-[#d8ff64]">
                  {hasOrganisation ? <Vote size={28} /> : <Building2 size={28} />}
                </div>
                <h3 className="font-serif text-2xl font-bold text-[#fff8df]">{emptyProposalState.title}</h3>
                <p className="mx-auto mt-2 max-w-md text-sm font-medium leading-6 text-[#aeb6a3]">
                  {emptyProposalState.description}
                </p>
                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  {emptyProposalState.kind === "caught-up" || emptyProposalState.kind === "filtered" ? (
                      <>
                        <button type="button" className={secondaryButtonClass} onClick={() => setProposalFilter("active")}>
                          View active
                        </button>
                        <button type="button" className={secondaryButtonClass} onClick={() => setProposalFilter("ended")}>
                          View ended
                        </button>
                        <button type="button" className={secondaryButtonClass} onClick={() => setProposalFilter("all")}>
                          View all
                        </button>
                      </>
                  ) : emptyProposalState.kind === "new" ? (
                      <button
                        type="button"
                        className={primaryButtonClass}
                        onClick={() => setIsCreateProposalOpen(true)}
                        disabled={Boolean(createProposalDisabledReason) || isPublishingProposal}
                        title={createProposalDisabledReason}
                      >
                        <Plus size={18} />
                        Create proposal
                      </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={primaryButtonClass}
                        onClick={() => setIsDeployOrgOpen(true)}
                        disabled={Boolean(deployOrganisationDisabledReason) || isDeployingOrganisation}
                        title={deployOrganisationDisabledReason}
                      >
                        <Plus size={18} />
                        Deploy organisation
                      </button>
                      <ArrowRight className="hidden self-center text-[#59624f] sm:block" size={18} />
                      <span className="self-center text-sm font-bold text-[#8f9788]">or open by name</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid gap-4">
                {visibleProposals.map((proposal) => {
                  const deadlinePassed = proposal.deadline * 1000 <= nowMs;
                  const isEnded = proposal.closed || deadlinePassed;
                  const canClose = !proposal.closed && deadlinePassed;
                  const canShowWinner = proposal.totalVotes > 0 && isEnded;
                  const status = getProposalStatus(proposal, nowMs);
                  const countdown = formatCountdown(proposal.deadline, nowMs);
                  const voteDisabledReason = isWrongNetwork
                    ? "Switch to BSC Testnet before voting."
                    : !isMember
                      ? "Only organisation members can vote."
                      : proposal.hasVoted
                        ? "This wallet has already voted on this proposal."
                        : isEnded
                          ? "Voting is closed for this proposal."
                          : "";
                  const finalizeDisabledReason = proposal.closed
                    ? "This proposal is already finalized."
                    : isWrongNetwork
                      ? "Switch to BSC Testnet before finalizing."
                      : !deadlinePassed
                        ? `Available after deadline: ${formatDeadline(proposal.deadline)} (${countdown} remaining).`
                        : !isOwner && proposal.creator.toLowerCase() !== normalizedAccount
                          ? "Only the owner or proposal creator can finalize this vote."
                          : "";
                  const selectedOptionIndex =
                    selectedVote?.proposalId === proposal.id ? selectedVote.optionIndex : null;
                  const selectedOption =
                    selectedOptionIndex !== null ? proposal.options[selectedOptionIndex] : "";
                  const isVotePendingForProposal =
                    pendingAction?.type === "vote" && pendingAction.proposalId === proposal.id;
                  const isFinalizingThisProposal =
                    pendingAction?.type === "finalize" && pendingAction.proposalId === proposal.id;

                  return (
                    <article
                      className="overflow-hidden rounded-[1.4rem] border border-[#30382f] bg-[#111610]/90 shadow-[0_28px_90px_rgba(0,0,0,0.24)] backdrop-blur"
                      key={proposal.id}
                    >
                      <div className="p-6">
                        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <span className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#d8ff64]">
                              Proposal #{proposal.id}
                            </span>
                            <h3 className="mt-1 font-serif text-3xl font-bold leading-tight text-[#fff8df]">{proposal.title}</h3>
                          </div>
                          <div className="flex flex-wrap gap-2 sm:justify-end">
                            <span
                              className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase ${
                                status.tone === "success"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : status.tone === "warning"
                                    ? "bg-amber-50 text-amber-700"
                                    : "bg-[#252d21] text-[#aeb6a3]"
                              }`}
                            >
                              {isEnded ? <CheckCircle2 size={14} /> : <Clock3 size={14} />}
                              {status.label}
                            </span>
                            {!proposal.closed && (
                              <span
                                className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold uppercase ${
                                  deadlinePassed
                                    ? "border border-[#ffd166]/50 bg-[#ffd166]/12 text-[#ffd166]"
                                    : "border border-[#d8ff64]/40 bg-[#d8ff64]/10 text-[#d8ff64]"
                                }`}
                              >
                                <Clock3 size={14} />
                                {deadlinePassed ? "Deadline reached" : `Ends in ${countdown}`}
                              </span>
                            )}
                          </div>
                        </div>

                        <p className="mb-4 text-sm font-medium leading-6 text-[#b8bea9]">{proposal.description}</p>
                        <div className="mb-5 flex flex-wrap gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-[#8f9788]">
                          <span>{formatDeadline(proposal.deadline)}</span>
                          <span>-</span>
                          <span>{proposal.quorumReached ? "Quorum reached" : "Below quorum"}</span>
                          {canShowWinner && (
                            <>
                              <span>-</span>
                              <span className="inline-flex items-center gap-1 text-[#d8ff64]">
                                <Trophy size={13} />
                                {proposal.winningOption}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="grid gap-3">
                          {proposal.options.map((option, index) => {
                            const count = proposal.voteCounts[index] ?? 0;
                            const percent =
                              proposal.totalVotes === 0
                                ? 0
                                : Math.round((count / proposal.totalVotes) * 100);
                            const canVote = !voteDisabledReason && !isVotePendingForProposal;
                            const isSelected = selectedOptionIndex === index;
                            const optionBody = (
                              <>
                                <div
                                  className="absolute inset-y-0 left-0 z-0 bg-[#d8ff64]/15 transition-[width] duration-500"
                                  style={{ width: `${percent}%` }}
                                />
                                <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <span className="font-bold text-[#fff8df]">{option}</span>
                                  <span className="flex flex-wrap items-center gap-3 text-sm font-extrabold text-[#aeb6a3]">
                                    <span>
                                      {count} {count === 1 ? "vote" : "votes"} - {percent}%
                                    </span>
                                    {canVote && (
                                      <span
                                        className={`rounded-full px-3 py-1 text-xs transition ${
                                          isSelected
                                            ? "bg-[#ecff9f] text-[#11160f]"
                                            : "bg-[#d8ff64] text-[#11160f] group-hover:bg-[#ecff9f]"
                                        }`}
                                      >
                                        {isSelected ? "Selected" : "Select option"}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </>
                            );

                            return canVote ? (
                              <button
                                type="button"
                                className={`group relative w-full overflow-hidden rounded-2xl border bg-[#0c110d] p-5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                  isSelected
                                    ? "border-[#d8ff64] shadow-[0_0_0_1px_rgba(216,255,100,0.25)]"
                                    : "border-[#30382f] hover:border-[#d8ff64]/60"
                                }`}
                                key={`${proposal.id}-${option}`}
                                onClick={() => setSelectedVote({ proposalId: proposal.id, optionIndex: index })}
                              >
                                {optionBody}
                              </button>
                            ) : (
                              <div
                                className="relative w-full overflow-hidden rounded-2xl border border-[#30382f] bg-[#0c110d] p-5 text-left opacity-85"
                                key={`${proposal.id}-${option}`}
                              >
                                {optionBody}
                              </div>
                            );
                          })}
                        </div>
                        {!voteDisabledReason && selectedOptionIndex !== null ? (
                          <div className="mt-4 rounded-2xl border border-[#d8ff64]/35 bg-[#d8ff64]/10 p-4">
                            <p className="text-sm font-bold text-[#fff8df]">
                              Review your vote: {proposal.title}
                            </p>
                            <p className="mt-1 text-sm font-medium text-[#b8bea9]">
                              Selected option: <span className="font-extrabold text-[#d8ff64]">{selectedOption}</span>
                            </p>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                className={primaryButtonClass}
                                disabled={isVotePendingForProposal}
                                onClick={async () => {
                                  const voted = await submitVotingTransaction(
                                    "vote",
                                    [BigInt(proposal.id), BigInt(selectedOptionIndex)],
                                    "Vote recorded."
                                  );
                                  if (voted) setSelectedVote(null);
                                }}
                              >
                                {isVotePendingForProposal ? <Loader2 className="animate-spin" size={16} /> : <Vote size={16} />}
                                {isVotePendingForProposal ? "Casting vote..." : `Cast vote for ${selectedOption}`}
                              </button>
                              <button
                                type="button"
                                className={secondaryButtonClass}
                                onClick={() => setSelectedVote(null)}
                                disabled={isVotePendingForProposal}
                              >
                                Clear selection
                              </button>
                            </div>
                          </div>
                        ) : voteDisabledReason ? (
                          <p className="mt-3 rounded-2xl border border-[#30382f] bg-[#151b13] px-3 py-2 text-xs font-bold text-[#8f9788]">
                            {voteDisabledReason}
                          </p>
                        ) : (
                          <p className="mt-3 text-xs font-bold text-[#8f9788]">
                            Select one option to submit your vote on-chain.
                          </p>
                        )}
                      </div>

                      <div className="flex flex-col gap-3 border-t border-[#30382f] bg-[#0c110d] px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <span className="text-sm font-bold text-[#aeb6a3]">
                            {proposal.hasVoted ? "You have voted" : `${proposal.totalVotes} total votes`}
                          </span>
                          {finalizeDisabledReason && !proposal.closed && (
                            <p className="mt-1 text-xs font-bold text-[#727b68]">{finalizeDisabledReason}</p>
                          )}
                          {canClose && (
                            <p className="mt-1 text-xs font-extrabold text-[#d8ff64]">Ready to finalize.</p>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`${quietButtonClass} min-h-9 px-3 py-1.5 text-xs`}
                          disabled={
                            !canClose ||
                            isFinalizingThisProposal ||
                            isWrongNetwork ||
                            (!isOwner && proposal.creator.toLowerCase() !== normalizedAccount)
                          }
                          title={finalizeDisabledReason}
                          onClick={() =>
                            submitVotingTransaction(
                              "closeProposal",
                              [BigInt(proposal.id)],
                              "Proposal finalized."
                            )
                          }
                        >
                          {isFinalizingThisProposal ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : null}
                          {isFinalizingThisProposal ? "Finalizing..." : "Finalize voting"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>

      {isDeployOrgOpen && (
        <Modal
          title="Deploy Organisation"
          description="Create a dedicated voting contract owned by your wallet."
          onClose={() => setIsDeployOrgOpen(false)}
        >
          <form className="grid gap-4 px-5 py-5" onSubmit={deployOrganisation}>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#fff8df]">Organisation name</span>
              <input
                className={inputClass}
                required
                value={newOrganisationName}
                onChange={(event) => setNewOrganisationName(event.target.value)}
                placeholder="e.g., BrainExpress DAO"
              />
            </label>
            <div className="flex flex-col-reverse gap-3 border-t border-[#30382f] pt-4 sm:flex-row sm:justify-end">
              <button type="button" className={secondaryButtonClass} onClick={() => setIsDeployOrgOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={Boolean(deployOrganisationDisabledReason) || isDeployingOrganisation}
                title={deployOrganisationDisabledReason}
              >
                {isDeployingOrganisation ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Plus size={18} />
                )}
                {isDeployingOrganisation ? "Deploying..." : "Deploy contract"}
              </button>
            </div>
            {deployOrganisationDisabledReason && (
              <p className="text-sm font-bold text-[#8f9788]">{deployOrganisationDisabledReason}</p>
            )}
          </form>
        </Modal>
      )}

      {isCreateProposalOpen && (
        <Modal
          title="Create Proposal"
          description="Publish a member-only vote to the organisation contract."
          onClose={() => setIsCreateProposalOpen(false)}
        >
          <form className="grid max-h-[calc(100vh-9rem)] gap-4 overflow-y-auto px-5 py-5" onSubmit={createProposal}>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#fff8df]">Title</span>
              <input
                className={inputClass}
                required
                value={proposalForm.title}
                onChange={(event) =>
                  setProposalForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="e.g., Treasury allocation"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#fff8df]">Description</span>
              <textarea
                className={inputClass}
                required
                value={proposalForm.description}
                onChange={(event) =>
                  setProposalForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Describe the decision members are voting on."
                rows={4}
              />
            </label>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="block text-sm font-bold text-[#fff8df]">Options</span>
                <button
                  type="button"
                  className={`${secondaryButtonClass} min-h-8 px-3 py-1 text-xs`}
                  onClick={() =>
                    setProposalForm((current) => ({
                      ...current,
                      options: [...current.options, ""]
                    }))
                  }
                >
                  <Plus size={14} />
                  Add option
                </button>
              </div>
              <div className="grid gap-2">
                {proposalForm.options.map((option, index) => (
                  <div className="flex gap-2" key={`proposal-option-${index}`}>
                    <input
                      className={inputClass}
                      required
                      value={option}
                      onChange={(event) =>
                        setProposalForm((current) => ({
                          ...current,
                          options: current.options.map((currentOption, optionIndex) =>
                            optionIndex === index ? event.target.value : currentOption
                          )
                        }))
                      }
                      placeholder={`Option ${index + 1}`}
                    />
                    <button
                      type="button"
                      className={iconButtonClass}
                      onClick={() =>
                        setProposalForm((current) => ({
                          ...current,
                          options:
                            current.options.length <= 2
                              ? current.options
                              : current.options.filter((_, optionIndex) => optionIndex !== index)
                        }))
                      }
                      disabled={proposalForm.options.length <= 2}
                      aria-label={`Remove option ${index + 1}`}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
              {hasDuplicateProposalOptions && (
                <p className="mt-2 text-sm font-bold text-[#ffb4b4]">Options must be unique.</p>
              )}
            </div>
            <div className="rounded-2xl border border-[#30382f] bg-[#0c110d] p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#727b68]">Proposal preview</p>
              <p className="mt-2 font-serif text-xl font-bold text-[#fff8df]">
                {proposalForm.title.trim() || "Untitled proposal"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {proposalOptionsPreview.map((option, index) => (
                  <span
                    className="rounded-full border border-[#30382f] bg-[#151b13] px-3 py-1 text-xs font-bold text-[#b8bea9]"
                    key={`${option}-${index}`}
                  >
                    {option}
                  </span>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#fff8df]">Duration in days</span>
              <input
                className={inputClass}
                required
                type="number"
                min="0.01"
                step="0.01"
                value={proposalForm.durationDays}
                onChange={(event) =>
                  setProposalForm((current) => ({ ...current, durationDays: event.target.value }))
                }
              />
            </label>
            <div className="flex flex-col-reverse gap-3 border-t border-[#30382f] pt-4 sm:flex-row sm:justify-end">
              <button type="button" className={secondaryButtonClass} onClick={() => setIsCreateProposalOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={
                  Boolean(createProposalDisabledReason) ||
                  isPublishingProposal ||
                  hasDuplicateProposalOptions
                }
                title={createProposalDisabledReason || (hasDuplicateProposalOptions ? "Options must be unique." : "")}
              >
                {isPublishingProposal ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Vote size={18} />
                )}
                {isPublishingProposal ? "Publishing..." : "Publish proposal"}
              </button>
            </div>
            {(createProposalDisabledReason || hasDuplicateProposalOptions) && (
              <p className="text-sm font-bold text-[#8f9788]">
                {createProposalDisabledReason || "Options must be unique."}
              </p>
            )}
          </form>
        </Modal>
      )}

      {isAddMemberOpen && (
        <Modal
          title="Add Member"
          description="Grant a wallet permission to create proposals and vote."
          onClose={() => setIsAddMemberOpen(false)}
        >
          <form className="grid gap-4 px-5 py-5" onSubmit={addMember}>
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-[#fff8df]">Wallet address</span>
              <input
                className={inputClass}
                value={memberAddress}
                onChange={(event) => setMemberAddress(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <div className="flex flex-col-reverse gap-3 border-t border-[#30382f] pt-4 sm:flex-row sm:justify-end">
              <button type="button" className={secondaryButtonClass} onClick={() => setIsAddMemberOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className={primaryButtonClass}
                disabled={Boolean(addMemberDisabledReason) || isAddingMember}
                title={addMemberDisabledReason}
              >
                {isAddingMember ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <UserPlus size={18} />
                )}
                {isAddingMember ? "Adding..." : "Grant access"}
              </button>
            </div>
            {addMemberDisabledReason && (
              <p className="text-sm font-bold text-[#8f9788]">{addMemberDisabledReason}</p>
            )}
          </form>
        </Modal>
      )}

      <div className="fixed bottom-4 left-1/2 z-[60] grid w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 gap-3 sm:bottom-auto sm:left-auto sm:right-4 sm:top-4 sm:translate-x-0">
        {toasts.map((toast) => (
          <div
            className={`flex items-start gap-3 rounded-2xl border bg-[#111610] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.35)] ${
              toast.kind === "success"
                ? "border-[#d8ff64]/40"
                : toast.kind === "error"
                  ? "border-[#ff6b6b]/45"
                  : "border-[#45bba1]/45"
            }`}
            key={toast.id}
          >
            <span
              className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                toast.kind === "success"
                  ? "bg-[#d8ff64] text-[#11160f]"
                  : toast.kind === "error"
                    ? "bg-[#ff6b6b]/20 text-[#ffb4b4]"
                    : "bg-[#45bba1]/20 text-[#9cf3df]"
              }`}
            >
              {toast.kind === "success" ? (
                <CheckCircle2 size={16} />
              ) : toast.kind === "error" ? (
                <TriangleAlert size={16} />
              ) : (
                <Clock3 size={16} />
              )}
            </span>
            <p className="min-w-0 flex-1 text-sm font-bold leading-5 text-[#f4efe3]">
              {toast.message}
            </p>
            <button
              type="button"
              className="text-[#8f9788] hover:text-[#fff8df]"
              onClick={() =>
                setToasts((current) => current.filter((currentToast) => currentToast.id !== toast.id))
              }
              aria-label="Dismiss notification"
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
