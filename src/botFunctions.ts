import { Context } from "grammy"
import { SupabaseClient } from '@supabase/supabase-js'
import { createWallet, fetchTokenDetails } from "./walletAndTokens";
import { getAddress } from "ethers";
import 'dotenv/config'

export async function startBot(ctx: Context, supabaseClient: SupabaseClient) {

    const message = `
👋 Welcome to TraderBot!

I can help you track tokens, holdings, prices, and propose swaps safely through PancakeSwap v3 on Sepolia Base Testnet.


🔹 Available Commands:
  • /registerToken CONTRACT_ADDRESS - Register any token universally (not per user)
  • /updateHoldings - Update your token holdings (TODO)
  • /checkPrice SYMBOL - Get current price of a token (auto-registers if new) (TODO)
  • /checkHoldings - View your holdings with prices (TODO)
  • /proposeSwap SYMBOL1 AMOUNT1 SYMBOL2 - See what a swap would yield (TODO)
  • /executeSwap SYMBOL1 AMOUNT1 SYMBOL2 - Perform a token swap (TODO)
  • /withdraw SYMBOL1 AMOUNT1 - Withdraw your tokens safely (TODO)

⚠️ Safety Note: Never share your private keys or seed phrases. Your funds remain secure with intermediary wallets.

Type any of the commands after getting wallet confirmation to get started 🚀
`;
    const user = ctx.from;
    await ctx.reply(message);
    
    if (user) {
        if (!user.is_bot) {

            let { data: users, error } = await supabaseClient
                .from('users')
                .select('wallet_address')
                .eq('user_id', user.id);
            if (error) {
                console.error("Error when checking pre-existing user in supabase")
                throw new Error("Error when checking pre-existing user in supabase")
            }
            if (users) {
                if (users.length > 0) {
                    await ctx.reply(`Already have wallet: ${users[0].wallet_address}. Welcome back!`)
                    return
                }
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
        const addressInput = ctx.message.text.split(" ")[1];
        const input = getAddress(addressInput)
        console.log("address", input)
        if (!input) {
            return await ctx.reply("Please provide a token contract address, e.g. /registerToken 0x...");
        }
        const { data: tokens, error: error2 } = await supabaseClient
            .from('crypto_list')
            .select('name')
            .eq('contract_address', input);
        if (error2) {
            console.error("Error whe pre-checkig token")
            throw new Error(`Error whe pre-checkig token: ${error2}`)
        }
        if (tokens) {
            if (tokens.length > 0) {
                await ctx.reply(`The token ${tokens[0].name} already being tracked. Use /update to update your holdings`)
                return
            }
        } 

            const tokenDetails = await fetchTokenDetails(input);
            if (!tokenDetails.name)
                throw new Error("Token details not found")
            const { error } = await supabaseClient
                .from('crypto_list')
                .insert([
                    {
                        symbol: tokenDetails.symbol,
                        contract_address: tokenDetails.address,
                        name: tokenDetails.name,
                        decimals: tokenDetails.decimals.toString()
                    },
                ])
                .select();
            if (error) {
                console.error("Token insertion Error:", error)
                throw ("token insertion failed")
            }
            return await ctx.reply(
                `Token Info:\nName: ${tokenDetails.name}\nSymbol: ${tokenDetails.symbol}\nDecimals: ${tokenDetails.decimals}\nAddress: ${tokenDetails.address} registered`
            );
        
    } catch (e) {
        console.error(e);
        return await ctx.reply("Error fetching token info. Make sure the contract address is valid and on Sepolia Base.");
    }
}

export async function replyMsg(ctx: Context) {
    await ctx.reply("Got another message!")
}