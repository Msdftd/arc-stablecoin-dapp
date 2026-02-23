# ArcVault — Testnet dApp

A secure USDC vault dApp for **Arc Testnet** with Solidity smart contracts, Hardhat deployment, and a React + ethers v6 frontend.

---

## Project Structure

```
arc-pay-dapp/
├── contracts/
│   └── ArcVault.sol            # Solidity vault contract (SafeERC20, ReentrancyGuard)
├── scripts/
│   └── deploy.js               # Hardhat deployment script
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── App.jsx             # Full React dApp (wallet, balances, all operations)
│   │   ├── main.jsx            # React entry point
│   │   └── deployment.json     # Auto-generated after deploy (ABI + address)
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
├── hardhat.config.js
├── package.json
├── .env.example
└── README.md
```

---

## 1 — Prerequisites

| Tool     | Version  |
|----------|----------|
| Node.js  | ≥ 18     |
| npm      | ≥ 9      |
| MetaMask | latest   |

---

## 2 — Smart Contract Setup

### Install dependencies

```bash
cd arc-pay-dapp
npm install
```

### Configure environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
ARC_RPC_URL=https://rpc.testnet.arc.network
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
USDC_ADDRESS=0x3600000000000000000000000000000000000000
```

> **⚠️  IMPORTANT**
> - Get testnet USDC from the Arc faucet for gas fees (Arc uses USDC as native gas).
> - **NEVER** commit your private key. The `.env` file is gitignored.

### Compile

```bash
npx hardhat compile
```

### Deploy to Arc Testnet

```bash
npx hardhat run scripts/deploy.js --network arcTestnet
```

This will:
1. Deploy `ArcVault` with the USDC address as constructor arg.
2. Write `frontend/src/deployment.json` with the contract address + ABI.

---

## 3 — Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## 4 — Usage Flow

### Connect Wallet
1. Click **Connect MetaMask**.
2. If on the wrong network, click **Switch** → MetaMask will prompt to add/switch to Arc Testnet.

### Deposit USDC
1. Select the **Deposit** tab.
2. Enter amount.
3. If allowance is insufficient, click **Approve** first → confirm in MetaMask.
4. Click **Deposit** → confirm in MetaMask.
5. Transaction hash appears; balances refresh automatically.

### Withdraw USDC
1. Select the **Withdraw** tab.
2. Enter amount (up to your vault balance).
3. Click **Withdraw** → confirm in MetaMask.

### Transfer USDC (through contract)
1. Select the **Transfer** tab.
2. Enter recipient address + amount.
3. Click **Transfer** → confirm in MetaMask.
4. USDC moves from your vault balance to the recipient via the contract.

---

## 5 — Smart Contract API

| Function | Description |
|----------|-------------|
| `deposit(uint256 amount)` | Deposit USDC into vault (requires prior approval) |
| `withdraw(uint256 amount)` | Withdraw USDC back to caller |
| `transfer(address to, uint256 amount)` | Transfer USDC through the contract |
| `balanceOf(address)` | View an account's vault balance |
| `totalVaultBalance()` | View total USDC held by the contract |

### Events

| Event | Fields |
|-------|--------|
| `Deposited` | `user`, `amount`, `timestamp` |
| `Withdrawn` | `user`, `amount`, `timestamp` |
| `Transferred` | `from`, `to`, `amount`, `timestamp` |

---

## 6 — Integration Example (ethers v6)

```javascript
import { BrowserProvider, Contract, parseUnits } from "ethers";
import deployment from "./deployment.json";

// Connect
const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Contract instances
const vault = new Contract(deployment.address, deployment.abi, signer);
const usdc  = new Contract(deployment.usdc, [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
], signer);

// Approve → Deposit → Check
const amount = parseUnits("10", 6); // 10 USDC
await (await usdc.approve(deployment.address, amount)).wait();
await (await vault.deposit(amount)).wait();
console.log("Vault balance:", await vault.balanceOf(await signer.getAddress()));
```

---

## 7 — Arc Testnet Network Details

| Field            | Value                                |
|------------------|--------------------------------------|
| Network Name     | Arc Testnet                          |
| RPC URL          | `https://rpc.testnet.arc.network`    |
| Chain ID         | `5042002` (`0x4CE352`)               |
| Currency Symbol  | USDC                                 |
| Currency Decimals| 6                                    |
| Block Explorer   | `https://testnet.arcscan.app`        |
| USDC Address     | `0x3600000000000000000000000000000000000000` |

> **Note:** The USDC address `0x360...000` is Arc's native USDC precompile. The native currency for gas on Arc Testnet is also USDC.

---

## Security Notes

- **ReentrancyGuard** on all state-changing functions.
- **SafeERC20** for all token transfers (handles non-standard return values).
- **Custom errors** instead of `require` strings (gas efficient).
- **CEI pattern** (Checks-Effects-Interactions) followed in all functions.
- No admin keys, no upgradability — minimal attack surface.

---

## License

MIT
