// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract GameToken is ERC20, Ownable {
    constructor() ERC20("MonadVelocity Token", "MVT") {
        _transferOwnership(msg.sender);
        _mint(msg.sender, 1000000 * 10 ** decimals()); // Initial supply of 1 million tokens
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) public onlyOwner {
        _burn(from, amount);
    }

    // Function to distribute rewards to players
    function distributeRewards(address[] memory players, uint256[] memory amounts) public onlyOwner {
        require(players.length == amounts.length, "Arrays length mismatch");
        for (uint256 i = 0; i < players.length; i++) {
            _mint(players[i], amounts[i]);
        }
    }
} 