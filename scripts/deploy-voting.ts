import hardhat from "hardhat";

const { ethers } = hardhat;

async function main() {
  const [deployer] = await ethers.getSigners();
  const OnchainVoting = await ethers.getContractFactory("OnchainVoting");
  const voting = await OnchainVoting.deploy(deployer.address);
  await voting.waitForDeployment();

  console.log(`OnchainVoting deployed to: ${await voting.getAddress()}`);
  console.log(`Owner: ${deployer.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
