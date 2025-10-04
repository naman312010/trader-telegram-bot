-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.confirm_crypto_transactions (
  id uuid NOT NULL,
  date date NOT NULL,
  symbol character varying NOT NULL,
  amount numeric NOT NULL,
  price_usd double precision NOT NULL,
  order_type character varying NOT NULL,
  telegram_username character varying,
  CONSTRAINT confirm_crypto_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT confirm_crypto_transactions_symbol_fkey FOREIGN KEY (symbol) REFERENCES public.crypto_list(symbol),
  CONSTRAINT confirm_crypto_transactions_telegram_username_fkey FOREIGN KEY (telegram_username) REFERENCES public.users(telegram_username)
);
CREATE TABLE public.crypto_list (
  symbol character varying NOT NULL,
  contract_address character varying NOT NULL UNIQUE,
  name text NOT NULL,
  decimals smallint NOT NULL,
  CONSTRAINT crypto_list_pkey PRIMARY KEY (symbol)
);
CREATE TABLE public.crypto_wallets (
  public_address character varying NOT NULL,
  encrypted_pvt_key character varying NOT NULL UNIQUE,
  iv character varying NOT NULL,
  auth_tag character varying NOT NULL,
  CONSTRAINT crypto_wallets_pkey PRIMARY KEY (public_address)
);
CREATE TABLE public.pending_crypto_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  date date NOT NULL,
  symbol character varying NOT NULL,
  amount numeric NOT NULL,
  price_usd double precision NOT NULL,
  order_type character varying NOT NULL,
  telegram_username character varying NOT NULL,
  CONSTRAINT pending_crypto_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT pending_crypto_transactions_symbol_fkey FOREIGN KEY (symbol) REFERENCES public.crypto_list(symbol),
  CONSTRAINT pending_crypto_transactions_telegram_username_fkey FOREIGN KEY (telegram_username) REFERENCES public.users(telegram_username)
);
CREATE TABLE public.user_holdings (
  wallet_address character varying NOT NULL DEFAULT ''::character varying,
  coin_address character varying NOT NULL,
  amount numeric,
  CONSTRAINT user_holdings_pkey PRIMARY KEY (wallet_address, coin_address),
  CONSTRAINT user_holdings_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.users(wallet_address),
  CONSTRAINT user_holdings_coin_address_fkey FOREIGN KEY (coin_address) REFERENCES public.crypto_list(contract_address)
);
CREATE TABLE public.users (
  user_id character varying NOT NULL UNIQUE,
  wallet_address character varying NOT NULL UNIQUE,
  telegram_username character varying NOT NULL UNIQUE,
  CONSTRAINT users_pkey PRIMARY KEY (user_id),
  CONSTRAINT users_wallet_address_fkey FOREIGN KEY (wallet_address) REFERENCES public.crypto_wallets(public_address)
);