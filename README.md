# Trader Telegram Bot

Configured for Sepolia Base testnet blockchain
for encryption I have stored a central master key in env, but you would go for a key store solution like CloudHSM 

npm run clean → deletes the dist/ folder.
npm run build → runs the TypeScript compiler (tsc).
npm run rebuild → cleans and then builds.
npm run start → runs your compiled main file (bot.js) from dist/.

## Infra checklist:
[o] Supabase backend
[~] wallet generation
[x] swap interaction

## Bot usage

### Works
/start -> registers user or reminds the wallet address (intentionally no wallet import as not safe to ever give mnemonic/pvt key to a bot. Intermediary wallets better)
/registerToken 0xYourTokenAddress -> registers universally (not per user on purpose)

### TODO
/updateHoldings -> updates holdings of user as per registered tokens 
/checkPrice Symbol -> Fetches price of a token. If not exists in DB, registers it first
/checkHoldings -> Fetches holdings with price of each token
/proposeSwap Symbol1 Amount1 Symbol2 -> Checks how much token could be generated from swap of Symbol1 of Amount1 token against Symbol2
/executeSwap Symbol1 Amount1 Symbol2 -> Immediately attempts swap
/withdraw Symbol1 Amount1 -> Withdraw the tokens