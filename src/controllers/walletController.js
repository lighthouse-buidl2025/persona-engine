const fs = require("fs");
const path = require("path");
const Web3 = require("web3");
const axios = require("axios");
const moment = require("moment");
const { runQuery } = require("../utils/bitqueryApi");
const { initDatabase, getWallet, upsertWallet } = require("../utils/db");
const { evaluateAndStoreWallet } = require("../utils/walletScorer");

// 환경 변수에서 API 키 가져오기
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
let keys = ALCHEMY_API_KEY.split(",");

/**
 * 이더리움 잔액 조회 (Etherscan)
 * @param {string} address - 이더리움 지갑 주소
 * @param {number} retryCount - 재시도 횟수 (기본값: 3)
 * @returns {Promise<number>} - 잔액 (wei 단위)
 */
async function getWalletBalance(address, retryCount = 3) {
  try {
    const balanceUrl = `https://api.etherscan.io/api?module=account&action=balance&address=${address}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;
    const balanceRes = await axios.get(balanceUrl);
    return parseInt(balanceRes.data.result || 0);
  } catch (error) {
    console.error(`잔액 조회 중 오류: ${error.message}`);
    if (retryCount > 0) {
      console.log(`잔액 조회 재시도 중... (남은 시도: ${retryCount - 1})`);
      return getWalletBalance(address, retryCount - 1);
    }
    return 0;
  }
}

/**
 * 최근 6개월 트랜잭션 분석 (Etherscan)
 * @param {string} address - 이더리움 지갑 주소
 * @param {number} retryCount - 재시도 횟수 (기본값: 3)
 * @returns {Promise<Object>} - {transactions: Array, recentTxCount: number}
 */
async function getRecentTransactions(address, retryCount = 3) {
  try {
    const txUrl = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const txRes = await axios.get(txUrl);
    const txs = txRes.data.result || [];

    // 최근 6개월 트랜잭션 필터링
    const sixMonthsAgo = moment().subtract(6, "months").unix();
    const recentTxs = txs.filter(
      (tx) => parseInt(tx.timeStamp || 0) > sixMonthsAgo
    );

    // 트랜잭션 메서드 및 컨트랙트 주소 추출 (중복 제거)
    const txData = new Set();
    recentTxs.forEach((tx) => {
      if (tx.input !== "0x" && tx.to) {
        // 컨트랙트 호출인 경우
        // 메서드 ID는 input의 처음 10자리 (0x + 8자리)
        const methodId = tx.input.slice(0, 10);
        const contractAddress = tx.to;
        txData.add(
          JSON.stringify({
            method: methodId,
            contract_address: contractAddress,
          })
        );
      }
    });

    // 트랜잭션 정보를 배열로 변환
    const transactions = Array.from(txData).map((item) => JSON.parse(item));

    return {
      transactions,
      recentTxCount: recentTxs.length,
    };
  } catch (error) {
    console.error(`최근 트랜잭션 분석 중 오류: ${error.message}`);
    if (retryCount > 0) {
      console.log(`트랜잭션 분석 재시도 중... (남은 시도: ${retryCount - 1})`);
      return getRecentTransactions(address, retryCount - 1);
    }
    return { transactions: [], recentTxCount: 0 };
  }
}

/**
 * 토큰 트랜잭션 및 스테이블코인 사용 여부 분석 (Etherscan)
 * @param {string} address - 이더리움 지갑 주소
 * @param {number} retryCount - 재시도 횟수 (기본값: 3)
 * @returns {Promise<Object>} - {useStable: boolean, tokenCount: number}
 */
async function analyzeTokenActivity(address, retryCount = 3) {
  try {
    const tokenUrl = `https://api.etherscan.io/api?module=account&action=tokentx&address=${address}&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    const tokenRes = await axios.get(tokenUrl);
    const tokenTxs = tokenRes.data.result || [];

    // 스테이블코인 리스트
    const stablecoins = ["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDP", "GUSD"];

    // 스테이블코인 사용 여부 체크
    let useStable = false;
    const tokenSet = new Set();

    tokenTxs.forEach((tx) => {
      const tokenSymbol = tx.tokenSymbol;
      tokenSet.add(tokenSymbol);
      if (stablecoins.includes(tokenSymbol)) {
        useStable = true;
      }
    });

    return {
      useStable,
      tokenCount: tokenSet.size,
    };
  } catch (error) {
    console.error(`토큰 활동 분석 중 오류: ${error.message}`);
    if (retryCount > 0) {
      console.log(`토큰 활동 분석 재시도 중... (남은 시도: ${retryCount - 1})`);
      return analyzeTokenActivity(address, retryCount - 1);
    }
    return { useStable: false, tokenCount: 0 };
  }
}

