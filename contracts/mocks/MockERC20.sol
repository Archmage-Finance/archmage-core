// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(uint256 amountToMint) ERC20("Test ERC20", "TEST") {
        _mint(msg.sender, amountToMint);
    }
}