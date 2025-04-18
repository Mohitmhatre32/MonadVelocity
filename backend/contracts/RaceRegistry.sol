// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./GameToken.sol";

contract RaceRegistry is Ownable {
    GameToken public gameToken;

    struct RaceResult {
        address player;
        uint256 carId;
        uint256 time;
        uint256 trackId;
        uint256 prize;
        uint256 timestamp;
    }

    struct Track {
        string name;
        uint256 entryFee;
        uint256 prizePool;
    }

    mapping(uint256 => RaceResult[]) public trackResults;
    mapping(uint256 => Track) public tracks;
    mapping(address => uint256) public playerWinnings;

    event RaceCompleted(
        address indexed player,
        uint256 carId,
        uint256 trackId,
        uint256 time,
        uint256 prize
    );

    constructor(address _gameToken) {
        gameToken = GameToken(_gameToken);
    }

    function addTrack(
        uint256 trackId,
        string memory name,
        uint256 entryFee,
        uint256 prizePool
    ) public onlyOwner {
        tracks[trackId] = Track({
            name: name,
            entryFee: entryFee,
            prizePool: prizePool
        });
    }

    function submitRaceResult(
        address player,
        uint256 carId,
        uint256 trackId,
        uint256 time
    ) public onlyOwner {
        require(tracks[trackId].entryFee > 0, "Track does not exist");
        
        uint256 prize = calculatePrize(time, trackId);
        
        RaceResult memory result = RaceResult({
            player: player,
            carId: carId,
            time: time,
            trackId: trackId,
            prize: prize,
            timestamp: block.timestamp
        });

        trackResults[trackId].push(result);
        playerWinnings[player] += prize;

        // Transfer prize to player
        gameToken.mint(player, prize);

        emit RaceCompleted(player, carId, trackId, time, prize);
    }

    function calculatePrize(uint256 time, uint256 trackId) internal view returns (uint256) {
        // Simple prize calculation based on time
        // This can be made more complex based on game requirements
        return tracks[trackId].prizePool / 10;
    }

    function getTrackResults(uint256 trackId) public view returns (RaceResult[] memory) {
        return trackResults[trackId];
    }

    function getPlayerWinnings(address player) public view returns (uint256) {
        return playerWinnings[player];
    }
} 