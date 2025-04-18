// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Import all necessary components from OpenZeppelin
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title CarNFT
 * @dev Represents unique racing cars as NFTs for MonadVelocity.
 */
contract CarNFT is ERC721, ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    struct CarAttributes {
        string name;
        uint256 speed;
        uint256 handling;
        uint256 acceleration;
    }

    mapping(uint256 => CarAttributes) public carAttributes;

    /**
     * @dev Constructor sets the NFT collection name and transfers ownership.
     */
    constructor(address initialOwner)
        ERC721("MonadVelocity Cars", "MVC")
        Ownable()
    {
        transferOwnership(initialOwner); // ✅ Assign custom owner
    }

    /**
     * @notice Mints a new car NFT and assigns it to a player.
     */
    function mintCar(
        address player,
        string memory name,
        string memory tokenURI_,
        uint256 speed,
        uint256 handling,
        uint256 acceleration
    ) public onlyOwner returns (uint256) {
        _tokenIds.increment();
        uint256 newCarId = _tokenIds.current();

        _mint(player, newCarId);
        _setTokenURI(newCarId, tokenURI_);

        carAttributes[newCarId] = CarAttributes({
            name: name,
            speed: speed,
            handling: handling,
            acceleration: acceleration
        });

        return newCarId;
    }

    /**
     * @notice Retrieves on-chain car attributes.
     */
    function getCarAttributes(uint256 tokenId) public view returns (CarAttributes memory) {
        require(_exists(tokenId), "CarNFT: URI query for nonexistent token");
        return carAttributes[tokenId];
    }

    /**
     * @dev Overrides tokenURI to use ERC721URIStorage implementation.
     */
    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        require(_exists(tokenId), "CarNFT: URI query for nonexistent token");
        return super.tokenURI(tokenId);
    }

    /**
     * @dev Overrides supportsInterface.
     */
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev Overrides _beforeTokenTransfer (ONLY ERC721 needed in override).
     */
    function _beforeTokenTransfer(address from, address to, uint256 firstTokenId, uint256 batchSize)
        internal
        override(ERC721)
    {
        super._beforeTokenTransfer(from, to, firstTokenId, batchSize);
    }

    /**
     * @dev Overrides _burn to support ERC721URIStorage cleanup.
     */
    function _burn(uint256 tokenId)
        internal
        override(ERC721, ERC721URIStorage)
    {
        super._burn(tokenId);
    }
}