/**
 * 지갑 데이터 수집 및 분석 (CLI용)
 * @param {string} address - 이더리움 지갑 주소
 * @param {number} retryCount - 재시도 횟수 (기본값: 3)
 * @returns {Promise<Object>} - 지갑 분석 결과 객체
 */
async function getWalletInfo(address, retryCount = 3) {
  try {
    // 주소 형식 검증 및 체크섬 적용
    const web3 = new Web3();
    const checksumAddress = web3.utils.toChecksumAddress(address);

    console.log(`주소 ${checksumAddress} 분석 중...`);

    // 1. 지갑 기본 정보 조회
    const balance = await getWalletBalance(checksumAddress);

    // 2. 최근 트랜잭션 정보 조회
    const { transactions, recentTxCount } = await getRecentTransactions(
      checksumAddress
    );

    // 3. 토큰 활동 분석
    const { useStable, tokenCount } = await analyzeTokenActivity(
      checksumAddress
    );

    // 4. 분석 함수 호출
    const [transactionData, nftData, ftData, dexData] = await Promise.all([
      analyzeTransactions(checksumAddress),
      getNftHoldings(checksumAddress),
      analyzeTokenHoldings(checksumAddress),
      analyzeDexTransactions(checksumAddress),
    ]);

    // 최종 결과 생성
    return {
      wallet: checksumAddress,
      balance: balance,
      use_stable: useStable,
      tokens_count: tokenCount,
      recent_transactions_count: recentTxCount,
      transactions: transactions,
      Transaction: transactionData,
      NFT: nftData,
      FT: ftData,
      DEX: dexData,
    };
  } catch (error) {
    console.error(`지갑 정보 수집 중 오류: ${error.message}`);
    if (retryCount > 0) {
      console.log(`지갑 정보 수집 재시도 중... (남은 시도: ${retryCount - 1})`);
      return getWalletInfo(address, retryCount - 1);
    }
    throw new Error(`지갑 정보 수집 실패: ${error.message}`);
  }
}

/**
 * 트랜잭션 정보 분석 (Etherscan)
 * @param {string} address - 이더리움 지갑 주소
 * @param {number} retryCount - 재시도 횟수 (기본값: 3)
 * @returns {Promise<Object>} - 트랜잭션 분석 결과
 */
