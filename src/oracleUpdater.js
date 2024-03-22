// oracleUpdater.js
const fs = require('fs');
require('dotenv').config();
// import fetch from 'node-fetch';
const ethers = require('ethers');
const path = require('path');
const fetch = require('cross-fetch'); 

// CoinMarketCap API details
const coinMarketCapApiKey = process.env.COINMARKETCAP_API_KEY;
const coinMarketCapApiUrl = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';

// Admin private key
const privateKey = process.env.AURORA_PRIVATE_KEY;

// Load tokens configuration file
const tokensConfigFile = path.join(__dirname, '../config/tokensConfig.json');
const tokensConfig = JSON.parse(fs.readFileSync(tokensConfigFile, 'utf8'));

// Load oracle contracts configuration file
const oracleConfigFile = path.join(__dirname, '../config/oraclesConfig.json');
const oracleConfig = JSON.parse(fs.readFileSync(oracleConfigFile, 'utf8'));

// Define the path to your ABI file (adjust the path as necessary)
const abiPath = path.join(__dirname, '../abi/oracleContractABI.json');
// Load the ABI content
const oracleContractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));

async function fetchTokenPrice(pair) {
    const url = new URL(coinMarketCapApiUrl);
    const [base, quote] = pair.split('-');
    url.searchParams.set('symbol', base);
    url.searchParams.set('convert', quote);

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'X-CMC_PRO_API_KEY': coinMarketCapApiKey,
            'Accept': 'application/json'
        }
    });

    const data = await response.json();
    if (!data.data[base] || !data.data[base].quote[quote]) {
        throw new Error(`Pair not found on CoinMarketCap: ${pair}`);
    }
    return data.data[base].quote[quote].price;
}

async function calculateUsdRate(base, quote, quoteUsdPrice) {
    const baseQuotePrice = await fetchTokenPrice(`${base}-${quote}`);
    return baseQuotePrice * quoteUsdPrice;
}


async function healthCheck() {
    const allPairs = tokensConfig.pairs;
    const usdPairs = allPairs.filter(pair => pair.endsWith('-USD')).map(pair => pair.split('-')[0]);

    // Check if all pairs exist on CoinMarketCap
    for (let pair of allPairs) {
        try {
            await fetchTokenPrice(pair);
            console.log(`Health check passed for pair: ${pair}`);
        } catch (error) {
            console.error(`Health check failed for pair: ${pair}`, error);
            throw error; // Stop execution if any pair check fails
        }
    }

    // Check for corresponding USD pairs for each base in non-USD pairs
    for (let pair of allPairs) {
        const [base, quote] = pair.split('-');
        if (!pair.endsWith('-USD') && !usdPairs.includes(quote)) {
            throw new Error(`Missing corresponding USD pair for ${quote} in pair ${pair}: ${quote}-USD not found`);
        }
    }
}

async function updatePrices() {
    const updateTime = Math.floor(Date.now() / 1000); // Current time in Unix time
    const tokenIds = [];
    const usdPrices = [];
    const expos = [];

    // Cache for USD prices
    const usdPriceCache = {};

    for (let pair of tokensConfig.pairs) {
        const [base, quote] = pair.split('-');
        try {
            let usdPrice;
            if (quote === 'USD') {
                usdPrice = await fetchTokenPrice(pair);
                usdPriceCache[base] = usdPrice; // Cache the USD price
            } else if (usdPriceCache[quote]) {
                // Calculate the USD rate for non-USD pair
                usdPrice = await calculateUsdRate(base, quote, usdPriceCache[quote]);
            } else {
                console.warn(`USD price for ${quote} not found. Skipping ${pair}.`);
                continue;
            }

            console.log(`Fetched USD price for ${pair}: ${usdPrice}`);
            const { price, expo } = convertPriceToInteger(usdPrice);
            const tokenId = ethers.id(`${base}-USD`); // Use base-USD as the token ID
            console.log(`Token ID for ${base}-USD: ${tokenId}`);
            tokenIds.push(tokenId);
            usdPrices.push(price);
            expos.push(expo);
        } catch (error) {
            console.error(`Error fetching or converting price for pair: ${pair}`, error);
            // Consider whether to throw an error or continue with the next pair
        }
    }

    console.log('Prices fetched and converted successfully');
    for (let contractDetails of oracleConfig) {
        await updateContractPrices(tokenIds, usdPrices, expos, updateTime, contractDetails);
    }
}

