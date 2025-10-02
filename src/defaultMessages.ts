export const WELCOME_MSG = `
👋 Welcome to TraderBot!

I can help you track tokens, holdings, prices, and propose swaps safely through PancakeSwap v3 on Sepolia Base Testnet.


🔹 Available Commands:
  • /start - See this message and your registered wallet again
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