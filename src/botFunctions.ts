import { Context } from "grammy"
import { SupabaseClient } from '@supabase/supabase-js'
import { createWallet, fetchTokenDetails, fetchUSDPricesBySymbol, fetchETHBalance, fetchWalletBalaces, quoteSwap, executeSwapOnChain } from "./walletAndTokens";
import { WELCOME_MSG } from "./defaultMessages";
import 'dotenv/config'
import { TokenDetails, } from "./customClasses";
import { decryptPrivateKey } from "./encrypDecrypt";

async function fetchUserWallet(user_id: string, supabaseClient: SupabaseClient): Promise<string> {
    try {
        let wallet = ""
        let { data: users, error } = await supabaseClient
            .from('users')
            .select('wallet_address')
            .eq('user_id', user_id);
        if (error) {
            console.error("Error when checking pre-existing user in supabase")
            throw new Error("Error when checking pre-existing user in supabase")
        }
        if (users) {
            if (users.length > 0) {

                return users[0].wallet_address
            }
        }
        return wallet
    } catch (e) {
        console.error("Error whe fetching user wallet", e);
        throw new Error(`Error whe fetching user wallet",${e}`)
    }
}

async function dbTokensDetailsByAddress(tokens: TokenDetails[], supabaseClient: SupabaseClient): Promise<TokenDetails[]> {
    try {
        const contract_addresses: string[] = tokens.map((token) => token.contract_address);
        const { data: tokensData, error: error2 } = await supabaseClient
            .from('crypto_list')
            .select('name,contract_address,symbol,decimals')
            .in('contract_address', contract_addresses);
        if (error2) {
            console.error("Error whe pre-checkig token")
            throw new Error(`Error whe pre-checkig token: ${error2}`)
        }
        const tokensDetails: TokenDetails[] = tokensData.map((detailsInstance) => new TokenDetails(
            detailsInstance.contract_address, detailsInstance.name, detailsInstance.symbol, detailsInstance.decimals

        ));
        return tokensDetails
    } catch (e) {
        console.error("Could not perform smart contract registry lookup")
        throw new Error(`${e}`)
    }
}

async function dbTokensDetailsBySymbol(tokenSymbols: string[], supabaseClient: SupabaseClient): Promise<TokenDetails[]> {
    try {
        const uppercaseSymbols = tokenSymbols.map((symbol) => symbol.toUpperCase());
        const { data: tokensData, error: error2 } = await supabaseClient
            .from('crypto_list')
            .select('name,contract_address,symbol,decimals')
            .in('symbol', uppercaseSymbols);
        if (error2) {
            console.error("Error whe pre-checkig token")
            throw new Error(`Error whe pre-checkig token: ${error2}`)
        }
        const tokensDetails: TokenDetails[] = tokensData.map((detailsInstance) => new TokenDetails(
            detailsInstance.contract_address, detailsInstance.name, detailsInstance.symbol, detailsInstance.decimals

        ));
        return tokensDetails
    } catch (e) {
        console.error("Could not perform smart contract registry lookup")
        throw new Error(`${e}`)
    }
}

export async function insertTokenToRegistry(tokenDetails: TokenDetails, supabaseClient: SupabaseClient): Promise<boolean> {
    try {

        const { error } = await supabaseClient
            .from('crypto_list')
            .insert([
                {
                    symbol: tokenDetails.symbol,
                    contract_address: tokenDetails.contract_address,
                    name: tokenDetails.name,
                    decimals: tokenDetails.decimals.toString()
                },
            ])
            .select();
        if (error) {
            console.error("Token insertion Error:", error)
            return false
        }
        return true
    } catch (e) {
        console.error("Could not perform write operation for token")
        throw new Error(`${e}`);
    }
}

export async function startBot(ctx: Context, supabaseClient: SupabaseClient) {

    const message = WELCOME_MSG;
    const user = ctx.from;
    await ctx.reply(message);

    if (user) {
        if (!user.is_bot) {

            const wallet = await fetchUserWallet(user.id.toString(), supabaseClient);

            if (wallet != "") {
                await ctx.reply(`Already have wallet: ${wallet}. Welcome back!`)
                return
            }


            await ctx.reply("making trading wallet for trading on Sepolia Base testnet...")
            const userWallet = createWallet();
            if (userWallet) {
                const { error } = await supabaseClient
                    .from('crypto_wallets')
                    .insert([
                        {
                            public_address: userWallet.publicKey,
                            encrypted_pvt_key: userWallet.encryptedPvtKey.ciphertext,
                            iv: userWallet.encryptedPvtKey.iv,
                            auth_tag: userWallet.encryptedPvtKey.tag
                        },
                    ])
                    .select();
                if (error) {
                    console.log("stored wallet in db Error:", error);
                    throw new Error(`stored wallet in db Error: ${error}`)
                }

                const { error: error2 } = await supabaseClient
                    .from('users')
                    .insert([
                        {
                            user_id: user.id,
                            telegram_username: user.username,
                            wallet_address: userWallet.publicKey
                        }
                    ])
                    .select();
                if (error2) {
                    console.log("user not registered Error:", error);
                    throw new Error(`user not registered Error: ${error}`)
                }
                await ctx.reply(`Created new wallet at ${userWallet.publicKey}. Please keep it funded to carry out the trades.`);
            }

        } else return
    }
}