async function updateContractPrices(tokenIds, usdPrices, expos, updateTime, contractDetails) {
    const provider = new ethers.JsonRpcProvider(contractDetails.rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    const oracleContract = new ethers.Contract(contractDetails.address, oracleContractABI, signer);
    console.log(`tokenIds: ${tokenIds}`);
    console.log(`usdPrices: ${usdPrices}`);
    console.log(`expos: ${expos}`);
    console.log(`updateTime: ${updateTime}`);

    try {
    const tx = await oracleContract.updatePrices(tokenIds, usdPrices, expos, updateTime);

    // Wait for the transaction to be mined or timeout after a specified period
    const receipt = await Promise.race([
        tx.wait(),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('Transaction timeout')), 60000)) // 60 seconds timeout
    ]);

    console.log(`Transaction confirmed in block ${receipt.blockNumber}`);
} catch (error) {
    console.error(`Transaction failed or timed out: ${error}`);
}

    
    // const tx = await oracleContract.updatePrices(tokenIds, usdPrices, expos, updateTime);
    // console.log(`Transaction data: ${tx}`);
    // const hash = tx.hash;
    // console.log(`Transaction hash: ${hash}`);
    console.log(`Prices updated on contract ${contractDetails.address} at time ${updateTime}`);
}

function convertPriceToInteger(floatPrice) {
    let expo;
    let price;

    if (floatPrice < 10) {
        expo = -8;
        price = Math.round(floatPrice * Math.pow(10, -expo));
    } else if (floatPrice >= 10 && floatPrice < 10000) {
        expo = -5;
        price = Math.round(floatPrice * Math.pow(10, -expo));
    } else {
        expo = -3;
        price = Math.round(floatPrice * Math.pow(10, -expo));
    }

    return { price, expo };
}


module.exports = { updatePrices, healthCheck };










// const fs = require('fs');
// require('dotenv').config();
// // const fetch = require('node-fetch');
// const ethers = require('ethers');
// const path = require('path');

// let fetch;

// (async () => {
//   fetch = (await import('node-fetch')).default;
// })();

// // CoinMarketCap API details
// const coinMarketCapApiKey = process.env.COINMARKETCAP_API_KEY;
// const coinMarketCapApiUrl = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';

// // Admin private key
// const privateKey = process.env.AURORA_PRIVATE_KEY;

// // Load tokens configuration file
// const tokensConfigFile = path.join(__dirname, '../config/tokensConfig.json');
// const tokensConfig = JSON.parse(fs.readFileSync(tokensConfigFile, 'utf8'));

// // Load oracle contracts configuration file
// const oracleConfigFile = path.join(__dirname, '../config/oraclesConfig.json');
// const oracleConfig = JSON.parse(fs.readFileSync(oracleConfigFile));


// // Common ABI for all oracle contracts
// // Load the ABI for the oracle contract
// // const abiPath = path.join(__dirname, '../abi/AuroraOracle.json');
// // const oracleContractABI = JSON.parse(fs.readFileSync(abiPath, 'utf8')).abi;

// async function fetchTokenPrice(symbol) {
//     const url = new URL(coinMarketCapApiUrl);
//     url.searchParams.set('symbol', symbol);
//     url.searchParams.set('convert', 'USD');

//     const response = await fetch(url, {
//         method: 'GET',
//         headers: {
//             'X-CMC_PRO_API_KEY': coinMarketCapApiKey,
//             'Accept': 'application/json'
//         }
//     });

//     const data = await response.json();
//     return data.data[symbol].quote.USD.price;
// }



// async function updatePrices() {
//     const updateTime = Math.floor(Date.now() / 1000); // Current time in Unix time
//     const tokenIds = [];
//     const prices = [];
//     const expos = [];

//     for (let symbol of tokensConfig.symbols) {
//         const priceData = await fetchTokenPrice(symbol);
//         console.log(`Fetched price for ${symbol}: ${priceData}`);
//         const { price, expo } = convertPriceToInteger(priceData);
//         console.log(`Converted price for ${symbol}: ${price}e${expo}`);
//         // const symbolBytes = ethers.utils.toUtf8Bytes(symbol);
//         // console.log(`Symbol bytes for ${symbol}: ${symbolBytes}`);
//         // // Calculate the keccak256 hash of the byte array
//         // const tokenId = ethers.utils.keccak256(symbolBytes);
//         // console.log(`Token ID for ${symbol}: ${tokenId}`);
//         const tokenId = ethers.id(symbol); // Calculate the keccak256 hash of the symbol
//         console.log(`Token ID for ${symbol}: ${tokenId}`);
//         tokenIds.push(tokenId);
//         prices.push(price);
//         expos.push(expo);
//     }

//     // for (let contractDetails of oracleConfig) {
//     //     await updateContractPrices(tokenIds, prices, expos, updateTime, contractDetails);
//     // }
// }


// module.exports = { updatePrices };
