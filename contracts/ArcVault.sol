// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ArcVault
 * @notice A secure USDC vault for deposits, withdrawals, and transfers on Arc Testnet.
 * @dev Uses OpenZeppelin SafeERC20 and ReentrancyGuard for maximum safety.
 */
contract ArcVault is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────
    IERC20 public immutable usdc;
    mapping(address => uint256) public balances;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────
    event Deposited(address indexed user, uint256 amount, uint256 timestamp);
    event Withdrawn(address indexed user, uint256 amount, uint256 timestamp);
    event Transferred(
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 timestamp
    );

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance(uint256 requested, uint256 available);

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────
    constructor(address _usdc) {
        if (_usdc == address(0)) revert ZeroAddress();
        usdc = IERC20(_usdc);
    }

    // ──────────────────────────────────────────────
    //  Core Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Deposit USDC into the vault.
     * @param amount The amount of USDC (in smallest unit) to deposit.
     * @dev Caller must approve this contract first.
     */
    function deposit(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();

        balances[msg.sender] += amount;
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        emit Deposited(msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Withdraw USDC from the vault back to caller.
     * @param amount The amount of USDC to withdraw.
     */
    function withdraw(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount)
            revert InsufficientBalance(amount, balances[msg.sender]);

        balances[msg.sender] -= amount;
        usdc.safeTransfer(msg.sender, amount);

        emit Withdrawn(msg.sender, amount, block.timestamp);
    }

    /**
     * @notice Transfer USDC through the contract to another address.
     * @param to Recipient address.
     * @param amount The amount of USDC to transfer.
     */
    function transfer(address to, uint256 amount) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (balances[msg.sender] < amount)
            revert InsufficientBalance(amount, balances[msg.sender]);

        balances[msg.sender] -= amount;
        balances[to] += amount;
        usdc.safeTransfer(to, amount);

        emit Transferred(msg.sender, to, amount, block.timestamp);
    }

    // ──────────────────────────────────────────────
    //  View Functions
    // ──────────────────────────────────────────────

    /**
     * @notice Returns the vault balance for an account.
     */
    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    /**
     * @notice Returns total USDC held by the contract.
     */
    function totalVaultBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
