import { ethers, getAddress } from "ethers"
import { encryptPrivateKey } from "./encrypDecrypt";
import { ERC20_ABI, MULTICALL3_ABI } from "./abis";
import { TokenDetails, PriceEntry, WalletEntry } from "./customClasses";
import axios from 'axios';

if (!process.env.JSON_RPC_ENDPOINT_SEPOLIA)
  throw ("JSON RPC PRovider not set")

if (!process.env.COINGECKO_API_ENDPOINT || !process.env.COINGECKO_API_KEY)
  throw ("coingecko stuff missing")

if (!process.env.SEPOLIA_MULTICALL3_CONTRACT_ADDRESS)
  throw ("did not find multicall3 smart contract address")

const provider = new ethers.JsonRpcProvider(process.env.JSON_RPC_ENDPOINT_SEPOLIA);
const COINGECKO_API_ENDPOINT = process.env.COINGECKO_API_ENDPOINT;
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const MULTICALL3_ADDRESS = process.env.SEPOLIA_MULTICALL3_CONTRACT_ADDRESS

function formatBalance(decodedBalance: ethers.BigNumberish, decimals: number): string {
  return ethers.formatUnits(decodedBalance, decimals);
}

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

export async function fetchTokenDetails(addressInput: string): Promise<TokenDetails> {
  try {
    const address = addressInput;

    if (!checkProvider(provider)) {
      console.error("Provider not working")
      throw new Error("Provider not working")
    }

    const token = new ethers.Contract(address, ERC20_ABI, provider);

    const [name, symbol, decimals] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals()
    ]);

    return { contract_address: address, name, symbol, decimals };
  } catch (e) {
    console.error(e);
    throw new Error("Could not fetch token details");
  }
}

export async function fetchUSDPricesBySymbol(tokens: string[]): Promise<PriceEntry[]> {
  try {
    const symbols: string[] = tokens.map((token) => token.toLowerCase());
    const response = await axios.get(`${COINGECKO_API_ENDPOINT}/simple/price`, {
      params: {
        vs_currencies: 'usd',
        symbols: symbols.length > 1 ? symbols.join(',') : symbols[0]
      },
      headers: {
        'x-cg-demo-api-key': COINGECKO_API_KEY
      }
    })
      .then(response => {
        console.log('Data fetched successfully:');
        return response
      })
      .catch(error => {
        console.error('Error fetching data:', error);
        throw new Error(error)
      });
    const data = response.data;

    const usdPrices: PriceEntry[] = symbols.map((sym, i) => {
      const entry = data[sym];
      const price = entry?.usd ?? 0;
      const market_cap = entry?.market_cap ?? 0;
      return new PriceEntry(sym, price, market_cap);
    });

    return usdPrices;
  } catch (e) {
    console.error(`Error fetching price: ${e}`)
    throw new Error(`${e}`)
  }
}

export async function fetchWalletBalaces(tokens: TokenDetails[], wallet_address: string): Promise<WalletEntry[]> {
  try {
    const contract_addresses: string[] = tokens.map((token) => token.contract_address);
    const wallet_address_proper = getAddress(wallet_address);
    if (!checkProvider(provider)) {
      console.error("Provider not working")
      throw new Error("Provider not working")
    }

    console.log(tokens)
    const tokenInterface = new ethers.Interface(ERC20_ABI)

    const multicall = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, provider);

    // Encode balanceOf calls
    const calls = tokens.map((token) => {
      return {
        target: token.contract_address,
        allowFailure: true,
        callData: tokenInterface.encodeFunctionData("balanceOf", [wallet_address_proper])
      };
    });

    // Call aggregate3
    const results = await multicall.aggregate3.staticCall(calls);

    if (results.length != tokens.length)
      throw ("balance fetch mismatch")


    // Decode each result
    const resp = results.map((res: any, i: number) => {
      if (!res.success) {
        return new WalletEntry(tokens[i].symbol, 0);
      }
      try {
        const decoded = tokenInterface.decodeFunctionResult("balanceOf", res.returnData);
        return new WalletEntry(
          tokens[i].symbol,
          parseFloat(formatBalance(decoded[0], tokens[i].decimals))
        );
      } catch {
        return new WalletEntry(tokens[i].symbol, 0);
      }
    });
    return resp
  } catch (e) {
    console.error(`Error fetching balances: ${e}`)
    throw new Error(`${e}`)
  }
}

export async function fetchETHBalance(wallet_address: string): Promise<number> {
  try {
    const weiBalance = await provider.getBalance(wallet_address);
    return parseFloat(formatBalance(weiBalance, 18))
  } catch (e) {
    console.error(`Error when fetching ETH balance: ${e}`);
    throw new Error(`Error when fetching ETH balance: ${e}`)
  }
}
