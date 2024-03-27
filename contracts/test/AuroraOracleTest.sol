// SPDX-License-Identifier: CC-BY-1.0
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "@pythnetwork/pyth-sdk-solidity/PythStructs.sol";

/**
 * Aurora oracle Stores external price data
 */
contract AuroraOracleTest is Ownable {
    mapping(bytes32 => PythStructs.Price) public priceMap;
    mapping(string => bool) public isUsdStableToken;
    uint public priceValidTimeRange;

    constructor(
        address initialOwner,
        uint _priceValidTimeRange
    ) Ownable(initialOwner) {
        priceValidTimeRange = _priceValidTimeRange;
    }

    //function updatePrice updates the price of a token
    //The function takes the tokenId, price, expo and updateTime as input
    //The function creates a new PythStructs.Price struct with the input values and stores it in the priceMap
    function updatePrices(bytes32[] memory tokenIds, int64[] memory prices, int32[] memory expos, uint updateTime) public onlyOwner {
        require(tokenIds.length == prices.length && prices.length == expos.length, "Array lengths do not match");

        for (uint i = 0; i < tokenIds.length; i++) {
            PythStructs.Price memory newPrice = PythStructs.Price({
                price: prices[i],
                conf: 0,
                expo: expos[i],
                publishTime: updateTime
            });
            priceMap[tokenIds[i]] = newPrice;
        }
    }
    
    function addUsdStableTokens(string[] memory tokens) public onlyOwner {
        for (uint i = 0; i < tokens.length; i++) {
            isUsdStableToken[tokens[i]] = true;
        }
    }
    
    function removeUsdStableTokens(string[] memory tokens) public onlyOwner {
        for (uint i = 0; i < tokens.length; i++) {
            isUsdStableToken[tokens[i]] = false;
        }
    }       
    

    //function readPairRate reads the price of a pair of tokens
    //The function takes the tokenA and tokenB as strings and the decimals of the tokens as input
    //The function calculates the tokenId by hashing the tokenA and tokenB
    //The function checks if TokenA is a USD stable token and if it is, it reverts
    //The function checks if TokenB is a USD stable token and if it is, it calls the readTokenPrice function with TokenA as tokenId and the targetPriceDecimals of TokenB
    //If TokenB is not a USD stable token, then function getPairRate is called 
    function getPairRate(string memory tokenA, string memory tokenB, uint8 decimalsTokenB) public view returns (uint256) {
        if (isUsdStableToken[tokenA]) {
            revert("NA:TokenA StableToken");
        }
        if (isUsdStableToken[tokenB]) {
            return readTokenPrice(keccak256(abi.encodePacked(tokenA)), decimalsTokenB);
        }
        return getNonUSDPairRate(keccak256(abi.encodePacked(tokenA)), keccak256(abi.encodePacked(tokenB)), decimalsTokenB);
    }

    function readTokenPrice(bytes32 tokenId, uint8 targetPriceDecimals) internal view returns (uint256) {
        PythStructs.Price memory price = priceMap[tokenId];
        isPriceValid(price.publishTime);
        return convertPriceToUint(price, targetPriceDecimals);
    }

    // Set the price valid time range
    function setPriceValidTimeRange(uint _priceValidTimeRange) public onlyOwner {
        require(_priceValidTimeRange > 0, "Invalid priceValidTimeRange");
        priceValidTimeRange = _priceValidTimeRange;
    }

    function isPriceValid(uint publishTime) public view {
        require(block.timestamp <= (publishTime + priceValidTimeRange), "Price is outdated");
    }

    // function getPairRate input are bytes32 of TokenA and TokenB and targetPriceDecimalsB
    // The function returns the rate of tokenA to tokenB
    // the function calculate the price by reading PythStructs.Price.price and PythStructs.Price.expo of Token A and Token B
    // The function returns the price of TokenA to TokenB with multiply with targetPriceDecimalsB
    function getNonUSDPairRate(bytes32 tokenA, bytes32 tokenB, uint8 targetPriceDecimalsB) public view returns (uint256) {
        PythStructs.Price memory priceA = priceMap[tokenA];
        PythStructs.Price memory priceB = priceMap[tokenB];
        isPriceValid(priceA.publishTime);
        isPriceValid(priceB.publishTime);
        return (convertPriceToUint(priceA, 9) * 10**targetPriceDecimalsB) / convertPriceToUint(priceB, 9);
    }
    
    function convertPriceToUint(
        PythStructs.Price memory price,
        uint8 targetDecimals
    ) public pure returns (uint256) {
        if (price.price < 0 || price.expo > 0 || price.expo < -255) {
            revert("Invalid price");
        }

        uint8 priceDecimals = uint8(uint32(-1 * price.expo));

        if (targetDecimals >= priceDecimals) {
            return
                uint(uint64(price.price)) *
                10 ** uint32(targetDecimals - priceDecimals);
        } else {
            return
                uint(uint64(price.price)) /
                10 ** uint32(priceDecimals - targetDecimals);
        }
    }
}
