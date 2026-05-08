// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./OnchainVoting.sol";

contract VotingFactory {
    struct Organisation {
        string name;
        address contractAddress;
        uint256 deployedAt;
    }

    mapping(address => Organisation) public orgByOwner;
    mapping(string => address) public ownerByName;
    address[] public allContracts;

    event OrganisationDeployed(
        address indexed owner,
        address indexed contractAddress,
        string name
    );

    function deploy(string calldata orgName) external returns (address) {
        require(bytes(orgName).length > 0, "Name required");
        require(
            orgByOwner[msg.sender].contractAddress == address(0),
            "You already have a contract"
        );
        require(ownerByName[orgName] == address(0), "Name already taken");

        OnchainVoting voting = new OnchainVoting(msg.sender);
        address contractAddr = address(voting);

        orgByOwner[msg.sender] = Organisation({
            name: orgName,
            contractAddress: contractAddr,
            deployedAt: block.timestamp
        });

        ownerByName[orgName] = msg.sender;
        allContracts.push(contractAddr);

        emit OrganisationDeployed(msg.sender, contractAddr, orgName);
        return contractAddr;
    }

    function getMyContract() external view returns (address) {
        return orgByOwner[msg.sender].contractAddress;
    }

    function getContractByName(string calldata orgName) external view returns (address) {
        address ownerAddr = ownerByName[orgName];
        require(ownerAddr != address(0), "Organisation not found");
        return orgByOwner[ownerAddr].contractAddress;
    }

    function totalOrganisations() external view returns (uint256) {
        return allContracts.length;
    }
}