export async function registerToken(ctx: Context, supabaseClient: SupabaseClient) {
    try {
        if (!ctx.message?.text)
            throw ("")
        const input = ctx.message.text.split(" ")[1];
        console.log("address", input)
        if (!input) {
            return await ctx.reply("Please provide a token contract address, e.g. /registerToken 0x...");
        }
        const existingToken = await dbTokensDetailsByAddress([new TokenDetails(input)], supabaseClient);
        if (existingToken.length > 0) {
            await ctx.reply(`The token ${existingToken[0].name} already being tracked. Use /update to update your holdings`)
            return
        }
        const tokenDetails = await fetchTokenDetails(input);
        const successfulInsert = await insertTokenToRegistry(tokenDetails, supabaseClient);
        if (!successfulInsert)
            throw new Error("Token details not found")

        return await ctx.reply(
            `Token Info:\nName: ${tokenDetails.name}\nSymbol: ${tokenDetails.symbol}\nDecimals: ${tokenDetails.decimals}\nAddress: ${tokenDetails.contract_address} registered`
        );

    } catch (e) {
        console.error(e);
        await ctx.reply("Error fetching token info. Make sure the contract address is valid and on Sepolia Base.");
        return
    }
}

export async function checkPrice(ctx: Context, supabaseClient: SupabaseClient) {
    try {
        if (!ctx.message?.text)
            throw ("")
        const input = ctx.message.text.split(" ")[1].toUpperCase();
        await ctx.reply(`Looking for ${input} in token registry`);
        const { data: tokenData, error: error2 } = await supabaseClient
            .from('crypto_list')
            .select('name,contract_address,symbol,decimals')
            .eq('symbol', input);
        if (error2) {
            console.error("Error whe pre-checkig token")
            throw new Error(`Error whe pre-checkig token: ${error2}`)
        }
        if (tokenData.length == 0) {
            await ctx.reply(`Token not in registry. Register using "/registerToken contractAddress" to trade/track your holdings`);
        }
        const price = await fetchUSDPricesBySymbol([input]);
        if (price.length == 0) {
            await ctx.reply("Token not registered with Coingecko API");
            return
        }
        await ctx.reply(`${price[0].symbol} price is US$${price[0].price}\n
            Market cap: US$${price[0].market_cap}`);

    } catch (e) {
        console.error("Could not check current price of token", e)
        await ctx.reply(`Could not check current price of token: ${e}`);
        return
    }
}

export async function checkHoldings(ctx: Context, supabaseClient: SupabaseClient) {
    try {
        await ctx.reply("Fetching holdings in tracked tokens");
        if (!ctx.from)
            return
        const wallet = await fetchUserWallet(ctx.from.id.toString(), supabaseClient);
        const { data: holdings, error } = await supabaseClient
            .from('user_holdings')
            .select(`
                id,
                amount,
                crypto_list (
                  symbol
                )`)
            .eq('wallet_address', wallet);
        if (error || !holdings) {
            await ctx.reply("Error when querying holdings");
            throw new Error(`${error}`)
        }
        if (holdings.length == 0) {
            await ctx.reply("You have no holdings. Try /updateHoldings to update");
            return
        }
        const symbols = holdings.map((holding)=>holding.crypto_list[0].symbol)
        const prices = await fetchUSDPricesBySymbol(symbols);
        let op = 'Your last recorded token balances are as follows:';
        holdings?.map((holding, i) => {
            op.concat(`\n${holding.crypto_list[0].symbol}: ${holding.amount}; Price: ${prices[i].price} `);
        })
        await ctx.reply(op);
    } catch (e) {
        await ctx.reply(`Ran into an error when checking your holdings: ${e}`)
        return
    }
}

