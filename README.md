# Ethereum Wallet Analysis API

This project provides a REST API that analyzes Ethereum wallet addresses and returns various insights, including activity scoring. It's a JavaScript version converted from Python.

---

## Features

- Analyze transaction data of Ethereum wallets
- Retrieve NFT holding information
- Analyze ERC-20 token holdings
- Track DEX trading volume
- Analyze wallet metadata
- Evaluate and score wallet personas (Explorer, Diamond, Whale, Degen)
- Cache and update wallet data

---

## Installation

First, install the required packages:

```
npm install
```

---

## Environment Variables

Create a `.env` file and add the following:

```
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
ALCHEMY_API_KEY=YOUR_ALCHEMY_API_KEY
BITQUERY_API_KEYS=YOUR_BITQUERY_API_KEY1,YOUR_BITQUERY_API_KEY2
BITQUERY_API_URL=https://graphql.bitquery.io/
PORT=8021
```

---

## How to Use

### Start the API Server

```
npm start
```

### Run in Development Mode

(Automatically restarts on code changes):

```
npm run start
```

---

## API Endpoints

### 1. Analyze Wallet in Real-Time

```
GET /api/persona-engine/update/:address
```

Analyzes the specified Ethereum address and updates the data in real-time.

---

### 2. Retrieve Cached Wallet Data

```
GET /api/persona-engine/wallet/:address
```

Returns analysis using cached data.

---

## API Response Structure

```
{
  "success": true,
  "data": {
    "wallet": {
      "address": "0x...",
      "balance": 6.24e18,
      "distinct_contract_count": 9,
      "dex_platform_diversity": 2,
      "avg_token_holding_period": 292.81,
      "transaction_frequency": 1.95,
      "dex_volume_usd": 17426451.01,
      "nft_collections_diversity": 25,
      "explorer_score": 3.3,
      "diamond_score": 3.6,
      "whale_score": 4.4,
      "degen_score": 3.5,
      "distinct_contract_count_percentile": 20.3,
      "dex_platform_diversity_percentile": 29.9,
      "avg_token_holding_period_percentile": 30.9,
      "transaction_frequency_percentile": 30.7,
      "dex_volume_usd_percentile": 48.8,
      "nft_collections_diversity_percentile": 53.4,
      "created_at": "2025-04-12 01:07:16",
      "updated_at": "2025-04-12 01:07:16"
    }
  },
  "status": 200
}
```

---

### 3. Get Popular Contracts by Persona Group

```
GET /api/persona-engine/category/:group
```

Returns the most frequently interacted contracts by a specific persona group.

- `group`: Persona group name (e.g., `Explorer_Whale`, `Diamond_Degen`)
- `limit`: Optional. Number of contracts to return. Default: 3

**Example:**

`/api/persona-engine/category/Whale_Diamond?limit=3`

### Response Example:

```
{
  "success": true,
  "data": {
    "contracts": [
      {
        "contract_address": "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
        "frequency": 245
      },
      {
        "contract_address": "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
        "frequency": 189
      },
      {
        "contract_address": "0x6b175474e89094c44da98b954eedeac495271d0f",
        "frequency": 156
      }
    ]
  },
  "status": 200
}
```

---

## CLI Mode

You can also analyze a wallet from the command line and save the result:

```
node src/cli.js 0xYourEthereumAddress
```

---

## Tech Stack

- Node.js
- Express.js
- Web3.js
- Axios
- Moment.js
- MongoDB (for caching wallet data)
