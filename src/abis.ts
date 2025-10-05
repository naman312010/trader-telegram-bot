export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)"
];

export const MULTICALL3_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "internalType": "address", "name": "target", "type": "address" },
          { "internalType": "bool", "name": "allowFailure", "type": "bool" },
          { "internalType": "bytes", "name": "callData", "type": "bytes" }
        ],
        "internalType": "struct Multicall3.Call3[]",
        "name": "calls",
        "type": "tuple[]"
      }
    ],
    "name": "aggregate3",
    "outputs": [
      {
        "components": [
          { "internalType": "bool", "name": "success", "type": "bool" },
          { "internalType": "bytes", "name": "returnData", "type": "bytes" }
        ],
        "internalType": "struct Multicall3.Result[]",
        "name": "returnData",
        "type": "tuple[]"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  }

];

export const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address)"
];

