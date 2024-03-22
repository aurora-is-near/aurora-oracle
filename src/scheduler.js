// scheduler.js
const cron = require('node-cron');
const fs = require('fs');
const { updatePrices, healthCheck } = require('./oracleUpdater'); // Import healthCheck here
const path = require('path');
const fetch = require('cross-fetch'); 

// Load cron configuration file
const cronConfigFile = path.join(__dirname, '../config/cronConfig.json');
const cronConfig = JSON.parse(fs.readFileSync(cronConfigFile));

async function startScheduler() {
    try {
        // Call healthCheck at startup
        await healthCheck();
        console.log('Health check passed. Starting scheduled tasks.');

        // Schedule tasks to be run on the server based on the cron configuration
        cron.schedule(cronConfig.schedule, function() {
            console.log('Running the price update task');
            updatePrices().then(() => console.log('Price update task completed'));
        });
    } catch (error) {
        console.error('Health check failed. Scheduled tasks will not start.', error);
    }
}

startScheduler(); // Start the scheduler with health check
