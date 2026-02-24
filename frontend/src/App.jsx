import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Contract, formatUnits, parseUnits, getAddress, isAddress } from "ethers";
import deployment from "./deployment.json";

/* ─── Arc Testnet Config ──────────────────────────────── */
const ARC_TESTNET = {
  chainId: "0x4CEF52",
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
const NATIVE_DEC = 18;
const ERC20_DEC = 6;

/* ─── Helpers ─────────────────────────────────────────── */
function shortenAddr(a) {
  return a ? `${a.slice(0, 6)}···${a.slice(-4)}` : "";
}
function fmtUsdc(raw, dec = 18) {
  const val = Number(formatUnits(raw, dec));
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/* ─── Component ───────────────────────────────────────── */
export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [chainId, setChainId] = useState(null);
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState("0");
  const [vaultBalance, setVaultBalance] = useState("0");
  const [allowance, setAllowance] = useState("0");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("deposit");
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

  /* ─── Wallet ─────────────────────────────────────────── */
  const connectWallet = useCallback(async () => {
    try {
      setError("");
      if (!window.ethereum) throw new Error("Install MetaMask to continue.");
      const bp = new BrowserProvider(window.ethereum);
      await bp.send("eth_requestAccounts", []);
      const s = await bp.getSigner();
      const addr = await s.getAddress();
      const { chainId: cid } = await bp.getNetwork();
      const target = parseInt(ARC_TESTNET.chainId, 16);
      const ok = Number(cid) === target;
      setProvider(bp); setSigner(s); setAccount(addr);
      setChainId(Number(cid)); setIsCorrectNetwork(ok);
      if (!ok) {
        try {
          await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_TESTNET.chainId }] });
        } catch (e) {
          if (e.code === 4902 || e.code === -32603) {
            try { await window.ethereum.request({ method: "wallet_addEthereumChain", params: [ARC_TESTNET] }); }
            catch { setError("Could not add Arc Testnet."); }
          }
        }
      }
    } catch (e) { setError(e.message || "Connection failed"); }
  }, []);

  const switchToArc = useCallback(async () => {
    try {
      setError("");
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_TESTNET.chainId }] });
    } catch (e) {
      if (e.code === 4902 || e.code === -32603) {
        try { await window.ethereum.request({ method: "wallet_addEthereumChain", params: [ARC_TESTNET] }); }
        catch { setError("Could not add Arc Testnet."); }
      } else if (e.code === 4001) setError("Network switch rejected.");
      else setError(e.message || "Failed to switch");
    }
  }, []);

  const refreshBalances = useCallback(async () => {
    if (!signer || !isCorrectNetwork) return;
    try {
      const addr = await signer.getAddress();
      const bal = await signer.provider.getBalance(addr);
      setUsdcBalance(bal.toString());
      if (vaultDeployed) {
        try { const v = new Contract(vaultAddress, VAULT_ABI, signer); setVaultBalance((await v.balanceOf(addr)).toString()); } catch { setVaultBalance("0"); }
        try { const u = new Contract(USDC_ADDRESS, USDC_ABI, signer); setAllowance((await u.allowance(addr, vaultAddress)).toString()); } catch { setAllowance("0"); }
      }
    } catch (e) { console.error(e); }
  }, [signer, isCorrectNetwork, vaultAddress, vaultDeployed]);

  useEffect(() => { refreshBalances(); const id = setInterval(refreshBalances, 12000); return () => clearInterval(id); }, [refreshBalances]);
  useEffect(() => {
    if (!window.ethereum) return;
    const hc = () => connectWallet();
    const ha = (a) => { if (!a.length) { setAccount(""); setSigner(null); } else connectWallet(); };
    window.ethereum.on("chainChanged", hc); window.ethereum.on("accountsChanged", ha);
    return () => { window.ethereum.removeListener("chainChanged", hc); window.ethereum.removeListener("accountsChanged", ha); };
  }, [connectWallet]);

  const executeTx = async (label, fn) => {
    try { setError(""); setTxHash(""); setLoading(label); const tx = await fn(); setTxHash(tx.hash); await tx.wait(); await refreshBalances(); setAmount(""); setRecipient(""); }
    catch (e) { setError(e?.reason || e?.info?.error?.message || e?.message || "Transaction failed"); }
    finally { setLoading(""); }
  };

  const handleApprove = () => { if (!vaultDeployed) return setError("Vault not deployed."); executeTx("Approving…", () => { const u = new Contract(getAddress(USDC_ADDRESS), USDC_ABI, signer); return u.approve(getAddress(vaultAddress), parseUnits(amount||"0", ERC20_DEC)); }); };
  const handleDeposit = () => { if (!vaultDeployed) return setError("Vault not deployed."); executeTx("Depositing…", () => { const v = new Contract(getAddress(vaultAddress), VAULT_ABI, signer); return v.deposit(parseUnits(amount||"0", ERC20_DEC)); }); };
  const handleWithdraw = () => { if (!vaultDeployed) return setError("Vault not deployed."); executeTx("Withdrawing…", () => { const v = new Contract(getAddress(vaultAddress), VAULT_ABI, signer); return v.withdraw(parseUnits(amount||"0", ERC20_DEC)); }); };
  const handleTransfer = () => {
    if (!recipient || !isAddress(recipient)) return setError("Enter a valid recipient address.");
    const to = getAddress(recipient);
    if (vaultDeployed) executeTx("Transferring…", () => { const v = new Contract(getAddress(vaultAddress), VAULT_ABI, signer); return v.transfer(to, parseUnits(amount||"0", ERC20_DEC)); });
    else executeTx("Sending USDC…", () => signer.sendTransaction({ to, value: parseUnits(amount||"0", NATIVE_DEC) }));
  };

  const needsApproval = tab === "deposit" && amount && BigInt(allowance) < parseUnits(amount || "0", ERC20_DEC);

  /* ─── Render ───────────────────────────────────────── */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&family=Outfit:wght@300;400;500;600;700;800&display=swap');
        *,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
        :root{
          --bg:#060910;--surface:rgba(13,18,28,.92);--surface-2:rgba(16,22,36,.7);
          --border:rgba(34,211,238,.06);--border-h:rgba(34,211,238,.14);
          --text:#e8edf5;--dim:#4e5d75;
          --accent:#22d3ee;--accent-2:#06b6d4;
          --green:#34d399;--red:#f87171;--orange:#fbbf24;
          --mono:'JetBrains Mono',monospace;--sans:'Outfit',system-ui,sans-serif;
        }
        html{height:100%}
        body{background:var(--bg);color:var(--text);font-family:var(--sans);min-height:100vh;overflow-x:hidden}
        body::before{
          content:'';position:fixed;inset:0;
          background:
            radial-gradient(ellipse 55% 45% at 15% 5%,rgba(34,211,238,.045) 0%,transparent 55%),
            radial-gradient(ellipse 35% 35% at 85% 95%,rgba(6,182,212,.035) 0%,transparent 55%),
            radial-gradient(ellipse 40% 25% at 50% 50%,rgba(129,140,248,.018) 0%,transparent 50%);
          pointer-events:none;z-index:0;
        }
        body::after{
          content:'';position:fixed;inset:0;
          background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
          opacity:.02;pointer-events:none;z-index:0;
        }
        .app{position:relative;z-index:1;max-width:460px;margin:0 auto;padding:48px 16px 80px}

        /* ── Header ── */
        .hdr{text-align:center;margin-bottom:40px}
        .hdr-logo{
          display:inline-flex;align-items:center;gap:12px;margin-bottom:10px;
        }
        .hdr-icon{
          width:38px;height:38px;border-radius:11px;
          background:linear-gradient(135deg,var(--accent-2),var(--accent));
          display:flex;align-items:center;justify-content:center;
          font-size:17px;font-weight:800;color:var(--bg);font-family:var(--mono);
          box-shadow:0 0 24px rgba(34,211,238,.18),inset 0 1px 0 rgba(255,255,255,.15);
        }
        .hdr-name{
          font-family:var(--mono);font-size:28px;font-weight:700;
          color:var(--text);letter-spacing:-1px;
        }
        .hdr-badge{
          display:inline-block;
          font-size:10px;font-family:var(--mono);font-weight:600;
          color:var(--accent);letter-spacing:1px;text-transform:uppercase;
          background:rgba(34,211,238,.06);border:1px solid rgba(34,211,238,.1);
          padding:4px 14px;border-radius:999px;
        }

        /* ── Card ── */
        .crd{
          background:var(--surface);
          border:1px solid var(--border);
          border-radius:16px;padding:22px 24px;margin-bottom:10px;
          backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
          transition:border-color .25s;
          animation:up .4s ease both;
        }
        .crd:nth-child(2){animation-delay:.04s}
        .crd:nth-child(3){animation-delay:.08s}
        .crd:nth-child(4){animation-delay:.12s}
        .crd:hover{border-color:var(--border-h)}
        @keyframes up{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .crd-lbl{
          font-size:10px;font-weight:700;text-transform:uppercase;
          letter-spacing:1.6px;color:var(--dim);margin-bottom:14px;
        }

        /* ── Wallet Row ── */
        .w-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .w-addr{font-family:var(--mono);font-size:16px;font-weight:600}
        .bdg{
          font-family:var(--mono);font-size:10px;padding:5px 12px;
          border-radius:999px;font-weight:700;letter-spacing:.4px;
        }
        .bdg-ok{background:rgba(52,211,153,.08);color:var(--green);border:1px solid rgba(52,211,153,.12)}
        .bdg-bad{background:rgba(248,113,113,.08);color:var(--red);border:1px solid rgba(248,113,113,.12)}
        .sw-btn{
          background:rgba(248,113,113,.08);color:var(--red);
          border:1px solid rgba(248,113,113,.14);
          padding:5px 12px;border-radius:7px;font-size:10px;font-weight:700;
          cursor:pointer;font-family:var(--sans);transition:all .15s;
        }
        .sw-btn:hover{background:rgba(248,113,113,.16)}

        /* ── Balances ── */
        .bg{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .bx{
          background:rgba(8,12,22,.65);border:1px solid var(--border);
          border-radius:12px;padding:18px 16px;transition:border-color .2s;
        }
        .bx:hover{border-color:var(--border-h)}
        .bx-lbl{
          font-size:9px;color:var(--dim);font-weight:700;
          text-transform:uppercase;letter-spacing:1.2px;margin-bottom:10px;
        }
        .bx-val{font-family:var(--mono);font-size:24px;font-weight:700;line-height:1}
        .bx-u{font-size:11px;color:var(--dim);font-weight:500;margin-left:5px;letter-spacing:.3px}

        /* ── Tabs ── */
        .tabs{
          display:flex;gap:2px;
          background:rgba(8,12,22,.5);border:1px solid var(--border);
          border-radius:11px;padding:3px;margin-bottom:18px;
        }
        .tb{
          flex:1;background:none;border:none;color:var(--dim);
          font-family:var(--sans);font-size:13px;font-weight:600;
          padding:10px 0;border-radius:9px;cursor:pointer;transition:all .2s;
        }
        .tb:hover{color:var(--text)}
        .tb.on{
          background:rgba(34,211,238,.07);color:var(--accent);
          box-shadow:0 0 10px rgba(34,211,238,.04);
        }

        /* ── Inputs ── */
        .fld{margin-bottom:12px}
        .fld-lbl{display:block;font-size:11px;font-weight:600;color:var(--dim);margin-bottom:6px;letter-spacing:.3px}
        .inp{
          width:100%;background:rgba(8,12,22,.65);
          border:1px solid var(--border);border-radius:10px;
          padding:13px 14px;color:var(--text);
          font-family:var(--mono);font-size:14px;font-weight:500;
          outline:none;transition:border-color .2s,box-shadow .2s;
        }
        .inp::placeholder{color:#1f2d42}
        .inp:focus{border-color:rgba(34,211,238,.25);box-shadow:0 0 0 3px rgba(34,211,238,.05)}

        /* ── Buttons ── */
        .br{display:flex;gap:8px;margin-top:16px}
        .bt{
          flex:1;padding:14px 0;border:none;border-radius:10px;
          font-family:var(--sans);font-size:14px;font-weight:700;
          cursor:pointer;transition:all .2s;letter-spacing:.2px;
        }
        .bt:disabled{opacity:.3;cursor:not-allowed}
        .bt-p{background:linear-gradient(135deg,var(--accent-2),var(--accent));color:var(--bg)}
        .bt-p:not(:disabled):hover{box-shadow:0 4px 24px rgba(34,211,238,.22);transform:translateY(-1px)}
        .bt-p:not(:disabled):active{transform:translateY(0)}
        .bt-o{background:transparent;border:1px solid rgba(34,211,238,.18);color:var(--accent)}
        .bt-o:not(:disabled):hover{background:rgba(34,211,238,.05);border-color:rgba(34,211,238,.3)}

        .bt-con{
          width:100%;padding:16px;
          background:linear-gradient(135deg,var(--accent-2),var(--accent));
          color:var(--bg);border:none;border-radius:12px;
          font-family:var(--sans);font-size:15px;font-weight:700;
          cursor:pointer;transition:all .25s;letter-spacing:.2px;
        }
        .bt-con:hover{box-shadow:0 4px 32px rgba(34,211,238,.22);transform:translateY(-2px)}
        .bt-con:active{transform:translateY(0)}

        /* ── Status ── */
        .tx-b{
          background:rgba(52,211,153,.05);border:1px solid rgba(52,211,153,.1);
          border-radius:10px;padding:12px 14px;margin-bottom:12px;
          font-family:var(--mono);font-size:11px;color:var(--green);
          word-break:break-all;line-height:1.6;
        }
        .tx-b a{color:var(--green);text-decoration:none;opacity:.85}
        .tx-b a:hover{opacity:1;text-decoration:underline}
        .tx-l{font-size:9px;opacity:.5;display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:1px;font-weight:600}
        .er-b{
          background:rgba(248,113,113,.05);border:1px solid rgba(248,113,113,.1);
          border-radius:10px;padding:12px 14px;margin-bottom:12px;
          font-size:12px;color:var(--red);word-break:break-word;line-height:1.5;
        }
        .ld-p{
          color:var(--orange);font-family:var(--mono);font-size:12px;
          text-align:center;padding:8px 0;animation:pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}

        /* ── Notice ── */
        .ntc{
          background:rgba(251,191,36,.03);border:1px solid rgba(251,191,36,.1);
          border-radius:10px;padding:14px;margin-bottom:12px;text-align:center;
        }
        .ntc p{color:var(--orange);font-size:12px;margin-bottom:10px;line-height:1.5}
        .ntc-btn{
          background:rgba(251,191,36,.07);color:var(--orange);
          border:1px solid rgba(251,191,36,.15);
          padding:6px 16px;border-radius:7px;font-size:11px;font-weight:700;
          cursor:pointer;font-family:var(--sans);transition:all .15s;
        }
        .ntc-btn:hover{background:rgba(251,191,36,.14)}

        /* ── Config ── */
        .cfg-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}
        .cfg-x{
          background:none;border:none;color:var(--dim);cursor:pointer;
          font-size:18px;padding:2px 6px;border-radius:5px;transition:all .15s;
        }
        .cfg-x:hover{background:rgba(255,255,255,.04);color:var(--text)}
        .steps{display:flex;flex-direction:column;gap:6px}
        .stp{
          display:flex;gap:12px;align-items:flex-start;
          padding:11px 14px;background:rgba(8,12,22,.5);
          border:1px solid var(--border);border-radius:10px;transition:border-color .2s;
        }
        .stp:hover{border-color:var(--border-h)}
        .stp-n{
          flex:0 0 22px;height:22px;
          background:linear-gradient(135deg,var(--accent-2),var(--accent));
          color:var(--bg);border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:800;font-family:var(--mono);margin-top:1px;
        }
        .stp-t{display:block;font-size:12px;font-weight:600;color:var(--text);margin-bottom:2px}
        .stp-d{display:block;font-size:11px;color:var(--dim);line-height:1.5}
        .stp-d code{background:rgba(34,211,238,.05);color:var(--accent);padding:1px 5px;border-radius:3px;font-family:var(--mono);font-size:10px}
        .stp-a{color:var(--accent);font-size:11px;font-weight:600;text-decoration:none;margin-top:2px;display:inline-block}
        .stp-a:hover{text-decoration:underline}
        .ai-row{display:flex;gap:8px;margin-top:14px}
        .ai-row .inp{flex:1}
        .ai-row .bt{flex:0 0 auto;padding:13px 24px}
        .v-saved{
          margin-top:10px;padding:10px 14px;
          background:rgba(52,211,153,.04);border:1px solid rgba(52,211,153,.1);
          border-radius:8px;font-family:var(--mono);font-size:11px;color:var(--green);word-break:break-all;
        }
        .v-tag{
          display:flex;justify-content:center;align-items:center;gap:8px;
          margin-top:2px;margin-bottom:6px;
        }
        .v-tag span{font-family:var(--mono);font-size:10px;color:var(--dim);letter-spacing:.3px}
        .v-tag button{
          background:none;border:none;color:var(--accent);cursor:pointer;
          font-size:10px;font-family:var(--sans);font-weight:600;opacity:.6;transition:opacity .15s;
        }
        .v-tag button:hover{opacity:1}

        /* ── Connect Card ── */
        .con-crd{text-align:center;padding:52px 24px}
        .con-ico{
          width:60px;height:60px;border-radius:18px;
          background:linear-gradient(135deg,rgba(34,211,238,.08),rgba(129,140,248,.06));
          border:1px solid rgba(34,211,238,.1);
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 22px;font-size:24px;
          box-shadow:0 0 30px rgba(34,211,238,.06);
        }
        .con-txt{color:var(--dim);font-size:14px;margin-bottom:28px;line-height:1.6}

        /* ── Footer ── */
        .ftr{
          text-align:center;margin-top:32px;
          color:var(--dim);font-size:10px;font-family:var(--mono);
          letter-spacing:1px;opacity:.4;
        }

        @media(max-width:540px){
          .app{padding:28px 14px 64px}
          .bx-val{font-size:19px}
          .hdr-name{font-size:24px}
          .con-crd{padding:40px 20px}
        }
      `}</style>

      <div className="app">
        {/* ── Header ── */}
        <div className="hdr">
          <div className="hdr-logo">
            <div className="hdr-icon">A</div>
            <span className="hdr-name">ArcVault</span>
          </div>
          <br />
          <span className="hdr-badge">Testnet</span>
        </div>

        {/* ── Not Connected ── */}
        {!account && (
          <div className="crd con-crd">
            <div className="con-ico">◈</div>
            <div className="con-txt">
              Connect your wallet to manage<br />USDC on Arc Testnet
            </div>
            <button className="bt-con" onClick={connectWallet}>Connect Wallet</button>
          </div>
        )}

        {/* ── Connected ── */}
        {account && (
          <>
            <div className="crd">
              <div className="crd-lbl">Wallet</div>
              <div className="w-row">
                <span className="w-addr">{shortenAddr(account)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className={`bdg ${isCorrectNetwork ? "bdg-ok" : "bdg-bad"}`}>
                    {isCorrectNetwork ? "Arc Testnet" : `Chain ${chainId}`}
                  </span>
                  {!isCorrectNetwork && <button className="sw-btn" onClick={switchToArc}>Switch</button>}
                </div>
              </div>
            </div>

            {isCorrectNetwork && (
              <>
                {/* Balances */}
                <div className="crd">
                  <div className="crd-lbl">Balances</div>
                  <div className="bg">
                    <div className="bx">
                      <div className="bx-lbl">Wallet</div>
                      <div className="bx-val">
                        {fmtUsdc(usdcBalance, NATIVE_DEC)}
                        <span className="bx-u">USDC</span>
                      </div>
                    </div>
                    <div className="bx">
                      <div className="bx-lbl">Vault</div>
                      <div className="bx-val">
                        {vaultDeployed
                          ? <>{fmtUsdc(vaultBalance, ERC20_DEC)}<span className="bx-u">USDC</span></>
                          : <span style={{ fontSize: 12, color: "var(--dim)", fontFamily: "var(--sans)", fontWeight: 500 }}>—</span>
                        }
                      </div>
                    </div>
                  </div>
                </div>

                {/* Operations */}
                <div className="crd">
                  <div className="crd-lbl">Operations</div>
                  <div className="tabs">
                    {["deposit", "withdraw", "transfer"].map((t) => (
                      <button key={t} className={`tb ${tab === t ? "on" : ""}`}
                        onClick={() => { setTab(t); setError(""); setTxHash(""); }}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>

                  {!vaultDeployed && (tab === "deposit" || tab === "withdraw") && (
                    <div className="ntc">
                      <p>Vault not connected yet. Use Transfer for direct sends.</p>
                      <button className="ntc-btn" onClick={() => setShowConfig(true)}>Connect Vault</button>
                    </div>
                  )}

                  {txHash && (
                    <div className="tx-b">
                      <span className="tx-l">Transaction</span>
                      <a href={`${ARC_TESTNET.blockExplorerUrls[0]}/tx/${txHash}`} target="_blank" rel="noreferrer">{txHash}</a>
                    </div>
                  )}
                  {error && <div className="er-b">{error}</div>}
                  {loading && <div className="ld-p">{loading}</div>}

                  {tab === "transfer" && (
                    <div className="fld">
                      <label className="fld-lbl">Recipient Address</label>
                      <input className="inp" placeholder="0x..." value={recipient} onChange={(e) => setRecipient(e.target.value)} />
                    </div>
                  )}
                  <div className="fld">
                    <label className="fld-lbl">Amount (USDC)</label>
                    <input className="inp" type="number" min="0" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </div>

                  <div className="br">
                    {tab === "deposit" && needsApproval && (
                      <button className="bt bt-o" disabled={!!loading || !amount || !vaultDeployed} onClick={handleApprove}>Approve</button>
                    )}
                    {tab === "deposit" && (
                      <button className="bt bt-p" disabled={!!loading || !amount || needsApproval || !vaultDeployed} onClick={handleDeposit}>Deposit</button>
                    )}
                    {tab === "withdraw" && (
                      <button className="bt bt-p" disabled={!!loading || !amount || !vaultDeployed} onClick={handleWithdraw}>Withdraw</button>
                    )}
                    {tab === "transfer" && (
                      <button className="bt bt-p" disabled={!!loading || !amount || !recipient} onClick={handleTransfer}>{vaultDeployed ? "Transfer" : "Send USDC"}</button>
                    )}
                  </div>
                </div>

                {/* ── Vault Config ── */}
                {!vaultDeployed && !showConfig && (
                  <div className="crd" style={{ textAlign: "center", padding: "28px 24px" }}>
                    <div className="crd-lbl">Vault Setup</div>
                    <p style={{ color: "var(--dim)", fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
                      Deploy your ArcVault contract to enable Deposit & Withdraw.
                    </p>
                    <button className="bt bt-p" style={{ maxWidth: 240, margin: "0 auto" }} onClick={() => setShowConfig(true)}>Deploy & Connect Vault</button>
                  </div>
                )}

                {showConfig && (
                  <div className="crd">
                    <div className="cfg-h">
                      <span className="crd-lbl" style={{ margin: 0 }}>Connect Vault</span>
                      <button className="cfg-x" onClick={() => setShowConfig(false)}>✕</button>
                    </div>
                    <div className="steps">
                      <div className="stp">
                        <span className="stp-n">1</span>
                        <div>
                          <span className="stp-t">Open Deployer</span>
                          <a href="https://arc-stablecoin-dapp.vercel.app/deployer.html" target="_blank" rel="noreferrer" className="stp-a">deployer.html →</a>
                        </div>
                      </div>
                      <div className="stp">
                        <span className="stp-n">2</span>
                        <div>
                          <span className="stp-t">Deploy Contract</span>
                          <span className="stp-d">Click "Deploy ArcVault" and confirm in MetaMask</span>
                        </div>
                      </div>
                      <div className="stp">
                        <span className="stp-n">3</span>
                        <div>
                          <span className="stp-t">Paste Address Below</span>
                          <span className="stp-d">Copy the deployed contract address and paste it here</span>
                        </div>
                      </div>
                    </div>
                    <div className="ai-row">
                      <input className="inp" placeholder="0x... contract address" value={vaultInput} onChange={(e) => setVaultInput(e.target.value)} />
                      <button className="bt bt-p" disabled={!vaultInput || !isAddress(vaultInput)}
                        onClick={() => {
                          const a = getAddress(vaultInput);
                          setVaultAddress(a); localStorage.setItem(SAVED_VAULT_KEY, a);
                          setVaultInput(""); setShowConfig(false); refreshBalances();
                        }}>Save</button>
                    </div>
                    {vaultInput && !isAddress(vaultInput) && (
                      <span style={{ color: "var(--red)", fontSize: 10, marginTop: 4, display: "block" }}>Invalid address</span>
                    )}
                    {vaultDeployed && <div className="v-saved">✓ {vaultAddress}</div>}
                  </div>
                )}

                {vaultDeployed && !showConfig && (
                  <div className="v-tag">
                    <span>Vault: {shortenAddr(vaultAddress)}</span>
                    <button onClick={() => setShowConfig(true)}>change</button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        <div className="ftr">ARCVAULT · {new Date().getFullYear()}</div>
      </div>
    </>
  );
}
