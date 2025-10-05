import { ethers, getAddress } from "ethers";
import { encryptPrivateKey } from "./encrypDecrypt";
import { ERC20_ABI, MULTICALL3_ABI, FACTORY_ABI } from "./abis";
import { TokenDetails, PriceEntry, WalletEntry } from "./customClasses";
import axios from 'axios';
import { Token, CurrencyAmount, TradeType, Percent } from "@pancakeswap/sdk";
import { Pool, Route as RouteV3, pancakeV3PoolABI as POOL_ABI, quoterV2ABI as QUOTER_ABI } from "@pancakeswap/v3-sdk";
import { PancakeSwapUniversalRouter as UniversalSwapRouter } from "@pancakeswap/universal-router-sdk";
import {request, gql} from "graphql-request"

if (!process.env.JSON_RPC_ENDPOINT_SEPOLIA) throw ("JSON RPC Provider not set");
if (!process.env.COINGECKO_API_ENDPOINT || !process.env.COINGECKO_API_KEY) throw ("coingecko stuff missing");
if (!process.env.SEPOLIA_MULTICALL3_CONTRACT_ADDRESS) throw ("did not find multicall3 smart contract address");
if (!process.env.PANCAKESWAP_UNIVERSAL_ROUTER_SEPOLIA) throw ("did not find universal router address");
if (!process.env.PANCAKESWAP_V3_QUOTER_SEPOLIA) throw ("did not find v3 quoter address env");
if (!process.env.PANCAKESWAP_V3_FACTORY_SEPOLIA) throw ("did not find v3 factory address env");
if (!process.env.THE_GRAPH_STUDIO_API_KEY) throw ("graph studio key not found")

const COINGECKO_API_ENDPOINT = process.env.COINGECKO_API_ENDPOINT;
const COINGECKO_API_KEY = process.env.COINGECKO_API_KEY;
const MULTICALL3_ADDRESS = process.env.SEPOLIA_MULTICALL3_CONTRACT_ADDRESS;
const UNIVERSAL_ROUTER_ADDRESS = process.env.PANCAKESWAP_UNIVERSAL_ROUTER_SEPOLIA;
const QUOTER_ADDRESS = process.env.PANCAKESWAP_V3_QUOTER_SEPOLIA;
const THE_GRAPH_STUDIO_API_KEY = process.env.THE_GRAPH_STUDIO_API_KEY;
const pancakeswapSubgraph = 'https://gateway.thegraph.com/api/subgraphs/id/BHWNsedAHtmTCzXxCCDfhPmm6iN9rxUhoRHdHKyujic3';
const gqlHeaders = {
  Authorization: `Bearer ${THE_GRAPH_STUDIO_API_KEY}`,
};
const provider = new ethers.JsonRpcProvider(process.env.JSON_RPC_ENDPOINT_SEPOLIA);

// max uint256 (bigint)
const MAX_UINT256 = (1n << 256n) - 1n;


export async function getPoolData(symbol1: string, symbol2: string): Promise<{ token2Price: number,sqrtPriceX96:number, tick:number, liquidity:number, fee: number }> {
  try{
    const query = gql`query MyQuery($token0Symbol: String!, $token1Symbol: String!) {
      pools(
        where: {token0_: {symbol: $token0Symbol}, token1_: {symbol: $token1Symbol}}
        orderBy: token1Price
        orderDirection: desc
        first: 1
      ) {
        id
        token1Price
        sqrtPrice
        tick
        liquidity
        feeTier
      }
    }`;
    const variables = {
      token0Symbol: symbol1.toUpperCase(),
      token1Symbol: symbol2.toUpperCase(),
    };    
    const data: any = await request(pancakeswapSubgraph, query, variables, gqlHeaders);
    console.log(data);
    if(data.pools.length == 0)
      throw new Error("no pools avaolable for the exchange")
    const bestPool = data.pools[0];
    return{
      liquidity: parseInt(bestPool.liquidity),
      sqrtPriceX96: parseInt(bestPool.sqrtPrice),
      tick: parseInt(bestPool.tick),
      token2Price: parseFloat(bestPool.token1Price),
      fee: parseInt(bestPool.feeTier)
    }

  } catch (e) {
    console.error(`Error whe fetching pool information${e}`)
    throw new Error(`Error whe fetching pool information${e}`)
  }
}

/**
 * Quote using on-chain Quoter (single-hop)
 * - tokenA/tokenB are Token objects from @pancakeswap/sdk
 * - poolAddress used only to fetch fee if you don't have it; you can also pass fee directly
 */

