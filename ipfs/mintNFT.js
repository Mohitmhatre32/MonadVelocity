import { ethers } from 'ethers';
import { ipfsService } from './ipfsService.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Contract ABI and address (you'll need to replace these with your actual deployed contract details)
const CarNFTABI = []; // Add your CarNFT contract ABI here
const CarNFTAddress = process.env.CAR_NFT_ADDRESS;

// Provider setup
const provider = new ethers.providers.JsonRpcProvider(process.env.MONAD_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
const carNFTContract = new ethers.Contract(CarNFTAddress, CarNFTABI, wallet);

/**
 * Mint a new car NFT with IPFS metadata
 * @param {Object} carData - The car data
 * @param {string} imagePath - Path to the car image
 * @param {string} modelPath - Path to the 3D model (optional)
 * @returns {Promise<Object>} - The minted NFT details
 */
async function mintCarNFT(carData, imagePath, modelPath = null) {
  try {
    console.log('Uploading car image to IPFS...');
    const imageFile = fs.readFileSync(imagePath);
    const imageHash = await ipfsService.uploadFile(imageFile);
    console.log(`Image uploaded to IPFS: ${imageHash}`);

    let modelHash = null;
    if (modelPath) {
      console.log('Uploading 3D model to IPFS...');
      const modelFile = fs.readFileSync(modelPath);
      modelHash = await ipfsService.uploadFile(modelFile);
      console.log(`3D model uploaded to IPFS: ${modelHash}`);
    }

    console.log('Creating metadata...');
    const metadata = ipfsService.createCarMetadata(carData, imageHash, modelHash);
    
    console.log('Uploading metadata to IPFS...');
    const metadataHash = await ipfsService.uploadMetadata(metadata);
    console.log(`Metadata uploaded to IPFS: ${metadataHash}`);

    console.log('Minting NFT...');
    const tx = await carNFTContract.mintCar(
      carData.owner,
      carData.name,
      `ipfs://${metadataHash}`,
      carData.speed,
      carData.handling,
      carData.acceleration
    );
    
    const receipt = await tx.wait();
    const event = receipt.events.find(e => e.event === 'Transfer');
    const tokenId = event.args.tokenId.toString();
    
    console.log(`NFT minted successfully! Token ID: ${tokenId}`);
    
    return {
      tokenId,
      metadataHash,
      imageHash,
      modelHash
    };
  } catch (error) {
    console.error('Error minting car NFT:', error);
    throw error;
  }
}

/**
 * Batch mint multiple car NFTs
 * @param {Array<Object>} carsData - Array of car data objects
 * @param {string} imagesDir - Directory containing car images
 * @param {string} modelsDir - Directory containing 3D models (optional)
 * @returns {Promise<Array<Object>>} - Array of minted NFT details
 */
async function batchMintCarNFTs(carsData, imagesDir, modelsDir = null) {
  const results = [];
  
  for (const carData of carsData) {
    const imagePath = path.join(imagesDir, carData.imageFile);
    let modelPath = null;
    
    if (modelsDir && carData.modelFile) {
      modelPath = path.join(modelsDir, carData.modelFile);
    }
    
    const result = await mintCarNFT(carData, imagePath, modelPath);
    results.push(result);
    
    // Add a delay between mints to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return results;
}

// Example usage
async function main() {
  try {
    // Example car data
    const carData = {
      name: "Monad Speedster",
      description: "A high-performance racing car for the Monad blockchain",
      owner: process.env.OWNER_ADDRESS,
      speed: 95,
      handling: 88,
      acceleration: 92,
      imageFile: "speedster.png"
    };
    
    const result = await mintCarNFT(carData, "./assets/images/speedster.png");
    console.log("Minting result:", result);
    
    // Example batch minting
    /*
    const carsData = [
      {
        name: "Monad Speedster",
        description: "A high-performance racing car",
        owner: process.env.OWNER_ADDRESS,
        speed: 95,
        handling: 88,
        acceleration: 92,
        imageFile: "speedster.png"
      },
      {
        name: "Monad Cruiser",
        description: "A balanced racing car",
        owner: process.env.OWNER_ADDRESS,
        speed: 85,
        handling: 90,
        acceleration: 85,
        imageFile: "cruiser.png"
      }
    ];
    
    const results = await batchMintCarNFTs(carsData, "./assets/images");
    console.log("Batch minting results:", results);
    */
  } catch (error) {
    console.error("Error in main function:", error);
  }
}

// Run the script if called directly
if (require.main === module) {
  main();
}

export { mintCarNFT, batchMintCarNFTs }; 