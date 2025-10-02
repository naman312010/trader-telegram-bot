import { Context } from "grammy"
import { SupabaseClient } from '@supabase/supabase-js'
import { createWallet, fetchTokenDetails } from "./walletAndTokens";
import { getAddress } from "ethers";
import 'dotenv/config'

export async function startBot(ctx: Context, supabaseClient: SupabaseClient) {
    
    const message = `
👋 Welcome to **TraderBot**!

I can help you track tokens, holdings, prices, and even propose swaps safely through PancakeSwap v3. Here's a quick overview:

🔹 **Your Wallet:** You are registered with a secure intermediary wallet. *No private keys or mnemonics are ever requested.*  

🔹 **Available Commands:**
  • /registerToken <contract_address> – Register any token universally (not per user)  
  • /updateHoldings – Update your token holdings for registered tokens  
  • /checkPrice <symbol> – Get current price of a token (auto-registers if new)  
  • /checkHoldings – View your holdings with prices  
  • /proposeSwap <Symbol1> <Amount1> <Symbol2> – See what a swap would yield  
  • /executeSwap <Symbol1> <Amount1> <Symbol2> – Perform a token swap  
  • /withdraw <Symbol1> <Amount1> – Withdraw your tokens safely  

⚠️ **Safety Note:** Never share your private keys or seed phrases. Your funds remain secure with intermediary wallets.

Type any of the commands above to get started! 🚀
`;
    await ctx.reply(message, { parse_mode: "Markdown" });
    const user = ctx.from;
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
                    ctx.reply(`Already have wallet: ${users[0].wallet_address}. Welcome back!`)
                    return
                }
            }
            else {
                ctx.reply("making trading wallet for trading on Sepolia Base testnet...")
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
                    ctx.reply(`Created new wallet at ${userWallet.publicKey}. Please keep it funded to carry out the trades.`);
                }
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
            return ctx.reply("Please provide a token contract address, e.g. /registerToken 0x...");
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
                ctx.reply(`The token ${tokens[0].name} already being tracked. Use /update to update your holdings`)
                return
            }
        } else {

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
            return ctx.reply(
                `Token Info:\nName: ${tokenDetails.name}\nSymbol: ${tokenDetails.symbol}\nDecimals: ${tokenDetails.decimals}\nAddress: ${tokenDetails.address} registered`
            );
        }
    } catch (e) {
        console.error(e);
        return ctx.reply("Error fetching token info. Make sure the contract address is valid and on Sepolia Base.");
    }
}

export async function replyMsg(ctx: Context) {
    ctx.reply("Got another message!")
}