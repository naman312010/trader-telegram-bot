import { Bot } from "grammy"
import { startBot, replyMsg, registerToken } from "./botFunctions";
import * as dotenv from "dotenv";
dotenv.config();
import { createClient } from '@supabase/supabase-js'

if(!process.env.TELEGRAM_BOT_TOKEN || !process.env.SUPABASE_ENDPOINT || !process.env.SUPABASE_SECRET_KEY)
    throw new Error("Env parameters missing")

const supabaseUrl = process.env.SUPABASE_ENDPOINT
const supabaseKey = process.env.SUPABASE_SECRET_KEY
const supabaseClient = createClient(supabaseUrl, supabaseKey)
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);

// Handle the /start command.
bot.command("start",async (ctx) => await startBot(ctx, supabaseClient));

// Middleware to block bots
bot.use(async (ctx, next) => {
  if (ctx.from?.is_bot) {
    console.log(`Blocked bot: ${ctx.from.username}`);
    return; // stop processing
  }
  await next();
});

//register token
bot.command("registerToken",async (ctx) => await registerToken(ctx, supabaseClient));

// Handle other messages.
bot.on("message", (ctx) => replyMsg(ctx));


// Start the bot.
bot.start();