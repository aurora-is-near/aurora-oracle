const INITIAL_OWNER = process.env.INITIAL_OWNER;
const PRICE_VALID_TIME_RANGE = process.env.PRICE_VALID_TIME_RANGE;

const func = async (hre) => {
  console.log("deploying");
  const { deploy } = hre.deployments;
  const [deployer] = await hre.ethers.getSigners();
  const auroraOracle = await deploy("AuroraOracle", {
    from: deployer.address,
    args: [INITIAL_OWNER, PRICE_VALID_TIME_RANGE],
    log: true,
  });
  console.log("AuroraOracle deployed at:", auroraOracle.address);
};

module.exports = func;
