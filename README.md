# Monad Velocity - Unleash Blockchain Gameplay on Monad

## Project Overview

**Monad Velocity** is a high-octane, multiplayer car racing game built on the cutting-edge Monad blockchain. Leveraging Monad's exceptional throughput and low latency, we deliver a seamless and engaging real-time racing experience where players can own, trade, and compete with unique, blockchain-based assets.

This project aims to showcase the power of Monad for interactive, on-chain games, demonstrating innovative gameplay mechanics powered by NFTs and transparent, immutable records.

## Key Features

* **Multiplayer Racing:** Engage in thrilling real-time races against other players.
* **NFT Car Ownership:** Each car is a unique NFT on the Monad blockchain, allowing for true digital ownership.
* **Customizable Cars:** Personalize your vehicles with NFT-based upgrades, skins, and accessories.
* **On-Chain Race Results & Leaderboards:** Race outcomes and player rankings are recorded transparently and immutably on the Monad blockchain.
* **Potential for Player-Owned Tracks/Events:** Future iterations could explore player-owned tracks and community-driven racing events as NFTs.
* **In-Game Token Economy:** A Monad-based in-game currency for rewards, upgrades, and participation.

## Tech Stack

* **Blockchain:** Monad
* **Smart Contracts:** Solidity
* **Game Engine (Client-Side - Web-Based):** Three.js (for 3D graphics)
* **Networking (Multiplayer - Web-Based):** WebSockets, Socket.IO
* **Frontend (Web3 Integration):** JavaScript (React), Web3.js or Ethers.js
* **Backend (Game Server):** Node.js (Express.js)
* **Database:** FireBase
* **Asset Management:** IPFS (InterPlanetary File System)

## Project Structure

```
MonadVelocity/
├── contracts/           # Smart contracts
│   ├── CarNFT.sol       # ERC-721 contract for cars
│   ├── GameToken.sol    # ERC-20 contract for in-game currency
│   ├── RaceRegistry.sol # Contract for race results
│   ├── deploy.js        # Deployment script
│   └── package.json     # Contract dependencies
├── frontend/            # Game frontend
│   ├── index.html       # Main HTML file
│   ├── main.js          # Game logic
│   ├── web3.js          # Web3 integration
│   ├── style.css        # Styling
│   └── package.json     # Frontend dependencies
├── ipfs/                # IPFS integration
│   ├── ipfsService.js   # IPFS service
│   └── mintNFT.js       # NFT minting script
├── scripts/             # Utility scripts
│   └── update-frontend.js # Script to update frontend with contract addresses
├── abi/                 # Contract ABIs (generated after deployment)
├── deployments/         # Deployment information (generated after deployment)
├── hardhat.config.js    # Hardhat configuration
└── README.md            # This file
```

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- MetaMask or another Web3 wallet
- Infura IPFS account (for NFT metadata storage)

## Setup

### 1. Install Dependencies

```bash
# Install contract dependencies
cd contracts
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Install IPFS dependencies
cd ../ipfs
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory with the following variables:

```
# Monad Velocity Smart Contract Addresses
CAR_NFT_ADDRESS=
GAME_TOKEN_ADDRESS=
RACE_REGISTRY_ADDRESS=

# Network Configuration
MONAD_RPC_URL=https://rpc.monad.xyz

# Wallet Configuration
PRIVATE_KEY=your_private_key_here
OWNER_ADDRESS=your_wallet_address_here

# IPFS Configuration
INFURA_IPFS_PROJECT_ID=your_infura_ipfs_project_id
INFURA_IPFS_PROJECT_SECRET=your_infura_ipfs_project_secret
```

### 3. Deploy Smart Contracts

```bash
cd contracts
npx hardhat compile
npx hardhat run deploy.js --network monadTestnet
```

### 4. Update Frontend with Contract Addresses

```bash
node scripts/update-frontend.js
```

### 5. Mint NFTs

```bash
cd ipfs
node mintNFT.js
```

### 6. Start the Game

```bash
cd frontend
npm start
```

## Smart Contracts

### CarNFT (ERC-721)

Represents cars in the game as NFTs. Each car has attributes like speed, handling, and acceleration.

### GameToken (ERC-20)

The in-game currency used for transactions, rewards, and race entry fees.

### RaceRegistry

Records race results on the blockchain and manages leaderboards.

## IPFS Integration

NFT metadata (car images, 3D models, attributes) is stored on IPFS using Infura's IPFS service.

## Web3 Integration

The frontend uses ethers.js to interact with the Monad blockchain and the user's wallet.

## Development

### Compile Contracts

```bash
cd contracts
npx hardhat compile
```

### Run Tests

```bash
cd contracts
npx hardhat test
```

### Deploy to Local Network

```bash
cd contracts
npx hardhat node
npx hardhat run deploy.js --network localhost
```

## License

MIT

## Team

* FOUR-FIET
* MOHIT MHATRE & ATHARVA JAGTAP

We have focused on leveraging Monad's core capabilities for a high-performance on-chain gaming experience.

## Future Enhancements

* **More Car Customization Options:** Expand the range of NFT-based customization items.
* **Multiple Race Tracks:** Introduce a variety of challenging and visually diverse race tracks.
* **In-Game Marketplace:** Implement a marketplace for trading NFT cars and customization items.
* **Player-Owned Tracks and Events:** Allow players to create and monetize their own racing content.
* **Advanced Racing Mechanics:** Implement features like drifting, boosting, and item pickups.
* **Integration with other Partner Technologies:** Explore opportunities to integrate additional partner technologies for bonus points.

## Disclaimer

This project is a work in progress developed for the HACKHAZARDS hackathon. The smart contracts and game mechanics are subject to further development and refinement.
