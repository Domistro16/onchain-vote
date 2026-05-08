// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract OnchainVoting {
    struct Proposal {
        string title;
        string description;
        string[] options;
        uint256[] voteCounts;
        uint256 deadline;
        bool closed;
        address creator;
    }

    struct ProposalDetails {
        string title;
        string description;
        string[] options;
        uint256[] voteCounts;
        uint256 deadline;
        bool closed;
        address creator;
        uint256 totalVotes;
        bool quorumReached;
        uint256 winningIndex;
        string winningOption;
    }

    address public owner;
    uint256 public quorum = 2;
    mapping(address => bool) public isMember;
    Proposal[] private proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event MemberAdded(address indexed account);
    event MemberRemoved(address indexed account);
    event ProposalCreated(uint256 indexed proposalId, string title, uint256 deadline);
    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 optionIndex);
    event ProposalClosed(uint256 indexed proposalId);
    event QuorumUpdated(uint256 quorum);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyMember() {
        require(isMember[msg.sender], "Only members");
        _;
    }

    modifier proposalExists(uint256 proposalId) {
        require(proposalId < proposals.length, "Proposal does not exist");
        _;
    }

    constructor(address _owner) {
        require(_owner != address(0), "Invalid owner");
        owner = _owner;
        isMember[_owner] = true;
        emit MemberAdded(_owner);
    }

    function addMember(address account) external onlyOwner {
        require(account != address(0), "Invalid account");
        require(!isMember[account], "Already a member");
        isMember[account] = true;
        emit MemberAdded(account);
    }

    function removeMember(address account) external onlyOwner {
        require(account != owner, "Owner stays member");
        require(isMember[account], "Not a member");
        isMember[account] = false;
        emit MemberRemoved(account);
    }

    function setQuorum(uint256 newQuorum) external onlyOwner {
        require(newQuorum > 0, "Quorum required");
        quorum = newQuorum;
        emit QuorumUpdated(newQuorum);
    }

    function createProposal(
        string calldata title,
        string calldata description,
        string[] calldata options,
        uint256 durationSeconds
    ) external onlyMember returns (uint256 proposalId) {
        require(bytes(title).length > 0, "Title required");
        require(options.length >= 2, "At least two options");
        require(durationSeconds > 0, "Duration required");

        proposalId = proposals.length;
        Proposal storage proposal = proposals.push();
        proposal.title = title;
        proposal.description = description;
        proposal.deadline = block.timestamp + durationSeconds;
        proposal.creator = msg.sender;

        for (uint256 i = 0; i < options.length; i++) {
            require(bytes(options[i]).length > 0, "Empty option");
            proposal.options.push(options[i]);
            proposal.voteCounts.push(0);
        }

        emit ProposalCreated(proposalId, title, proposal.deadline);
    }

    function vote(uint256 proposalId, uint256 optionIndex)
        external
        onlyMember
        proposalExists(proposalId)
    {
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.closed, "Proposal closed");
        require(block.timestamp < proposal.deadline, "Voting ended");
        require(optionIndex < proposal.options.length, "Invalid option");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        hasVoted[proposalId][msg.sender] = true;
        proposal.voteCounts[optionIndex] += 1;

        emit VoteCast(proposalId, msg.sender, optionIndex);
    }

    function closeProposal(uint256 proposalId) external proposalExists(proposalId) {
        Proposal storage proposal = proposals[proposalId];
        require(
            msg.sender == owner || msg.sender == proposal.creator,
            "Only owner or creator"
        );
        require(!proposal.closed, "Already closed");
        require(block.timestamp >= proposal.deadline, "Voting still active");

        proposal.closed = true;
        emit ProposalClosed(proposalId);
    }

    function proposalCount() external view returns (uint256) {
        return proposals.length;
    }

    function getProposal(uint256 proposalId)
        external
        view
        proposalExists(proposalId)
        returns (
            string memory title,
            string memory description,
            uint256 deadline,
            bool closed,
            address creator
        )
    {
        Proposal storage proposal = proposals[proposalId];
        return (
            proposal.title,
            proposal.description,
            proposal.deadline,
            proposal.closed,
            proposal.creator
        );
    }

    function getOptions(uint256 proposalId)
        external
        view
        proposalExists(proposalId)
        returns (string[] memory)
    {
        return proposals[proposalId].options;
    }

    function getVoteCounts(uint256 proposalId)
        external
        view
        proposalExists(proposalId)
        returns (uint256[] memory)
    {
        return proposals[proposalId].voteCounts;
    }

    function getTotalVotes(uint256 proposalId)
        public
        view
        proposalExists(proposalId)
        returns (uint256 totalVotes)
    {
        uint256[] storage counts = proposals[proposalId].voteCounts;
        for (uint256 i = 0; i < counts.length; i++) {
            totalVotes += counts[i];
        }
    }

    function hasReachedQuorum(uint256 proposalId)
        public
        view
        proposalExists(proposalId)
        returns (bool)
    {
        return getTotalVotes(proposalId) >= quorum;
    }

    function getWinner(uint256 proposalId)
        public
        view
        proposalExists(proposalId)
        returns (uint256 winningIndex, string memory winningOption)
    {
        Proposal storage proposal = proposals[proposalId];
        uint256 highest = 0;

        for (uint256 i = 0; i < proposal.voteCounts.length; i++) {
            if (proposal.voteCounts[i] > highest) {
                highest = proposal.voteCounts[i];
                winningIndex = i;
            }
        }

        winningOption = proposal.options[winningIndex];
    }

    function getFullProposal(uint256 proposalId)
        external
        view
        proposalExists(proposalId)
        returns (ProposalDetails memory details)
    {
        Proposal storage proposal = proposals[proposalId];
        (uint256 winningIndex, string memory winningOption) = getWinner(proposalId);

        details = ProposalDetails({
            title: proposal.title,
            description: proposal.description,
            options: proposal.options,
            voteCounts: proposal.voteCounts,
            deadline: proposal.deadline,
            closed: proposal.closed,
            creator: proposal.creator,
            totalVotes: getTotalVotes(proposalId),
            quorumReached: hasReachedQuorum(proposalId),
            winningIndex: winningIndex,
            winningOption: winningOption
        });
    }
}
