import { Bot } from "grammy"
import { startBot, replyMsg, insertTokenToRegistry, registerToken, checkPrice, checkHoldings, updateHoldings, proposeSwap, executeSwap } from "./botFunctions";
import * as dotenv from "dotenv";
dotenv.config();
import { createClient } from '@supabase/supabase-js'
import { TokenDetails } from "./customClasses";
import { limit } from "@grammyjs/ratelimiter";

if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.SUPABASE_ENDPOINT || !process.env.SUPABASE_SECRET_KEY)
  throw new Error("Env parameters missing")

const supabaseUrl = process.env.SUPABASE_ENDPOINT
const supabaseKey = process.env.SUPABASE_SECRET_KEY
const supabaseClient = createClient(supabaseUrl, supabaseKey)
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

insertTokenToRegistry(new TokenDetails(
  "0x0000000000000000000000000000000000000000",
  "Ether",
  "ETH",
  18
), supabaseClient);

// Handle the /start command.
bot.command("start", async (ctx) => await startBot(ctx, supabaseClient));

bot.use(limit());
// Middleware to block bots
bot.use(async (ctx, next) => {
  if (ctx.from?.is_bot) {
    console.log(`Blocked bot: ${ctx.from.username}`);
    return; // stop processing
  }
  await next();
});

//register token
bot.command("registerToken", async (ctx) => await registerToken(ctx, supabaseClient));

//check token's USD value
bot.command("checkPrice", async (ctx) => await checkPrice(ctx, supabaseClient));

//check registered token's balance
bot.command("checkHoldings", async (ctx) => await checkHoldings(ctx, supabaseClient));

//update registered token's balances for the user
bot.command("updateHoldings", async (ctx) => await updateHoldings(ctx, supabaseClient));

//fetches swap quote
bot.command("proposeSwap", async (ctx) => await proposeSwap(ctx, supabaseClient));

//fetches swap quote
bot.command("executeSwap", async (ctx) => await executeSwap(ctx, supabaseClient));

// Handle other messages.
bot.on("message", (ctx) => replyMsg(ctx));


// Start the bot.
bot.start();