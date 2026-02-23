import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Contract, formatUnits, parseUnits, getAddress, isAddress } from "ethers";
import deployment from "./deployment.json";

/* ─── Arc Testnet Config ──────────────────────────────── */
const ARC_TESTNET = {
  chainId: "0x4CEF52", // 5042002 decimal
  chainName: "Arc Network Testnet",
  rpcUrls: ["https://rpc.testnet.arc.network"],
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  blockExplorerUrls: ["https://testnet.arcscan.app"],
};

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

const VAULT_ABI = deployment.abi;
const USDC_ADDRESS = deployment.usdc;
const SAVED_VAULT_KEY = "arcvault_address";

/* ─── Helpers ─────────────────────────────────────────── */
function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}···${a.slice(-4)}` : "";
}
function fmtUsdc(raw, dec = 18) {
  const val = Number(formatUnits(raw, dec));
  return val.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/* ─── Component ───────────────────────────────────────── */
export default function App() {
  // Wallet
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);

  // Balances
  const [usdcBalance, setUsdcBalance] = useState("0");
  const [vaultBalance, setVaultBalance] = useState("0");
  const [allowance, setAllowance] = useState("0");
  const [decimals, setDecimals] = useState(18);

  // Form
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");

  // UI state
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("deposit");

  // Vault address (dynamic — user pastes after Remix deploy)
  const [vaultAddress, setVaultAddress] = useState(() => {
    try {
      const saved = localStorage.getItem(SAVED_VAULT_KEY);
      if (saved && isAddress(saved)) return getAddress(saved);
    } catch {}
    const def = deployment.address;
    return def.includes("YOUR") ? "" : def;
  });
  const [vaultInput, setVaultInput] = useState("");
  const [showConfig, setShowConfig] = useState(false);
  const vaultDeployed = !!vaultAddress && isAddress(vaultAddress);

  /* ─── Connect Wallet ───────────────────────────────── */
  const connectWallet = useCallback(async () => {
    try {
      setError("");
      if (!window.ethereum) throw new Error("Install MetaMask to continue.");

      const bp = new BrowserProvider(window.ethereum);
      await bp.send("eth_requestAccounts", []);
      const s = await bp.getSigner();
      const addr = await s.getAddress();
      const { chainId: cid } = await bp.getNetwork();

      const targetChainId = parseInt(ARC_TESTNET.chainId, 16);
      const onCorrectNetwork = Number(cid) === targetChainId;

      setProvider(bp);
      setSigner(s);
      setAccount(addr);
      setChainId(Number(cid));
      setIsCorrectNetwork(onCorrectNetwork);

      // Auto-switch to Arc Testnet if not already on it
      if (!onCorrectNetwork) {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: ARC_TESTNET.chainId }],
          });
        } catch (switchErr) {
          if (switchErr.code === 4902 || switchErr.code === -32603) {
            try {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [ARC_TESTNET],
              });
            } catch (addErr) {
              setError("Could not add Arc Testnet. Please add it manually in MetaMask.");
            }
          }
        }
      }
    } catch (e) {
      setError(e.message || "Connection failed");
    }
  }, []);

  /* ─── Switch Network ───────────────────────────────── */
  const switchToArc = useCallback(async () => {
    try {
      setError("");
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: ARC_TESTNET.chainId }],
      });
    } catch (switchErr) {
      // 4902 = chain not added yet, -32603 = some wallets use this instead
      if (switchErr.code === 4902 || switchErr.code === -32603) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [ARC_TESTNET],
          });
        } catch (addErr) {
          setError("Could not add Arc Testnet. Please add it manually in MetaMask.");
        }
      } else if (switchErr.code === 4001) {
        setError("Network switch rejected. Please switch to Arc Testnet manually.");
      } else {
        setError(switchErr.message || "Failed to switch network");
      }
    }
  }, []);

  /* ─── Refresh Balances ─────────────────────────────── */
  const refreshBalances = useCallback(async () => {
    if (!signer || !isCorrectNetwork) return;
    try {
      const addr = await signer.getAddress();

      // USDC is the native currency on Arc — read via provider.getBalance
      const nativeBal = await signer.provider.getBalance(addr);
      setUsdcBalance(nativeBal.toString());
      setDecimals(18); // native balance uses 18 decimals on-chain

      // Vault balance (only if contract is deployed)
      if (vaultDeployed) {
        try {
          const vault = new Contract(vaultAddress, VAULT_ABI, signer);
          const vBal = await vault.balanceOf(addr);
          setVaultBalance(vBal.toString());
        } catch {
          setVaultBalance("0");
        }
      }

      // Allowance from USDC precompile (for approve flow)
      if (vaultDeployed) {
        try {
          const usdc = new Contract(USDC_ADDRESS, USDC_ABI, signer);
          const allow = await usdc.allowance(addr, vaultAddress);
          setAllowance(allow.toString());
        } catch {
          setAllowance("0");
        }
      }
    } catch (e) {
      console.error("Balance refresh failed:", e);
    }
  }, [signer, isCorrectNetwork, vaultAddress, vaultDeployed]);

  /* ─── Lifecycle ────────────────────────────────────── */
  useEffect(() => {
    refreshBalances();
    const id = setInterval(refreshBalances, 12000);
    return () => clearInterval(id);
  }, [refreshBalances]);

  useEffect(() => {
    if (!window.ethereum) return;
    const handleChain = () => {
      // Re-init provider + signer on any chain change
      connectWallet();
    };
    const handleAccounts = (accs) => {
      if (accs.length === 0) {
        setAccount("");
        setSigner(null);
      } else {
        connectWallet();
      }
    };
    window.ethereum.on("chainChanged", handleChain);
    window.ethereum.on("accountsChanged", handleAccounts);
    return () => {
      window.ethereum.removeListener("chainChanged", handleChain);
      window.ethereum.removeListener("accountsChanged", handleAccounts);
    };
  }, [connectWallet]);

  /* ─── Transaction Wrapper ──────────────────────────── */
  const executeTx = async (label, fn) => {
    try {
      setError("");
      setTxHash("");
      setLoading(label);
      const tx = await fn();
      setTxHash(tx.hash);
      await tx.wait();
      await refreshBalances();
      setAmount("");
      setRecipient("");
    } catch (e) {
      const msg =
        e?.reason || e?.info?.error?.message || e?.message || "Transaction failed";
      setError(msg);
    } finally {
      setLoading("");
    }
  };

  /* ─── Actions ──────────────────────────────────────── */
  const handleApprove = () => {
    if (!vaultDeployed) return setError("Vault contract not deployed yet.");
    const parsed = parseUnits(amount || "0", decimals);
    executeTx("Approving…", () => {
      const usdc = new Contract(getAddress(USDC_ADDRESS), USDC_ABI, signer);
      return usdc.approve(getAddress(vaultAddress), parsed);
    });
  };

  const handleDeposit = () => {
    if (!vaultDeployed) return setError("Vault contract not deployed yet.");
    const parsed = parseUnits(amount || "0", decimals);
    executeTx("Depositing…", () => {
      const vault = new Contract(getAddress(vaultAddress), VAULT_ABI, signer);
      return vault.deposit(parsed);
    });
  };

  const handleWithdraw = () => {
    if (!vaultDeployed) return setError("Vault contract not deployed yet.");
    const parsed = parseUnits(amount || "0", decimals);
    executeTx("Withdrawing…", () => {
      const vault = new Contract(getAddress(vaultAddress), VAULT_ABI, signer);
      return vault.withdraw(parsed);
    });
  };

  const handleTransfer = () => {
    if (!recipient || !isAddress(recipient)) {
      return setError("Enter a valid recipient address.");
    }
    const parsed = parseUnits(amount || "0", decimals);
    const checkedTo = getAddress(recipient); // validates + bypasses ENS

    if (vaultDeployed) {
      // Transfer through vault contract
      executeTx("Transferring…", () => {
        const vault = new Contract(getAddress(vaultAddress), VAULT_ABI, signer);
        return vault.transfer(checkedTo, parsed);
      });
    } else {
      // Direct native USDC transfer (no vault needed)
      executeTx("Sending USDC…", () => {
        return signer.sendTransaction({ to: checkedTo, value: parsed });
      });
    }
  };

  /* ─── Derived State ────────────────────────────────── */
  const needsApproval =
    tab === "deposit" &&
    amount &&
    BigInt(allowance) < parseUnits(amount || "0", decimals);

  /* ─── Render ───────────────────────────────────────── */
  return (
    <>
      <style>{`
        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

        :root {
          --bg:        #0b0e11;
          --surface:   #131820;
          --surface-2: #1a2230;
          --border:    #1e293b;
          --text:      #e2e8f0;
          --text-dim:  #64748b;
          --accent:    #22d3ee;
          --accent-2:  #06b6d4;
          --green:     #34d399;
          --red:       #f87171;
          --orange:    #fbbf24;
          --radius:    12px;
          --font-mono: 'JetBrains Mono', monospace;
          --font-sans: 'DM Sans', system-ui, sans-serif;
        }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-sans);
          min-height: 100vh;
          overflow-x: hidden;
        }

        /* ── Ambient Glow ── */
        body::before {
          content: '';
          position: fixed;
          top: -40%; left: -20%;
          width: 80%; height: 80%;
          background: radial-gradient(ellipse, rgba(34,211,238,.07) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }
        body::after {
          content: '';
          position: fixed;
          bottom: -30%; right: -10%;
          width: 60%; height: 60%;
          background: radial-gradient(ellipse, rgba(6,182,212,.05) 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }

        .shell {
          position: relative; z-index: 1;
          max-width: 520px;
          margin: 0 auto;
          padding: 32px 20px 64px;
        }

        /* ── Header ── */
        .header {
          text-align: center;
          margin-bottom: 32px;
        }
        .logo {
          font-family: var(--font-mono);
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(135deg, var(--accent), #818cf8);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          letter-spacing: -0.5px;
        }
        .logo span { opacity: .5; font-weight: 400; }
        .subtitle {
          color: var(--text-dim);
          font-size: 13px;
          margin-top: 4px;
          font-family: var(--font-mono);
        }

        /* ── Card ── */
        .card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 24px;
          margin-bottom: 16px;
          transition: border-color .2s;
        }
        .card:hover { border-color: #2a3a50; }

        .card-label {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          color: var(--text-dim);
          margin-bottom: 12px;
        }

        /* ── Wallet Row ── */
        .wallet-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .wallet-addr {
          font-family: var(--font-mono);
          font-size: 15px;
          font-weight: 500;
        }
        .network-badge {
          font-family: var(--font-mono);
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 999px;
          font-weight: 600;
        }
        .net-ok   { background: rgba(52,211,153,.12); color: var(--green); }
        .net-bad  { background: rgba(248,113,113,.12); color: var(--red);   }

        /* ── Balance Grid ── */
        .bal-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .bal-box {
          background: var(--surface-2);
          border-radius: 10px;
          padding: 16px;
        }
        .bal-title {
          font-size: 11px;
          color: var(--text-dim);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: .8px;
          margin-bottom: 6px;
        }
        .bal-value {
          font-family: var(--font-mono);
          font-size: 20px;
          font-weight: 700;
        }
        .bal-unit {
          font-size: 12px;
          color: var(--text-dim);
          font-weight: 500;
          margin-left: 4px;
        }

        /* ── Tabs ── */
        .tabs {
          display: flex;
          gap: 4px;
          background: var(--surface-2);
          border-radius: 10px;
          padding: 4px;
          margin-bottom: 20px;
        }
        .tab-btn {
          flex: 1;
          background: none;
          border: none;
          color: var(--text-dim);
          font-family: var(--font-sans);
          font-size: 13px;
          font-weight: 600;
          padding: 10px 0;
          border-radius: 8px;
          cursor: pointer;
          transition: all .15s;
        }
        .tab-btn:hover { color: var(--text); }
        .tab-btn.active {
          background: var(--surface);
          color: var(--accent);
          box-shadow: 0 1px 3px rgba(0,0,0,.3);
        }

        /* ── Inputs ── */
        .input-group { margin-bottom: 12px; }
        .input-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-dim);
          margin-bottom: 6px;
        }
        .input {
          width: 100%;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 14px;
          color: var(--text);
          font-family: var(--font-mono);
          font-size: 14px;
          outline: none;
          transition: border-color .2s;
        }
        .input::placeholder { color: #374151; }
        .input:focus { border-color: var(--accent-2); }

        /* ── Buttons ── */
        .btn-row { display: flex; gap: 8px; margin-top: 16px; }

        .btn {
          flex: 1;
          padding: 14px 0;
          border: none;
          border-radius: 10px;
          font-family: var(--font-sans);
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          transition: all .15s;
          position: relative;
          overflow: hidden;
        }
        .btn:disabled {
          opacity: .4;
          cursor: not-allowed;
        }

        .btn-primary {
          background: linear-gradient(135deg, var(--accent-2), var(--accent));
          color: #0b0e11;
        }
        .btn-primary:not(:disabled):hover {
          box-shadow: 0 0 20px rgba(34,211,238,.25);
          transform: translateY(-1px);
        }

        .btn-outline {
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text);
        }
        .btn-outline:not(:disabled):hover {
          border-color: var(--accent);
          color: var(--accent);
        }

        .btn-connect {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, var(--accent-2), #818cf8);
          color: #0b0e11;
          border: none;
          border-radius: 10px;
          font-family: var(--font-sans);
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: all .2s;
        }
        .btn-connect:hover {
          box-shadow: 0 0 30px rgba(34,211,238,.2);
          transform: translateY(-1px);
        }

        .btn-switch {
          background: rgba(248,113,113,.12);
          color: var(--red);
          border: 1px solid rgba(248,113,113,.2);
          padding: 10px 16px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all .15s;
          font-family: var(--font-sans);
        }
        .btn-switch:hover { background: rgba(248,113,113,.2); }

        /* ── Status Banners ── */
        .tx-hash {
          background: rgba(52,211,153,.08);
          border: 1px solid rgba(52,211,153,.2);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 16px;
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--green);
          word-break: break-all;
        }
        .tx-hash a { color: var(--green); text-decoration: underline; }
        .tx-label { font-size: 10px; opacity: .7; display: block; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .8px; }

        .error-box {
          background: rgba(248,113,113,.08);
          border: 1px solid rgba(248,113,113,.2);
          border-radius: 10px;
          padding: 12px 14px;
          margin-bottom: 16px;
          font-size: 13px;
          color: var(--red);
          word-break: break-word;
        }

        .loading-text {
          color: var(--orange);
          font-family: var(--font-mono);
          font-size: 13px;
          text-align: center;
          padding: 8px 0;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .5; }
        }

        /* ── Notice Box ── */
        .notice-box {
          background: rgba(251,191,36,.06);
          border: 1px solid rgba(251,191,36,.18);
          border-radius: 10px;
          padding: 14px;
          margin-bottom: 16px;
          text-align: center;
        }
        .notice-box p {
          color: var(--orange);
          font-size: 13px;
          margin-bottom: 10px;
        }
        .btn-small {
          background: rgba(251,191,36,.12);
          color: var(--orange);
          border: 1px solid rgba(251,191,36,.25);
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          font-family: var(--font-sans);
          transition: all .15s;
        }
        .btn-small:hover { background: rgba(251,191,36,.2); }

        /* ── Deploy Steps ── */
        .steps { display: flex; flex-direction: column; gap: 12px; }
        .step {
          display: flex;
          gap: 12px;
          align-items: flex-start;
          padding: 10px 12px;
          background: var(--surface-2);
          border-radius: 8px;
        }
        .step-num {
          flex: 0 0 24px;
          height: 24px;
          background: linear-gradient(135deg, var(--accent-2), var(--accent));
          color: #0b0e11;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 12px;
          font-weight: 800;
          font-family: var(--font-mono);
          margin-top: 1px;
        }
        .step-title {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 3px;
        }
        .step-desc {
          display: block;
          font-size: 12px;
          color: var(--text-dim);
          line-height: 1.5;
        }
        .step-desc code {
          background: rgba(34,211,238,.08);
          color: var(--accent);
          padding: 1px 5px;
          border-radius: 4px;
          font-family: var(--font-mono);
          font-size: 11px;
        }
        .step-link {
          display: inline-block;
          color: var(--accent);
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          margin-top: 2px;
        }
        .step-link:hover { text-decoration: underline; }

        /* ── Footer ── */
        .footer {
          text-align: center;
          margin-top: 32px;
          color: var(--text-dim);
          font-size: 11px;
          font-family: var(--font-mono);
        }

        @media (max-width: 540px) {
          .shell { padding: 20px 16px 48px; }
          .bal-value { font-size: 16px; }
        }
      `}</style>

      <div className="shell">
        {/* ── Header ────────────────────────────────── */}
        <div className="header">
          <div className="logo">
            ArcVault <span>/ testnet</span>
          </div>
          <div className="subtitle">Secure USDC Vault on Arc Testnet</div>
        </div>

        {/* ── Not Connected ────────────────────────── */}
        {!account && (
          <div className="card" style={{ textAlign: "center" }}>
            <p style={{ color: "var(--text-dim)", marginBottom: 20, fontSize: 14 }}>
              Connect your wallet to get started
            </p>
            <button className="btn-connect" onClick={connectWallet}>
              Connect MetaMask
            </button>
          </div>
        )}

        {/* ── Connected ───────────────────────────── */}
        {account && (
          <>
            {/* Wallet Info */}
            <div className="card">
              <div className="card-label">Wallet</div>
              <div className="wallet-row">
                <span className="wallet-addr">{shortenAddr(account)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    className={`network-badge ${isCorrectNetwork ? "net-ok" : "net-bad"}`}
                  >
                    {isCorrectNetwork
                      ? "Arc Testnet"
                      : `Chain ${chainId}`}
                  </span>
                  {!isCorrectNetwork && (
                    <button className="btn-switch" onClick={switchToArc}>
                      Switch
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Balances */}
            {isCorrectNetwork && (
              <>
                <div className="card">
                  <div className="card-label">Balances</div>
                  <div className="bal-grid">
                    <div className="bal-box">
                      <div className="bal-title">Wallet USDC</div>
                      <div className="bal-value">
                        {fmtUsdc(usdcBalance, decimals)}
                        <span className="bal-unit">USDC</span>
                      </div>
                    </div>
                    <div className="bal-box">
                      <div className="bal-title">Vault Balance</div>
                      <div className="bal-value">
                        {vaultDeployed
                          ? <>{fmtUsdc(vaultBalance, decimals)}<span className="bal-unit">USDC</span></>
                          : <span style={{ fontSize: 13, color: "var(--text-dim)" }}>Not deployed</span>
                        }
                      </div>
                    </div>
                  </div>
                </div>

                {/* Operations Card */}
                <div className="card">
                  <div className="card-label">Operations</div>

                  <div className="tabs">
                    {["deposit", "withdraw", "transfer"].map((t) => (
                      <button
                        key={t}
                        className={`tab-btn ${tab === t ? "active" : ""}`}
                        onClick={() => {
                          setTab(t);
                          setError("");
                          setTxHash("");
                        }}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Vault not deployed notice */}
                  {!vaultDeployed && (tab === "deposit" || tab === "withdraw") && (
                    <div className="notice-box">
                      <p>Vault contract not deployed yet. Transfer tab works as direct USDC send.</p>
                      <button className="btn-small" onClick={() => setShowConfig(true)}>
                        Connect Vault
                      </button>
                    </div>
                  )}

                  {/* Status */}
                  {txHash && (
                    <div className="tx-hash">
                      <span className="tx-label">Transaction Hash</span>
                      <a
                        href={`${ARC_TESTNET.blockExplorerUrls[0]}/tx/${txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {txHash}
                      </a>
                    </div>
                  )}
                  {error && <div className="error-box">{error}</div>}
                  {loading && <div className="loading-text">{loading}</div>}

                  {/* Transfer Recipient */}
                  {tab === "transfer" && (
                    <div className="input-group">
                      <label className="input-label">Recipient Address</label>
                      <input
                        className="input"
                        placeholder="0x..."
                        value={recipient}
                        onChange={(e) => setRecipient(e.target.value)}
                      />
                    </div>
                  )}

                  {/* Amount */}
                  <div className="input-group">
                    <label className="input-label">Amount (USDC)</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </div>

                  {/* Buttons */}
                  <div className="btn-row">
                    {tab === "deposit" && needsApproval && (
                      <button
                        className="btn btn-outline"
                        disabled={!!loading || !amount || !vaultDeployed}
                        onClick={handleApprove}
                      >
                        Approve
                      </button>
                    )}
                    {tab === "deposit" && (
                      <button
                        className="btn btn-primary"
                        disabled={!!loading || !amount || needsApproval || !vaultDeployed}
                        onClick={handleDeposit}
                      >
                        Deposit
                      </button>
                    )}
                    {tab === "withdraw" && (
                      <button
                        className="btn btn-primary"
                        disabled={!!loading || !amount || !vaultDeployed}
                        onClick={handleWithdraw}
                      >
                        Withdraw
                      </button>
                    )}
                    {tab === "transfer" && (
                      <button
                        className="btn btn-primary"
                        disabled={!!loading || !amount || !recipient}
                        onClick={handleTransfer}
                      >
                        {vaultDeployed ? "Transfer" : "Send USDC"}
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Vault Config Card ─────────────── */}
                {!vaultDeployed && !showConfig && (
                  <div className="card" style={{ textAlign: "center" }}>
                    <div className="card-label">Vault Setup</div>
                    <p style={{ color: "var(--text-dim)", fontSize: 13, marginBottom: 14 }}>
                      Deploy your ArcVault contract via Remix to enable Deposit & Withdraw.
                    </p>
                    <button className="btn btn-primary" style={{ maxWidth: 220 }} onClick={() => setShowConfig(true)}>
                      Deploy & Connect Vault
                    </button>
                  </div>
                )}

                {showConfig && (
                  <div className="card">
                    <div className="card-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span>Deploy Vault via Remix</span>
                      <button onClick={() => setShowConfig(false)} style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 16 }}>✕</button>
                    </div>

                    <div className="steps">
                      <div className="step">
                        <span className="step-num">1</span>
                        <div>
                          <span className="step-title">Open Remix IDE</span>
                          <a href="https://remix.ethereum.org" target="_blank" rel="noreferrer" className="step-link">remix.ethereum.org →</a>
                        </div>
                      </div>
                      <div className="step">
                        <span className="step-num">2</span>
                        <div>
                          <span className="step-title">Create new file</span>
                          <span className="step-desc">File Explorer → "+" → name it <code>ArcVault.sol</code></span>
                        </div>
                      </div>
                      <div className="step">
                        <span className="step-num">3</span>
                        <div>
                          <span className="step-title">Paste flattened contract</span>
                          <span className="step-desc">Copy the flattened contract code and paste into the file</span>
                        </div>
                      </div>
                      <div className="step">
                        <span className="step-num">4</span>
                        <div>
                          <span className="step-title">Compile</span>
                          <span className="step-desc">Solidity Compiler tab → Select <code>0.8.20</code> → Click "Compile"</span>
                        </div>
                      </div>
                      <div className="step">
                        <span className="step-num">5</span>
                        <div>
                          <span className="step-title">Deploy</span>
                          <span className="step-desc">
                            Deploy tab → Environment: <code>Injected Provider (MetaMask)</code> →
                            Contract: <code>ArcVault</code> →
                            Constructor arg: <code style={{ color: "var(--accent)", wordBreak: "break-all" }}>0x3600000000000000000000000000000000000000</code> →
                            Click "Deploy" → Confirm in MetaMask
                          </span>
                        </div>
                      </div>
                      <div className="step">
                        <span className="step-num">6</span>
                        <div>
                          <span className="step-title">Copy contract address</span>
                          <span className="step-desc">After deploy, copy the deployed contract address from Remix and paste below</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 16 }}>
                      <label className="input-label">Vault Contract Address</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          className="input"
                          placeholder="0x... (paste from Remix)"
                          value={vaultInput}
                          onChange={(e) => setVaultInput(e.target.value)}
                        />
                        <button
                          className="btn btn-primary"
                          style={{ flex: "0 0 auto", padding: "12px 20px" }}
                          disabled={!vaultInput || !isAddress(vaultInput)}
                          onClick={() => {
                            const addr = getAddress(vaultInput);
                            setVaultAddress(addr);
                            localStorage.setItem(SAVED_VAULT_KEY, addr);
                            setVaultInput("");
                            setShowConfig(false);
                            refreshBalances();
                          }}
                        >
                          Save
                        </button>
                      </div>
                      {vaultInput && !isAddress(vaultInput) && (
                        <span style={{ color: "var(--red)", fontSize: 11, marginTop: 4, display: "block" }}>Invalid address</span>
                      )}
                    </div>

                    {vaultDeployed && (
                      <div style={{ marginTop: 12, padding: "10px 12px", background: "rgba(52,211,153,.08)", border: "1px solid rgba(52,211,153,.2)", borderRadius: 8 }}>
                        <span style={{ color: "var(--green)", fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" }}>
                          ✓ Vault: {vaultAddress}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Show connected vault address if already set */}
                {vaultDeployed && !showConfig && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center", marginTop: 4, marginBottom: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-dim)" }}>
                      Vault: {shortenAddr(vaultAddress)}
                    </span>
                    <button
                      onClick={() => setShowConfig(true)}
                      style={{ background: "none", border: "none", color: "var(--text-dim)", cursor: "pointer", fontSize: 11, textDecoration: "underline" }}
                    >
                      change
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div className="footer">
          built for Arc Testnet · {new Date().getFullYear()}
        </div>
      </div>
    </>
  );
}