async function analyzeTransactions(address, retryCount = 3) {
  try {
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${address}&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await axios.get(url);
    const txs = response.data.result || [];

    // 에러 케이스 처리
    if (!txs || !txs.length) {
      return { 오류: "거래 내역이 없습니다." };
    }

    if (typeof txs === "string" && txs.includes("Error")) {
      return { 오류: txs };
    }

    if (typeof txs === "object" && txs.isError) {
      return { 오류: "트랜잭션 에러가 발생했습니다." };
    }

    // 데이터 분석
    const timestamps = txs.map((tx) => parseInt(tx.timeStamp));
    const gasFees = txs.map(
      (tx) => (parseInt(tx.gasUsed) * parseInt(tx.gasPrice)) / 1e18
    );
    const hours = timestamps.map((ts) => new Date(ts * 1000).getHours());

    // 트랜잭션 간격 계산
    const intervals = [];
    for (let i = 0; i < timestamps.length - 1; i++) {
      intervals.push(timestamps[i + 1] - timestamps[i]);
    }

    // 가장 활동적인 시간대 찾기
    const hourCounts = {};
    hours.forEach((hour) => {
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    let mostActiveHour = 0;
    let maxCount = 0;
    for (const [hour, count] of Object.entries(hourCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostActiveHour = parseInt(hour);
      }
    }

    return {
      total_transactions: txs.length,
      average_gas_fee_eth: round(average(gasFees), 6),
      total_gas_fee_eth: round(sum(gasFees), 6),
      max_gas_fee_eth: round(Math.max(...gasFees), 6),
      most_active_hour: mostActiveHour,
      average_transaction_interval_days: round(
        intervals.length ? average(intervals) / 86400 : 0,
        2
      ),
    };
  } catch (error) {
    console.error(`트랜잭션 분석 중 오류: ${error.message}`);
    if (retryCount > 0) {
      console.log(`트랜잭션 분석 재시도 중... (남은 시도: ${retryCount - 1})`);
      return analyzeTransactions(address, retryCount - 1);
    }
    return { 오류: `데이터 처리 중 오류 발생: ${error.message}` };
  }
}

/**
 * NFT 보유 정보 분석 (Alchemy)
 * @param {string} address - 이더리움 지갑 주소
 * @param {number} retryCount - 재시도 횟수 (기본값: 3)
 * @returns {Promise<Object>} - NFT 보유 정보
 */
async function getNftHoldings(address, retryCount = 3) {
  keys = keys.slice(1).concat(keys.slice(0, 1));

  try {
    const url = `https://eth-mainnet.g.alchemy.com/nft/v2/${keys[0]}/getNFTs?owner=${address}`;
    const response = await axios.get(url);
    const ownedNfts = response.data.ownedNfts || [];

    // NFT 컬렉션 정보 추출
    const collections = new Set();
    let total = 0;

    ownedNfts.forEach((nft) => {
      const contract = nft.contractMetadata || {};
      total += parseInt(nft.balance || 0);

      const symbol = contract.symbol;
      if (symbol) {
        collections.add(symbol);
      }
    });

    return {
      owned_nfts_count: total,
      owned_nft_collections_count: collections.size,
      owned_nft_collections: Array.from(collections),
    };
  } catch (error) {
    console.error(`NFT 정보 분석 중 오류: ${error.message}`);
    // API 키 로테이션 후 재시도
    if (retryCount > 0) {
      console.log(`NFT 정보 분석 재시도 중... (남은 시도: ${retryCount - 1})`);
      // 다른 API 키로 다시 시도하기 위해 키 로테이션
      keys = keys.slice(1).concat(keys.slice(0, 1));
      return getNftHoldings(address, retryCount - 1);
    }
    return { 오류: `NFT 데이터 처리 중 오류 발생: ${error.message}` };
  }
}

/**
 * FT(ERC-20) 보유 정보 분석 (Etherscan)
 * @param {string} address - 이더리움 지갑 주소
 * @param {number} retryCount - 재시도 횟수 (기본값: 3)
 * @returns {Promise<Object>} - 토큰 보유 정보
 */
async function analyzeTokenHoldings(address, retryCount = 3) {
  try {
    const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${address}&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    const response = await axios.get(url);
    const txs = response.data.result || [];

    if (!txs || !txs.length) {
      return { 오류: "토큰 거래 내역이 없습니다." };
    }

    // 토큰별 정보 분석
    const tokenData = {};
    const currentTime = moment().unix();

    txs.forEach((tx) => {
      const tokenSymbol = tx.tokenSymbol;
      const tokenAddress = tx.contractAddress;
      const timestamp = parseInt(tx.timeStamp);
      const value = parseInt(tx.value) / 10 ** parseInt(tx.tokenDecimal || 18);
      const toAddress = tx.to.toLowerCase();
      const fromAddress = tx.from.toLowerCase();

      const key = `${tokenSymbol}_${tokenAddress}`;

      if (!tokenData[key]) {
        tokenData[key] = {
          symbol: tokenSymbol,
          address: tokenAddress,
          first_in: null,
          last_in: null,
          total_in: 0,
          total_out: 0,
          current_balance: 0,
        };
      }

      // 입금 (받은 토큰)
      if (toAddress === address.toLowerCase()) {
        tokenData[key].total_in += value;
        if (
          tokenData[key].first_in === null ||
          timestamp < tokenData[key].first_in
        ) {
          tokenData[key].first_in = timestamp;
        }
        if (
          tokenData[key].last_in === null ||
          timestamp > tokenData[key].last_in
        ) {
          tokenData[key].last_in = timestamp;
        }
        tokenData[key].current_balance += value;
      }

      // 출금 (보낸 토큰)
      if (fromAddress === address.toLowerCase()) {
        tokenData[key].total_out += value;
        tokenData[key].current_balance -= value;
      }
    });

    // 결과 가공
    const result = [];
    for (const key in tokenData) {
      const data = tokenData[key];
      // 보유 중인 토큰만 계산 (잔액이 있는 경우)
      if (data.current_balance > 0) {
        // 최초 획득 시점부터 현재까지의 보유 기간(일)
        const holdingPeriod = (currentTime - data.first_in) / 86400;

        result.push({
          token: data.symbol,
          balance: round(data.current_balance, 6),
          holding_period_days: round(holdingPeriod, 2),
          net_flow: round(data.total_in - data.total_out, 6),
        });
      }
    }

    // 보유 기간 내림차순으로 정렬
    result.sort((a, b) => b.holding_period_days - a.holding_period_days);

    return {
      token_count: result.length,
      token_details: result,
    };
  } catch (error) {
    console.error(`토큰 정보 분석 중 오류: ${error.message}`);
    if (retryCount > 0) {
      console.log(`토큰 정보 분석 재시도 중... (남은 시도: ${retryCount - 1})`);
      return analyzeTokenHoldings(address, retryCount - 1);
    }
    return { 오류: `토큰 데이터 처리 중 오류 발생: ${error.message}` };
  }
}

/**
 * DEX 거래량 분석 (Bitquery)
 * @param {string} address - 이더리움 지갑 주소
 * @param {number} retryCount - 재시도 횟수 (기본값: 3)
 * @returns {Promise<Object>} - DEX 거래 정보
 */
async function analyzeDexTransactions(address, retryCount = 3) {
  try {
    // SimpleDexTrades 쿼리 정의
    const query = `
    {
      ethereum(network: ethereum) {
        dexTrades(
          txSender: {is: "${address}"},
          options: {limit: 200}
        ) {
          transaction {
            hash
          }
          exchange {
            name
          }
          tradeAmount(in: USD)
          block {
            timestamp {
              time
            }
          }
        }
      }
    }`;

    // 쿼리 실행
    const result = await runQuery(query);

    // 결과에서 dexTrades 데이터 추출
    const trades = result?.data?.ethereum?.dexTrades || [];

    if (!trades.length) {
      return {
        dex_volume_usd: 0,
        dex_count: 0,
        dex_list: [],
      };
    }

    // 총 거래량 계산
    const totalTradeAmount = trades.reduce((sum, trade) => {
      return sum + parseFloat(trade.tradeAmount || 0);
    }, 0);

    // 거래한 DEX 목록 추출 (중복 제거)
    const usedDex = new Set();
    trades.forEach((trade) => {
      const exchangeName = trade.exchange?.name;
      if (exchangeName) {
        usedDex.add(exchangeName);
      }
    });

    return {
      dex_volume_usd: round(totalTradeAmount, 2),
      dex_count: usedDex.size,
      dex_list: Array.from(usedDex),
    };
  } catch (error) {
    console.error(`DEX 거래 분석 중 오류: ${error.message}`);
    if (retryCount > 0) {
      console.log(`DEX 거래 분석 재시도 중... (남은 시도: ${retryCount - 1})`);
      return analyzeDexTransactions(address, retryCount - 1);
    }
    return { 오류: `DEX 데이터 처리 중 오류 발생: ${error.message}` };
  }
}

/**
 * 지갑 분석 메인 컨트롤러 함수
 * @param {object} req - Express 요청 객체
 * @param {object} res - Express 응답 객체
 * @returns {Promise<void>}
 */
async function analyzeWallet(req, res) {
  const { address } = req.params;

  if (!address) {
    return res.status(400).json({ error: "지갑 주소가 필요합니다." });
  }

  try {
    // 주소 형식 검증 및 체크섬 적용
    const web3 = new Web3();
    const checksumAddress = web3.utils.toChecksumAddress(address);

    console.log(`주소 ${checksumAddress} 분석 중...`);

    // 지갑 기본 정보 조회
    const balanceUrl = `https://api.etherscan.io/api?module=account&action=balance&address=${checksumAddress}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;
    const balanceRes = await axios.get(balanceUrl);
    const balance = parseInt(balanceRes.data.result || 0);

    // 트랜잭션 데이터 조회
    const txUrl = `https://api.etherscan.io/api?module=account&action=txlist&address=${checksumAddress}&startblock=0&endblock=99999999&sort=desc&apikey=${ETHERSCAN_API_KEY}`;
    const txRes = await axios.get(txUrl);
    const txs = txRes.data.result || [];

    // 최근 6개월 트랜잭션 필터링
    const sixMonthsAgo = moment().subtract(6, "months").unix();
    const recentTxs = txs.filter(
      (tx) => parseInt(tx.timeStamp || 0) > sixMonthsAgo
    );

    // 트랜잭션 메서드 및 컨트랙트 주소 추출 (중복 제거)
    const txData = new Set();
    recentTxs.forEach((tx) => {
      if (tx.input !== "0x" && tx.to) {
        // 컨트랙트 호출인 경우
        // 메서드 ID는 input의 처음 10자리 (0x + 8자리)
        const methodId = tx.input.slice(0, 10);
        const contractAddress = tx.to;
        txData.add(
          JSON.stringify({
            method: methodId,
            contract_address: contractAddress,
          })
        );
      }
    });

    // 트랜잭션 정보를 배열로 변환
    const transactions = Array.from(txData).map((item) => JSON.parse(item));

    // 토큰 정보 조회 - 스테이블코인 사용 여부 확인
    const tokenUrl = `https://api.etherscan.io/api?module=account&action=tokentx&address=${checksumAddress}&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
    const tokenRes = await axios.get(tokenUrl);
    const tokenTxs = tokenRes.data.result || [];

    // 스테이블코인 리스트
    const stablecoins = ["USDT", "USDC", "DAI", "BUSD", "TUSD", "USDP", "GUSD"];

    // 스테이블코인 사용 여부 체크
    let useStable = false;
    const tokenSet = new Set();

    tokenTxs.forEach((tx) => {
      const tokenSymbol = tx.tokenSymbol;
      tokenSet.add(tokenSymbol);
      if (stablecoins.includes(tokenSymbol)) {
        useStable = true;
      }
    });

    // 분석 함수 호출 결과 저장 변수
    let transactionData = { 오류: "데이터를 가져오지 못했습니다." };
    let nftData = { 오류: "데이터를 가져오지 못했습니다." };
    let ftData = { 오류: "데이터를 가져오지 못했습니다." };
    let dexData = { 오류: "데이터를 가져오지 못했습니다." };

    // 각 모듈 개별적으로 실행하여 오류 발생 시에도 다른 모듈은 계속 실행되도록 함
    try {
      transactionData = await analyzeTransactions(checksumAddress);
    } catch (err) {
      console.error(`트랜잭션 분석 모듈 오류: ${err.message}`);
    }

    try {
      nftData = await getNftHoldings(checksumAddress);
    } catch (err) {
      console.error(`NFT 분석 모듈 오류: ${err.message}`);
    }

    try {
      ftData = await analyzeTokenHoldings(checksumAddress);
    } catch (err) {
      console.error(`토큰 분석 모듈 오류: ${err.message}`);
    }

    try {
      dexData = await analyzeDexTransactions(checksumAddress);
    } catch (err) {
      console.error(`DEX 분석 모듈 오류: ${err.message}`);
    }

    // 최종 결과 생성
    const result = {
      wallet: checksumAddress,
      balance: balance,
      use_stable: useStable,
      tokens_count: tokenSet.size,
      recent_transactions_count: recentTxs.length,
      transactions: transactions,
      Transaction: transactionData,
      NFT: nftData,
      FT: ftData,
      DEX: dexData,
    };

    // 결과 응답
    return res.status(200).json(result);
  } catch (error) {
    console.error(`지갑 분석 중 오류 발생: ${error.message}`);
    return res
      .status(500)
      .json({ error: `지갑 분석 중 오류 발생: ${error.message}` });
  }
}

/**
 * 지갑 정보를 크롤링하여 반환하는 함수
 * @param {string} address - 이더리움 지갑 주소
 * @returns {Promise<Object>} - 지갑 분석 결과 객체
 */
async function fetchWalletData(address) {
  try {
    const checksumAddress = new Web3().utils.toChecksumAddress(address);

    // 1. 지갑 기본 정보 조회
    const balance = await getWalletBalance(checksumAddress);

    // 2. 최근 트랜잭션 정보 조회
    const { transactions, recentTxCount } = await getRecentTransactions(checksumAddress);

    // 3. 토큰 활동 분석
    const { useStable, tokenCount } = await analyzeTokenActivity(checksumAddress);

    // 4. 분석 함수 호출
    const [transactionData, nftData, ftData, dexData] = await Promise.all([
      analyzeTransactions(checksumAddress),
      getNftHoldings(checksumAddress),
      analyzeTokenHoldings(checksumAddress),
      analyzeDexTransactions(checksumAddress),
    ]);

    return {
      wallet: checksumAddress,
      balance,
      use_stable: useStable,
      tokens_count: tokenCount,
      recent_transactions_count: recentTxCount,
      transactions,
      Transaction: transactionData,
      NFT: nftData,
      FT: ftData,
      DEX: dexData,
    };
  } catch (error) {
    console.error(`지갑 정보 수집 중 오류: ${error.message}`);
    throw new Error(`지갑 정보 수집 실패: ${error.message}`);
  }
}

/**
 * 지갑 데이터를 기반으로 필요한 파라미터를 추출하는 함수
 * @param {Object} walletData - 지갑 데이터 객체
 * @returns {Object} - 추출된 파라미터
 */
function extractWalletParameters(walletData) {
  const distinctContractCount = new Set(walletData.transactions.map(tx => tx.contract_address)).size;
  const dexPlatformDiversity = walletData.DEX.dex_list.length;
  const avgTokenHoldingPeriod = walletData.FT.token_details.reduce((sum, token) => sum + token.holding_period_days, 0) / walletData.FT.token_count;
  const transactionFrequency = walletData.Transaction.total_transactions / walletData.recent_transactions_count;
  const dexVolumeUsd = walletData.DEX.dex_volume_usd;
  const nftCollectionsDiversity = walletData.NFT.owned_nft_collections_count;

  return {
    address: walletData.wallet,
    distinct_contract_count: distinctContractCount,
    dex_platform_diversity: dexPlatformDiversity,
    avg_token_holding_period: avgTokenHoldingPeriod,
    transaction_frequency: transactionFrequency,
    dex_volume_usd: dexVolumeUsd,
    nft_collections_diversity: nftCollectionsDiversity,
    balance: walletData.balance
  };
}

/**
 * 지갑 주소에 대한 파라미터를 추출하여 응답하는 함수
 * @param {object} req - Express 요청 객체
 * @param {object} res - Express 응답 객체
 * @param {object} db - 데이터베이스 연결 객체 (선택 사항)
 * @param {boolean} returnResult - 결과를 반환할지 여부 (선택 사항)
 * @returns {Promise<Object|void>} - returnResult가 true인 경우 결과 객체 반환
 */
async function getWalletParameters(req, res, db = null, returnResult = false) {
  const { address } = req.params;

  if (!address) {
    if (returnResult) return { error: "지갑 주소가 필요합니다.", status: 400 };
    return res.status(400).json({ error: "지갑 주소가 필요합니다." });
  }

  let shouldCloseDb = false;

  try {
    // 지갑 데이터 가져오기
    const walletData = await fetchWalletData(address);

    // 파라미터 추출
    const parameters = extractWalletParameters(walletData);

    // 현재 시간 (created_at, updated_at용)
    const currentTime = new Date().toISOString().replace('T', ' ').substring(0, 19);

    // 결과 객체
    const walletInfo = {
      address: address,
      balance: walletData.balance,
      distinct_contract_count: parameters.distinct_contract_count,
      dex_platform_diversity: parameters.dex_platform_diversity,
      avg_token_holding_period: parameters.avg_token_holding_period,
      transaction_frequency: parameters.transaction_frequency,
      dex_volume_usd: parameters.dex_volume_usd,
      nft_collections_diversity: parameters.nft_collections_diversity,
      explorer_score: 0,
      diamond_score: 0,
      whale_score: 0,
      degen_score: 0,
      distinct_contract_count_percentile: 0,
      dex_platform_diversity_percentile: 0,
      avg_token_holding_period_percentile: 0,
      transaction_frequency_percentile: 0,
      dex_volume_usd_percentile: 0,
      nft_collections_diversity_percentile: 0,
      created_at: currentTime,
      updated_at: currentTime
    };



    try {
      // 지갑 평가 및 점수 계산 (walletScorer.js의 함수 사용)
      const evaluatedWallet = await evaluateAndStoreWallet({
        address,
        ...parameters
      });

      // 평가 결과를 반환 객체에 포함
      walletInfo.explorer_score = evaluatedWallet.scores.Explorer;
      walletInfo.diamond_score = evaluatedWallet.scores.Diamond;
      walletInfo.whale_score = evaluatedWallet.scores.Whale;
      walletInfo.degen_score = evaluatedWallet.scores.Degen;
      walletInfo.position = evaluatedWallet.position;

      // percentile 정보 추가
      walletInfo.distinct_contract_count_percentile = evaluatedWallet.percentiles.distinct_contract_count;
      walletInfo.dex_platform_diversity_percentile = evaluatedWallet.percentiles.dex_platform_diversity;
      walletInfo.avg_token_holding_period_percentile = evaluatedWallet.percentiles.avg_token_holding_period;
      walletInfo.transaction_frequency_percentile = evaluatedWallet.percentiles.transaction_frequency;
      walletInfo.dex_volume_usd_percentile = evaluatedWallet.percentiles.dex_volume_usd;
      walletInfo.nft_collections_diversity_percentile = evaluatedWallet.percentiles.nft_collections_diversity;

      console.log(`지갑 정보가 성공적으로 평가되었습니다: ${address}`);
    } catch (evaluationError) {
      console.error(`지갑 평가 중 오류 발생: ${evaluationError.message}`);
    }
    finally {
      // 평가에 실패하더라도 기본 정보는 저장
      try {
        // DB 연결이 제공되지 않은 경우 새로 연결
        db = await initDatabase();
        shouldCloseDb = true;
        console.log(db)
        await upsertWallet(db, walletInfo);
        console.log(`기본 지갑 정보가 DB에 저장되었습니다: ${address}`);
      } catch (dbError) {
        console.error(`DB 저장 중 오류 발생: ${dbError.message}`);
      }
    }

    // 최종 응답 객체 구성
    const responseData = {
      wallet: walletInfo
    };

    // returnResult가 true인 경우 결과 반환, 그렇지 않으면 응답
    if (returnResult) {
      return { success: true, data: responseData, status: 200 };
    } else {
      // 성공적인 응답
      return res.status(200).json(
        { success: true, data: responseData, status: 200 }
      );
    }
  } catch (error) {
    console.error(`지갑 파라미터 분석 중 오류 발생: ${error.message}`);

    if (returnResult) {
      return { success: false, message: `지갑 파라미터 분석 중 오류 발생: ${error.message}`, status: 500 };
    } else {
      return res.status(500).json({ success: false, message: `지갑 파라미터 분석 중 오류 발생: ${error.message}` });
    }
  } finally {
    // 함수 내에서 생성한 DB 연결이 있다면 종료
    if (shouldCloseDb && db) {
      shouldCloseDb = false;
      db.close(err => {
        if (err) console.error(`DB 연결 종료 오류: ${err.message}`);
      });
    }
  }
}

/**
 * 지갑 정보를 DB에서 조회하거나 없으면 크롤링해서 저장 후 반환
 * @param {object} req - Express 요청 객체
 * @param {object} res - Express 응답 객체
 * @returns {Promise<void>}
 */
async function getOrFetchWalletParameters(req, res) {
  const { address } = req.params;

  if (!address) {
    return res.status(400).json({ error: "지갑 주소가 필요합니다." });
  }

  let db;
  try {
    // 데이터베이스 연결
    db = await initDatabase();

    // DB에서 지갑 정보 검색
    const wallet = await getWallet(db, address);

    // 1. DB에 지갑 정보가 있는 경우
    if (wallet) {
      console.log(`DB에서 지갑 정보를 찾았습니다: ${address}`);
      return res.status(200).json({
        success: true,
        data: {
          wallet
        }
      });
    }

    // 2. DB에 지갑 정보가 없는 경우
    console.log(`DB에 없는 지갑입니다. 크롤링을 시작합니다: ${address}`);

    // getWalletParameters 함수를 호출하여 파라미터 가져오기
    const result = await getWalletParameters(
      { params: { address } }, // req 객체 형태로 전달
      {}, // 빈 res 객체 (사용하지 않음)
      db, // DB 연결 객체 전달
      true // 결과 반환 플래그
    );

    // 오류가 발생한 경우
    if (!result.success) {
      return res.status(result.status).json(result);
    }

    // 결과가 성공적으로 반환된 경우 (이미 DB에 저장됨)
    return res.status(200).json(result);

  } catch (error) {
    console.error(`지갑 정보 처리 중 오류 발생: ${error.message}`);
    return res.status(500).json({ success: false, message: `지갑 정보 처리 중 오류 발생: ${error.message}` });
  } finally {
    // 데이터베이스 연결 종료
    if (db) {
      db.close((err) => {
        if (err) {
          console.error(`데이터베이스 연결 종료 오류: ${err.message}`);
        }
      });
    }
  }
}

/**
 * 배열의 평균값 계산
 * @param {Array<number>} arr - 숫자 배열
 * @returns {number} - 평균값
 */
function average(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * 배열의 합계 계산
 * @param {Array<number>} arr - 숫자 배열
 * @returns {number} - 합계
 */
function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

/**
 * 소수점 자릿수 반올림
 * @param {number} num - 숫자
 * @param {number} decimals - 소수점 자릿수
 * @returns {number} - 반올림된 숫자
 */
function round(num, decimals) {
  return Number(Math.round(num + "e" + decimals) + "e-" + decimals);
}

module.exports = {
  analyzeWallet,
  analyzeTransactions,
  getNftHoldings,
  analyzeTokenHoldings,
  analyzeDexTransactions,
  getWalletInfo,
  getWalletBalance,
  getRecentTransactions,
  analyzeTokenActivity,
  extractWalletParameters,
  getWalletParameters,
  getOrFetchWalletParameters
};
