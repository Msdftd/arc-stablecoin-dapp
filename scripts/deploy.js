const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");

  // ── USDC address on Arc Testnet (replace with actual address) ──
  const USDC_ADDRESS =
    process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";

  console.log("Using USDC at:", USDC_ADDRESS);

  // ── Deploy ──
  const ArcVault = await hre.ethers.getContractFactory("ArcVault");
  const vault = await ArcVault.deploy(USDC_ADDRESS);
  await vault.waitForDeployment();

  const vaultAddress = await vault.getAddress();
  console.log("✅ ArcVault deployed to:", vaultAddress);

  // ── Write deployment info for the frontend ──
  const artifact = await hre.artifacts.readArtifact("ArcVault");

  const deploymentInfo = {
    address: vaultAddress,
    abi: artifact.abi,
    network: hre.network.name,
    usdc: USDC_ADDRESS,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };

  const outDir = path.join(__dirname, "..", "frontend", "src");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "deployment.json"),
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("📄 Deployment info written to frontend/src/deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
