import { ethers } from "hardhat";

async function main() {
  const OnchainVoting = await ethers.getContractFactory("OnchainVoting");
  const voting = await OnchainVoting.deploy();
  await voting.waitForDeployment();

  console.log(`OnchainVoting deployed to: ${await voting.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
