const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

async function main() {
  console.log("Deploying Monad Velocity smart contracts...");
  
  // Get the contract factory
  const CarNFT = await ethers.getContractFactory("CarNFT");
  const GameToken = await ethers.getContractFactory("GameToken");
  const RaceRegistry = await ethers.getContractFactory("RaceRegistry");
  
  // Deploy CarNFT contract
  console.log("Deploying CarNFT contract...");
  const carNFT = await CarNFT.deploy();
  await carNFT.deployed();
  console.log(`CarNFT deployed to: ${carNFT.address}`);
  
  // Deploy GameToken contract
  console.log("Deploying GameToken contract...");
  const gameToken = await GameToken.deploy();
  await gameToken.deployed();
  console.log(`GameToken deployed to: ${gameToken.address}`);
  
  // Deploy RaceRegistry contract with GameToken address
  console.log("Deploying RaceRegistry contract...");
  const raceRegistry = await RaceRegistry.deploy(gameToken.address);
  await raceRegistry.deployed();
  console.log(`RaceRegistry deployed to: ${raceRegistry.address}`);
  
  // Save deployment information
  const deploymentInfo = {
    carNFT: carNFT.address,
    gameToken: gameToken.address,
    raceRegistry: raceRegistry.address,
    network: network.name,
    timestamp: new Date().toISOString()
  };
  
  // Create deployments directory if it doesn't exist
  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  
  // Save deployment info to file
  const deploymentFile = path.join(deploymentsDir, `${network.name}.json`);
  fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
  console.log(`Deployment information saved to: ${deploymentFile}`);
  
  // Get contract ABIs
  const carNFTABI = JSON.parse(JSON.stringify(CarNFT.interface.format()));
  const gameTokenABI = JSON.parse(JSON.stringify(GameToken.interface.format()));
  const raceRegistryABI = JSON.parse(JSON.stringify(RaceRegistry.interface.format()));
  
  // Save ABIs to files
  const abiDir = path.join(__dirname, "..", "abi");
  if (!fs.existsSync(abiDir)) {
    fs.mkdirSync(abiDir, { recursive: true });
  }
  
  fs.writeFileSync(path.join(abiDir, "CarNFT.json"), JSON.stringify(carNFTABI, null, 2));
  fs.writeFileSync(path.join(abiDir, "GameToken.json"), JSON.stringify(gameTokenABI, null, 2));
  fs.writeFileSync(path.join(abiDir, "RaceRegistry.json"), JSON.stringify(raceRegistryABI, null, 2));
  console.log("Contract ABIs saved to abi directory");
  
  // Create .env file with contract addresses
  const envContent = `
# Monad Velocity Smart Contract Addresses
CAR_NFT_ADDRESS=${carNFT.address}
GAME_TOKEN_ADDRESS=${gameToken.address}
RACE_REGISTRY_ADDRESS=${raceRegistry.address}

# Network Configuration
MONAD_RPC_URL=${process.env.MONAD_RPC_URL || "https://rpc.monad.xyz"}

# Wallet Configuration
PRIVATE_KEY=${process.env.PRIVATE_KEY || ""}
OWNER_ADDRESS=${process.env.OWNER_ADDRESS || ""}

# IPFS Configuration
INFURA_IPFS_PROJECT_ID=${process.env.INFURA_IPFS_PROJECT_ID || ""}
INFURA_IPFS_PROJECT_SECRET=${process.env.INFURA_IPFS_PROJECT_SECRET || ""}
`;
  
  fs.writeFileSync(path.join(__dirname, "..", ".env"), envContent);
  console.log(".env file created with contract addresses");
  
  console.log("Deployment completed successfully!");
}

// Execute the deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 