export async function quoteSwap(tokenA: TokenDetails, tokenB: TokenDetails, amountInHuman = "1.0") :Promise<string> {
  // fetch pool fee (uint24) from poolAddress
  const { fee } = await getPoolData(tokenA.symbol,tokenB.symbol);
  // amountIn as bigint (ethers v6 parseUnits returns bigint)
  const amountInRaw: bigint = ethers.parseUnits(amountInHuman, tokenA.decimals);
  // call quoter
  const quoter = new ethers.Contract(QUOTER_ADDRESS, QUOTER_ABI, provider);

  // callStatic to ensure read-only
  // sqrtPriceLimitX96 = 0 for no limit
  let amountOutRaw: bigint;
  try {
    amountOutRaw = await quoter.quoteExactInputSingle(
      tokenA.contract_address,
      tokenB.contract_address,
      fee,              // likely a number or BigNumber-like
      amountInRaw,
      0
    ) as bigint;
  } catch (err) {
    console.error("Quoter call failed:", err);
    throw new Error("Failed to get quote from on-chain quoter");
  }

  // format to human readable using decimals of tokenB
  const amountOutHuman = ethers.formatUnits(amountOutRaw, tokenB.decimals);
  console.log(`Quote: ${amountInHuman} ${tokenA.symbol} ≈ ${amountOutHuman} ${tokenB.symbol}`);

  return amountOutHuman
}

export async function executeSwapOnChain(
  tokenADetail: TokenDetails,
  tokenBDetail: TokenDetails,
  privateKey: string,
  amountInHuman = "1.0",
  slippageBps = 50,
) {
  const signer = new ethers.Wallet(privateKey, provider);
  const tokenA = new Token(84532, `0x${tokenADetail.contract_address.substring(2)}`, tokenADetail.decimals, tokenADetail.symbol, tokenADetail.name)
  const tokenB = new Token(84532, `0x${tokenBDetail.contract_address.substring(2)}`, tokenBDetail.decimals, tokenBDetail.symbol, tokenBDetail.name)
  // 1) get pool state to construct route (used by SDK for calldata generation)
  const { sqrtPriceX96, tick, liquidity, fee } = await getPoolData(tokenA.symbol, tokenB.symbol);
  const pool = new Pool(tokenA, tokenB, fee, sqrtPriceX96.toString(), liquidity.toString(), tick);
  const route = new RouteV3([pool], tokenA, tokenB);

  // 2) compute raw input
  const amountInRaw: bigint = ethers.parseUnits(amountInHuman, tokenA.decimals);

  // 3) use on-chain quoter to get expected output
  const quoter = new ethers.Contract(QUOTER_ADDRESS, QUOTER_ABI, provider);
  let amountOutRaw: bigint;
  try {
    amountOutRaw = await quoter.quoteExactInputSingle(
      tokenA.address,
      tokenB.address,
      fee,
      amountInRaw,
      0
    ) as bigint;
  } catch (err) {
    console.error("Quoter call failed:", err);
    throw new Error("Failed to get quote from on-chain quoter");
  }

  // 4) construct minimal smartTrade object that the universal-router-sdk expects at runtime.
  //    We don't have exact TypeScript types available across the version boundaries, so cast to `any` when calling the SDK.
  //    The important fields are: inputAmount, outputAmount, route, tradeType; the SDK will read what it needs.
  const smartTrade: any = {
    route: route, // v3 Route instance (the SDK uses runtime data inside it)
    inputAmount: CurrencyAmount.fromRawAmount(tokenA, amountInRaw.toString()),
    outputAmount: CurrencyAmount.fromRawAmount(tokenB, amountOutRaw.toString()),
    tradeType: TradeType.EXACT_INPUT,
    // SDK might read other computed fields (executionPrice, nextMidPrice) but many wrappers work with this minimal shape.
  };

  // 5) Build swap parameters (calldata + value) using universal-router sdk helper.
  //    In your installed version, the helper is swapERC20CallParameters - use `any` casts to avoid TS errors.
  const options: any = {
    slippageTolerance: new Percent(slippageBps, 10_000), // e.g. 50 bps => 0.5%
    recipient: await signer.getAddress(),
    deadline: Math.floor(Date.now() / 1000) + 60 * 10, // 10 minutes
  };

  let swapCallParams: { calldata: string; value?: bigint | number | string };
  try {
    // call the helper in a dynamically-typed way to avoid compile-time mismatches:
    swapCallParams = (UniversalSwapRouter as any).swapERC20CallParameters(smartTrade, options);
  } catch (err) {
    console.error("swapERC20CallParameters failed:", err);
    throw new Error("Failed to build swap calldata with Universal Router SDK");
  }

  // 6) Approve tokenA to router if needed (check allowance)
  const routerAddress = UNIVERSAL_ROUTER_ADDRESS;
  const ERC20 = new ethers.Contract(tokenA.address, ERC20_ABI, signer);
  const signerAddress = await signer.getAddress();

  // allowance returns bigint for ethers v6
  const currentAllowance: bigint = (await ERC20.allowance(signerAddress, routerAddress)) as bigint;
  if (currentAllowance < amountInRaw) {
    const txApprove = await ERC20.approve(routerAddress, MAX_UINT256);
    await txApprove.wait();
    console.log("Router approved");
  }

  // 7) Send transaction to Universal Router (calldata + value)
  const tx = await signer.sendTransaction({
    to: routerAddress,
    data: swapCallParams.calldata,
    value: (swapCallParams.value ?? 0) as any,
    gasLimit: 900_000n, // tune for your network/testnet
  });

  console.log("Swap TX sent:", tx.hash);
  const receipt = await tx.wait();

  if (receipt) {
    console.log("Swap confirmed:", tx.hash, "status:", receipt.status);
  } else {
    console.log("Swap confirmed (tx):", tx.hash, "(no receipt returned)");
  }

  return receipt;
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


