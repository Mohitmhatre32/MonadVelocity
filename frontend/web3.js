import { ethers } from 'ethers';
import { InjectedConnector } from '@web3-react/injected-connector';

// Contract ABIs (you'll need to replace these with your actual contract ABIs after deployment)
const CarNFTABI = []; // Add your CarNFT contract ABI here
const GameTokenABI = []; // Add your GameToken contract ABI here
const RaceRegistryABI = []; // Add your RaceRegistry contract ABI here

// Contract addresses (you'll need to replace these with your actual deployed contract addresses)
const CONTRACT_ADDRESSES = {
    carNFT: '', // Add your CarNFT contract address
    gameToken: '', // Add your GameToken contract address
    raceRegistry: '' // Add your RaceRegistry contract address
};

// Initialize Web3 connector
export const injected = new InjectedConnector({
    supportedChainIds: [1, 3, 4, 5, 42] // Add Monad chain ID when available
});

class Web3Service {
    constructor() {
        this.provider = null;
        this.signer = null;
        this.contracts = {};
        this.account = null;
    }
    
    async initialize() {
        if (window.ethereum) {
            this.provider = new ethers.providers.Web3Provider(window.ethereum);
            this.signer = this.provider.getSigner();
            this.account = await this.signer.getAddress();
            
            // Initialize contract instances
            this.contracts.carNFT = new ethers.Contract(
                CONTRACT_ADDRESSES.carNFT,
                CarNFTABI,
                this.signer
            );
            
            this.contracts.gameToken = new ethers.Contract(
                CONTRACT_ADDRESSES.gameToken,
                GameTokenABI,
                this.signer
            );
            
            this.contracts.raceRegistry = new ethers.Contract(
                CONTRACT_ADDRESSES.raceRegistry,
                RaceRegistryABI,
                this.signer
            );
        }
    }

    async connectWallet() {
        try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            await this.initialize();
            return true;
        } catch (error) {
            console.error('Error connecting wallet:', error);
            return false;
        }
    }

    async getCarNFTs() {
        try {
            const balance = await this.contracts.carNFT.balanceOf(this.account);
            const cars = [];
            
            for (let i = 0; i < balance; i++) {
                const tokenId = await this.contracts.carNFT.tokenOfOwnerByIndex(this.account, i);
                const car = await this.contracts.carNFT.getCar(tokenId);
                cars.push({ tokenId, ...car });
            }
            
            return cars;
        } catch (error) {
            console.error('Error fetching car NFTs:', error);
            return [];
        }
    }

    async getTokenBalance() {
        try {
            const balance = await this.contracts.gameToken.balanceOf(this.account);
            return ethers.utils.formatEther(balance);
        } catch (error) {
            console.error('Error fetching token balance:', error);
            return '0';
        }
    }

    async getRaceResults(trackId) {
        try {
            return await this.contracts.raceRegistry.getTrackResults(trackId);
        } catch (error) {
            console.error('Error fetching race results:', error);
            return [];
        }
    }

    async submitRaceResult(carId, trackId, time) {
        try {
            const tx = await this.contracts.raceRegistry.submitRaceResult(
                this.account,
                carId,
                trackId,
                time
            );
            await tx.wait();
            return true;
        } catch (error) {
            console.error('Error submitting race result:', error);
            return false;
        }
    }
}

export const web3Service = new Web3Service(); 