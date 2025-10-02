import { ethers } from "ethers"
import { encryptPrivateKey } from "./encrypDecrypt";
import { ERC20_ABI } from "./abis";


if (!process.env.JSON_RPC_ENDPOINT_SEPOLIA)
  throw ("JSON RPC PRovider not set")

const provider = new ethers.JsonRpcProvider(process.env.JSON_RPC_ENDPOINT_SEPOLIA);

async function checkProvider(provider: ethers.JsonRpcProvider) {
    try {
        const block = await provider.getBlockNumber();
        // console.log(`Provider is working, current block: ${block}`);
        return true;
    } catch (e) {
        console.error("Provider is not responding", e);
        return false;
    }
}

export function createWallet() {
  try {
    const wallet = ethers.Wallet.createRandom();
    const publicKey = wallet.address
    const encryptedPvtKey = encryptPrivateKey(wallet.privateKey)
    if (!publicKey || !encryptedPvtKey.ciphertext || !encryptedPvtKey.iv || !encryptedPvtKey.tag)
      throw new Error("Wallet null")
    return { publicKey, encryptedPvtKey }
  } catch (e) {
    console.log("Wallet generatio error", e)
  }
}

export async function fetchTokenDetails(addressInput: string) {
  try {
    const address = addressInput;

    if(!checkProvider(provider)){
      console.error("Provider not working")
      throw new Error("Provider not working")
    }

    const token = new ethers.Contract(address, ERC20_ABI, provider);

    const [name, symbol, decimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals()
    ]);

    return { address, name, symbol, decimals };
  } catch (e) {
    console.error(e);
    throw new Error("Could not fetch token details");
  }
}
