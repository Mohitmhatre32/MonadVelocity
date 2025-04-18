const fs = require('fs');
const path = require('path');

// Paths
const deploymentsDir = path.join(__dirname, '..', 'deployments');
const abiDir = path.join(__dirname, '..', 'abi');
const frontendWeb3Path = path.join(__dirname, '..', 'frontend', 'web3.js');

// Get the latest deployment info
function getLatestDeployment() {
  const files = fs.readdirSync(deploymentsDir);
  if (files.length === 0) {
    console.error('No deployment files found!');
    process.exit(1);
  }

  // Sort by timestamp (newest first)
  const sortedFiles = files.sort((a, b) => {
    const fileA = JSON.parse(fs.readFileSync(path.join(deploymentsDir, a)));
    const fileB = JSON.parse(fs.readFileSync(path.join(deploymentsDir, b)));
    return new Date(fileB.timestamp) - new Date(fileA.timestamp);
  });

  return JSON.parse(fs.readFileSync(path.join(deploymentsDir, sortedFiles[0])));
}

// Get contract ABIs
function getContractABIs() {
  const carNFTABI = JSON.parse(fs.readFileSync(path.join(abiDir, 'CarNFT.json')));
  const gameTokenABI = JSON.parse(fs.readFileSync(path.join(abiDir, 'GameToken.json')));
  const raceRegistryABI = JSON.parse(fs.readFileSync(path.join(abiDir, 'RaceRegistry.json')));

  return {
    carNFT: carNFTABI,
    gameToken: gameTokenABI,
    raceRegistry: raceRegistryABI
  };
}

// Update the frontend web3.js file
function updateFrontendWeb3(deployment, abis) {
  if (!fs.existsSync(frontendWeb3Path)) {
    console.error('Frontend web3.js file not found!');
    process.exit(1);
  }

  let web3Content = fs.readFileSync(frontendWeb3Path, 'utf8');

  // Update contract addresses
  web3Content = web3Content.replace(
    /const CONTRACT_ADDRESSES = {[\s\S]*?};/,
    `const CONTRACT_ADDRESSES = {
    carNFT: '${deployment.carNFT}',
    gameToken: '${deployment.gameToken}',
    raceRegistry: '${deployment.raceRegistry}'
};`
  );

  // Update contract ABIs
  web3Content = web3Content.replace(
    /const CarNFTABI = \[[\s\S]*?\];/,
    `const CarNFTABI = ${JSON.stringify(abis.carNFT, null, 2)};`
  );

  web3Content = web3Content.replace(
    /const GameTokenABI = \[[\s\S]*?\];/,
    `const GameTokenABI = ${JSON.stringify(abis.gameToken, null, 2)};`
  );

  web3Content = web3Content.replace(
    /const RaceRegistryABI = \[[\s\S]*?\];/,
    `const RaceRegistryABI = ${JSON.stringify(abis.raceRegistry, null, 2)};`
  );

  // Write the updated content back to the file
  fs.writeFileSync(frontendWeb3Path, web3Content);
  console.log('Frontend web3.js file updated successfully!');
}

// Main function
function main() {
  console.log('Updating frontend with latest contract deployment...');
  
  const deployment = getLatestDeployment();
  console.log(`Using deployment from network: ${deployment.network}`);
  
  const abis = getContractABIs();
  console.log('Contract ABIs loaded successfully');
  
  updateFrontendWeb3(deployment, abis);
  
  console.log('Frontend update completed successfully!');
}

// Execute the script
main(); 