export async function updateHoldings(ctx: Context, supabaseClient: SupabaseClient) {
    try {
        await ctx.reply("Fetching all tracked tokens");
        if (!ctx.from)
            return
        const wallet = await fetchUserWallet(ctx.from.id.toString(), supabaseClient);
        const { data: tokensList, error: errorFromList } = await supabaseClient
            .from('crypto_list')
            .select('name,contract_address,symbol,decimals')
            .neq('symbol', 'ETH');
        if (errorFromList || !tokensList) {
            await ctx.reply("Error when querying holdings");
            throw new Error(`${errorFromList}`)
        }
        const holdings: { coin_address: string, wallet_address: string, amount: number }[] = []
        const userEthBalance = await fetchETHBalance(wallet)
        let op = 'Your token balances are as follows:';
        op += (`\nETH: ${userEthBalance}`);
        if (userEthBalance > 0) {
            holdings.push({
                coin_address: "0x0000000000000000000000000000000000000000",
                wallet_address: wallet,
                amount: userEthBalance
            })
        }
        const holdingsTokens = await fetchWalletBalaces(tokensList, wallet);
        holdingsTokens.map((holding) => {
            if (holding.balance > 0) {
                op += (`\n${holding.symbol}: ${holding.balance}`);
                const token = tokensList.find(t => t.symbol === holding.symbol);
                if (token) {
                    holdings.push({
                        coin_address: token.contract_address,
                        wallet_address: wallet,
                        amount: holding.balance,
                    });
                }
            }
        })

        const { error } = await supabaseClient
            .from('user_holdings')
            .upsert(holdings)
            .select();
        await ctx.reply(op);
    } catch (e) {
        await ctx.reply(`Ran into an error when checking your holdings: ${e}`)
        return
    }
}

export async function proposeSwap(ctx: Context, supabaseClient:SupabaseClient) {
    try {
        if (!ctx.message?.text)
            throw ("")
        const symbol1 = ctx.message.text.split(" ")[1].toUpperCase();
        const amountIn = parseFloat(ctx.message.text.split(" ")[2]);
        const symbol2 = ctx.message.text.split(" ")[3].toUpperCase();
        if(symbol1 == "ETH" || symbol2 == "ETH"){
            await ctx.reply("To Trade ETH, wrap first using WETH")
            return
        }
        await ctx.reply("Fetching token details")
        const tokensDetails = await dbTokensDetailsBySymbol([symbol1, symbol2], supabaseClient);
        const tokenIn = tokensDetails.find(t => t.symbol === symbol1);
        const tokenOut = tokensDetails.find(t => t.symbol === symbol2);
        if(!tokenIn)
            throw new Error(`${symbol1} is not registered. Please register first using /registerToken`)
        if(!tokenOut)
            throw new Error(`${symbol2} is not registered. Please register first using /registerToken`)
        const quote = await quoteSwap(tokenIn, tokenOut, amountIn.toString());
        await ctx.reply(`Quote: ${amountIn} ${symbol1} = ${quote} ${symbol2}`)

    } catch (e) {
        console.error(`Could not perform swap proposal: ${e}`)
        await ctx.reply(`Could not perform swap proposal: ${e}`);
    }
}

export async function executeSwap(ctx: Context, supabaseClient:SupabaseClient) {
    try {
        if (!ctx.message?.text)
            throw ("")
        const symbol1 = ctx.message.text.split(" ")[1].toUpperCase();
        const amountIn = parseFloat(ctx.message.text.split(" ")[2]);
        const symbol2 = ctx.message.text.split(" ")[3].toUpperCase();
        const { data: wallets, error } = await supabaseClient
            .from('users')
            .select(`
                wallet_address,
                crypto_wallets (
                  encrypted_pvt_key,
                  iv,
                  auth_tag
                )`)
            .eq('id', ctx.from?.id);
        if (error || !wallets) {
            await ctx.reply("Error when querying holdings");
            throw new Error(`${error}`)
        }
        if( wallets.length == 0){
            await ctx.reply("Wallet not found for user");
            throw new Error(`Wallet not found for user`)
        }
        const wallet = wallets[0].crypto_wallets[0];
        const userPvtKey = await decryptPrivateKey(wallet.encrypted_pvt_key, wallet.iv, wallet.auth_tag);
        if(symbol1 == "ETH" || symbol2 == "ETH"){
            await ctx.reply("To Trade ETH, wrap first using WETH")
            return
        }
        const tokensDetails = await dbTokensDetailsBySymbol([symbol1, symbol2], supabaseClient);
        const tokenIn = tokensDetails.find(t => t.symbol === symbol1);
        const tokenOut = tokensDetails.find(t => t.symbol === symbol2);
        if(!tokenIn)
            throw new Error(`${symbol1} is not registered. Please register first using /registerToken`)
        if(!tokenOut)
            throw new Error(`${symbol2} is not registered. Please register first using /registerToken`)
        
        const quote = await executeSwapOnChain(tokenIn, tokenOut,userPvtKey, amountIn.toString());
        await ctx.reply(`Swpped ${amountIn} ${symbol1} for ${quote} ${symbol2}`)
        await ctx.reply("Updating Holdings...");
        await updateHoldings(ctx, supabaseClient);

    } catch (e) {
        console.error(`Could not perform swap execution: ${e}`)
        await ctx.reply(`Could not perform swap execution: ${e}`);
    }
}

export async function replyMsg(ctx: Context) {
    await ctx.reply(WELCOME_MSG);
}