import { create } from 'ipfs-http-client';
import { Buffer } from 'buffer';

// IPFS configuration
const ipfsConfig = {
  host: 'ipfs.infura.io',
  port: 5001,
  protocol: 'https',
  // You'll need to replace these with your Infura IPFS credentials
  headers: {
    authorization: 'Basic ' + Buffer.from(process.env.INFURA_IPFS_PROJECT_ID + ':' + process.env.INFURA_IPFS_PROJECT_SECRET).toString('base64')
  }
};

class IPFSService {
  constructor() {
    this.ipfs = create(ipfsConfig);
  }

  /**
   * Upload metadata to IPFS
   * @param {Object} metadata - The metadata object to upload
   * @returns {Promise<string>} - The IPFS hash of the uploaded metadata
   */
  async uploadMetadata(metadata) {
    try {
      const data = JSON.stringify(metadata);
      const result = await this.ipfs.add(data);
      return result.path;
    } catch (error) {
      console.error('Error uploading metadata to IPFS:', error);
      throw error;
    }
  }

  /**
   * Upload a file to IPFS
   * @param {File|Buffer} file - The file to upload
   * @returns {Promise<string>} - The IPFS hash of the uploaded file
   */
  async uploadFile(file) {
    try {
      const result = await this.ipfs.add(file);
      return result.path;
    } catch (error) {
      console.error('Error uploading file to IPFS:', error);
      throw error;
    }
  }

  /**
   * Create car NFT metadata
   * @param {Object} carData - The car data
   * @param {string} imageHash - The IPFS hash of the car image
   * @param {string} modelHash - The IPFS hash of the 3D model (optional)
   * @returns {Object} - The metadata object
   */
  createCarMetadata(carData, imageHash, modelHash = null) {
    const metadata = {
      name: carData.name,
      description: carData.description,
      image: `ipfs://${imageHash}`,
      attributes: [
        {
          trait_type: "Speed",
          value: carData.speed
        },
        {
          trait_type: "Handling",
          value: carData.handling
        },
        {
          trait_type: "Acceleration",
          value: carData.acceleration
        }
      ],
      properties: {
        files: [
          {
            uri: `ipfs://${imageHash}`,
            type: "image/png"
          }
        ]
      }
    };

    // Add 3D model if available
    if (modelHash) {
      metadata.properties.files.push({
        uri: `ipfs://${modelHash}`,
        type: "model/gltf+json"
      });
    }

    return metadata;
  }

  /**
   * Get metadata from IPFS
   * @param {string} hash - The IPFS hash of the metadata
   * @returns {Promise<Object>} - The metadata object
   */
  async getMetadata(hash) {
    try {
      const stream = this.ipfs.cat(hash);
      let data = '';
      
      for await (const chunk of stream) {
        data += chunk.toString();
      }
      
      return JSON.parse(data);
    } catch (error) {
      console.error('Error getting metadata from IPFS:', error);
      throw error;
    }
  }
}

export const ipfsService = new IPFSService(); 