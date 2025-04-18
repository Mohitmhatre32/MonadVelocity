const fs = require('fs');
const path = require('path');

// Directories to create
const directories = [
  'contracts',
  'frontend',
  'ipfs',
  'scripts',
  'abi',
  'deployments',
  'assets/images',
  'assets/models'
];

// Create directories
function createDirectories() {
  console.log('Creating directories...');
  
  directories.forEach(dir => {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dir}`);
    } else {
      console.log(`Directory already exists: ${dir}`);
    }
  });
}

// Create .env file if it doesn't exist
function createEnvFile() {
  console.log('Creating .env file...');
  
  const envPath = path.join(__dirname, '..', '.env');
  const envExamplePath = path.join(__dirname, '..', '.env.example');
  
  if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
    fs.copyFileSync(envExamplePath, envPath);
    console.log('Created .env file from .env.example');
  } else if (fs.existsSync(envPath)) {
    console.log('.env file already exists');
  } else {
    console.log('Could not create .env file: .env.example not found');
  }
}

// Main function
function main() {
  console.log('Setting up Monad Velocity project...');
  
  createDirectories();
  createEnvFile();
  
  console.log('Setup completed successfully!');
  console.log('Next steps:');
  console.log('1. Install dependencies:');
  console.log('   cd contracts && npm install');
  console.log('   cd ../frontend && npm install');
  console.log('   cd ../ipfs && npm install');
  console.log('2. Configure your .env file with your credentials');
  console.log('3. Deploy smart contracts:');
  console.log('   cd contracts && npx hardhat run deploy.js --network monadTestnet');
  console.log('4. Update frontend with contract addresses:');
  console.log('   node scripts/update-frontend.js');
  console.log('5. Start the game:');
  console.log('   cd frontend && npm start');
}

// Execute the script
main(); 