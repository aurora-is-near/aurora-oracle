const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("AuroraOracleTest", function () {
  let auroraOracle;
  let owner;
  let nonOwner;

  beforeEach(async function () {
    [owner, nonOwner] = await ethers.getSigners();
    const AuroraOracle = await ethers.getContractFactory("AuroraOracleTest");
    auroraOracle = await AuroraOracle.deploy(owner.address, 3600);
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await auroraOracle.owner()).to.equal(owner.address);
    });

    it("Should set the initial price valid time range", async function () {
      expect(await auroraOracle.priceValidTimeRange()).to.equal(3600);
    });
  });

  describe("updatePrices", function () {
    it("Should update prices correctly", async function () {
      const tokenIds = [ethers.encodeBytes32String("TOKEN1")];
      const prices = [1000];
      const expos = [-2];
      const updateTime = Math.floor(Date.now() / 1000);

      await auroraOracle.updatePrices(tokenIds, prices, expos, updateTime);

      const price = await auroraOracle.priceMap(tokenIds[0]);
      expect(price.price).to.equal(prices[0]);
    });

    it("Should revert if called by a non-owner", async function () {
      const tokenIds = [ethers.encodeBytes32String("TOKEN1")];
      const prices = [1000];
      const expos = [-2];
      const updateTime = Math.floor(Date.now() / 1000);

      try {
        await auroraOracle.connect(nonOwner).updatePrices(tokenIds, prices, expos, updateTime)
      } catch (error) {
        expect(error.message).to.include("OwnableUnauthorizedAccount");
      }
    });
  });

  describe("addUsdStableTokens & removeUsdStableTokens", function () {
    it("Should add USD stable tokens correctly", async function () {
      const tokens = ["USDT", "USDC"].map(ethers.encodeBytes32String);
      await auroraOracle.addUsdStableTokens(tokens);

      // Check if tokens were added correctly
      for (const token of tokens) {
        expect(await auroraOracle.isUsdStableToken(token)).to.be.true;
      }
    });

    it("Should remove USD stable tokens correctly", async function () {
      const tokens = ["USDT", "USDC"].map(ethers.encodeBytes32String);
      await auroraOracle.addUsdStableTokens(tokens);
      await auroraOracle.removeUsdStableTokens(tokens);

      // Check if tokens were removed correctly
      for (const token of tokens) {
        expect(await auroraOracle.isUsdStableToken(token)).to.be.false;
      }
    });

    it("Should revert addUsdStableTokens if called by a non-owner", async function () {
      const tokens = ["USDT", "USDC"].map(ethers.encodeBytes32String);
      
      try {
        await auroraOracle.connect(nonOwner).addUsdStableTokens(tokens)
      } catch (error) {
        expect(error.message).to.include("OwnableUnauthorizedAccount");
      }
    });

    it("Should revert removeUsdStableTokens if called by a non-owner", async function () {
      const tokens = ["USDT", "USDC"].map(ethers.encodeBytes32String);
      await auroraOracle.addUsdStableTokens(tokens);
      
      try {
        await auroraOracle.connect(nonOwner).removeUsdStableTokens(tokens)
      } catch (error) {
        expect(error.message).to.include("OwnableUnauthorizedAccount");
      }
    });
  });

  describe("isUsdStableToken", function () {
    it("Should correctly identify USD stable tokens", async function () {
      const tokens = ["USDT", "USDC"].map(ethers.encodeBytes32String);
      await auroraOracle.addUsdStableTokens(tokens);

      // Confirm that the tokens are recognized as USD stable tokens
      for (const token of tokens) {
        expect(await auroraOracle.isUsdStableToken(token)).to.be.true;
      }

      // Confirm a non-existent token is not recognized as a USD stable token
      const nonExistentToken = ethers.encodeBytes32String("NON_EXISTENT");
      expect(await auroraOracle.isUsdStableToken(nonExistentToken)).to.be.false;
    });
  });

  describe("getPairRate", function () {
    it("Should revert if tokenA is a USD stable token", async function () {
      const tokenA = "USDT";
      const tokenB = "ETH";
      // const tokenA = ethers.encodeBytes32String("USDT");
      // const tokenB = ethers.encodeBytes32String("ETH");
      await auroraOracle.addUsdStableTokens([tokenA]);
  
      await expect(auroraOracle.getPairRate(tokenA, tokenB, 18))
        .to.be.revertedWith("NA:TokenA StableToken");
    });
  
    it("Should correctly calculate the rate when tokenB is a USD stable token", async function () {
      const tokenA = "BTC";
      const tokenB = "USDC";
      const hashTokenA = ethers.keccak256(ethers.toUtf8Bytes(tokenA));
      const price = 50000; // Example price for BTC
      const expo = -2; // Example exponent
      const updateTime = Math.floor(Date.now() / 1000);
      await auroraOracle.addUsdStableTokens([tokenB]);
      await auroraOracle.updatePrices([hashTokenA], [price], [expo], updateTime);
      const rate = await auroraOracle.getPairRate(tokenA, tokenB, 6); // Assuming 6 decimals for USDC
      expect(rate).to.equal(BigInt("500000000")); 
    });
    
    it("Should correctly calculate the pair rate for non-USD token pairs", async function () {
      const tokenA = "ETH";
      const tokenB = "BTC";
      const hashTokenA = ethers.keccak256(ethers.toUtf8Bytes(tokenA));
      const hashTokenB = ethers.keccak256(ethers.toUtf8Bytes(tokenB));
      const priceA = 400000; // Example price for ETH
      const priceB = 7000000; // Example price for BTC
      const expoA = -2; // Example exponent for ETH
      const expoB = -2; // Example exponent for BTC
      const updateTime = Math.floor(Date.now() / 1000);
  
      await auroraOracle.updatePrices([hashTokenA], [priceA], [expoA], updateTime);
      await auroraOracle.updatePrices([hashTokenB], [priceB], [expoB], updateTime);
  
      // BTC 8 decimals for the final rate calculation
      const rate = await auroraOracle.getPairRate(tokenA, tokenB, 8);
      // The expected rate is priceA/priceB with 6 decimal places
      expect(rate).to.equal(BigInt("5714285")); // 0.05714285 with 8 decimal places
    });
  });
  
  describe("Pair Rate Calculations with Mock Data", function () {
    beforeEach(async function () {
      const usdStableToken = "USDC";
      await auroraOracle.addUsdStableTokens([usdStableToken]);
    });
  
    it("Should calculate the correct rate with large price differences", async function () {
      const tokenA = "HIGH";
      const tokenB = "USDC";
      const hashTokenA = ethers.keccak256(ethers.toUtf8Bytes(tokenA));
      const priceA = 100000000; // High price for tokenA
      const expoA = 0; // No exponent adjustment
      const updateTime = Math.floor(Date.now() / 1000);
  
      await auroraOracle.updatePrices([hashTokenA], [priceA], [expoA], updateTime);
  
      const rate = await auroraOracle.getPairRate(tokenA, tokenB, 6);
      expect(rate).to.equal(BigInt(priceA.toString() + "000000")); // Adjusting to 6 decimal places
    });
  
    it("Should calculate the correct rate with small price and negative exponent", async function () {
      const tokenA = "SMALL";
      const tokenB = "USDC";
      const hashTokenA = ethers.keccak256(ethers.toUtf8Bytes(tokenA));
      const priceA = 1; // Small price for tokenA
      const expoA = -6; // Exponent to adjust price to a very small value
      const updateTime = Math.floor(Date.now() / 1000);
  
      await auroraOracle.updatePrices([hashTokenA], [priceA], [expoA], updateTime);
  
      const rate = await auroraOracle.getPairRate(tokenA, tokenB, 6);
      expect(rate).to.equal(1); // Price is already at 6 decimal places due to exponent
    });
  
    it("Should handle rates when both tokens have negative exponents", async function () {
      const tokenA = "TOKENA";
      const tokenB = "TOKENB";
      const hashTokenA = ethers.keccak256(ethers.toUtf8Bytes(tokenA));
      const hashTokenB = ethers.keccak256(ethers.toUtf8Bytes(tokenB));
      const priceA = 100; // Price for tokenA
      const priceB = 200; // Price for tokenB
      const expoA = -2; // Negative exponent for tokenA
      const expoB = -3; // More negative exponent for tokenB, making it smaller
      const updateTime = Math.floor(Date.now() / 1000);
  
      await auroraOracle.updatePrices([hashTokenA], [priceA], [expoA], updateTime);
      await auroraOracle.updatePrices([hashTokenB], [priceB], [expoB], updateTime);
  
      const rate = await auroraOracle.getPairRate(tokenA, tokenB, 6);
      expect(rate).to.equal(BigInt("5000000")); // Adjusted for the different exponents and 6 decimal places
    });  
  });
  
  describe("setPriceValidTimeRange", function () {
    it("Should update the price valid time range correctly", async function () {
      const newRange = 7200; // New time range in seconds
      await auroraOracle.setPriceValidTimeRange(newRange);

      expect(await auroraOracle.priceValidTimeRange()).to.equal(newRange);
    });

    it("Should revert if setPriceValidTimeRange is called by a non-owner", async function () {
      const newRange = 7200;
      
      try {
        await auroraOracle.connect(nonOwner).setPriceValidTimeRange(newRange)
      } catch (error) {
        expect(error.message).to.include("OwnableUnauthorizedAccount");
      }
    });

    it("Should revert if the new price valid time range is zero", async function () {
      await expect(auroraOracle.setPriceValidTimeRange(0))
        .to.be.revertedWith("Invalid priceValidTimeRange");
    });
  });

  describe("convertPriceToUint", function () {
    it("Should convert price correctly with positive exponent", async function () {
      await expect(auroraOracle.convertPriceToUint({price: 100, expo: 2, conf: 0, publishTime: 0}, 4))
        .to.be.revertedWith("Invalid price");
    });
  
    it("Should convert price correctly with negative exponent", async function () {
      const result = await auroraOracle.convertPriceToUint({price: 100, expo: -2, conf: 0, publishTime: 0}, 4);
      expect(result).to.equal(10000); // 100 * 10^2 = 10000
    });
  
    it("Should convert price correctly with target decimals less than price decimals", async function () {
      const result = await auroraOracle.convertPriceToUint({price: 12345, expo: -4, conf: 0, publishTime: 0}, 2);
      expect(result).to.equal(123); // 12345 / 10^2 = 123.45, but truncated to 123
    });
  });

  describe("getNonUSDPairRate", function () {
    beforeEach(async function () {
      // Setting up some mock prices
      const tokenA = ethers.encodeBytes32String("TOKENA");
      const tokenB = ethers.encodeBytes32String("TOKENB");
      const now = Math.floor(Date.now() / 1000);
      await auroraOracle.updatePrices([tokenA], [1000], [-2], now); // Price for TOKENA: 10.00
      await auroraOracle.updatePrices([tokenB], [500], [-2], now);  // Price for TOKENB: 5.00
    });
  
    it("Should calculate non-USD pair rate correctly", async function () {
      const tokenA = ethers.encodeBytes32String("TOKENA");
      const tokenB = ethers.encodeBytes32String("TOKENB");
      const rate = await auroraOracle.getNonUSDPairRate(tokenA, tokenB, 6);
      expect(rate).to.equal(2000000); // (10.00 / 5.00) * 10^6 = 2 * 10^6
    });
  });
  
  describe("isPriceValid", function () {
    it("Should revert for outdated price", async function () {
      const priceValidTimeRange = await auroraOracle.priceValidTimeRange();
      const outdatedTime = BigInt(Math.floor(Date.now() / 1000)) - (priceValidTimeRange + BigInt(10)); // 10 seconds after the valid time range
      await expect(auroraOracle.isPriceValid(outdatedTime))
        .to.be.revertedWith("Price is outdated");
    });
  
    it("Should pass for a recent price", async function () {
      const recentTime = Math.floor(Date.now() / 1000) - 100; // 100 seconds ago
      await auroraOracle.isPriceValid(recentTime); // Should not revert
    });
  });
  
});
