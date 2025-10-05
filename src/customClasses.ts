import { getAddress } from "ethers";

export class TokenDetails {
    contract_address: string;
    name: string;
    symbol: string;
    decimals: number;

    constructor(address: string,
        name?: string,
        symbol?: string,
        decimals?: number) {
        this.contract_address = getAddress(address);
        this.name = name ? name : "";
        this.symbol = symbol ? symbol.toUpperCase() : "";
        this.decimals = decimals ? decimals : 0;
    }
}

export class PriceEntry {
    symbol: string;
    price: number;
    market_cap: number;

    constructor(symbol: string, price: number, market_cap: number){
        this.symbol = symbol.toUpperCase();
        this.price = price;
        this.market_cap = market_cap;
    }   
}

export class WalletEntry {
    symbol: string;
    balance: number;

    constructor(symbol: string, balance: number){
        this.symbol = symbol.toUpperCase();
        this.balance = balance;
    }
}