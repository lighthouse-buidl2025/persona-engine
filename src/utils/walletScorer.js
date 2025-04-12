// walletScorer.js
const fs = require('fs');
const path = require('path');
const { initDatabase, getAllWallets, upsertWallet, getWallet } = require('./db');

// === 포지션별 가중치 ===
const positionWeights = {
    Explorer: {
        distinct_contract_count: 4,
        dex_platform_diversity: 2,
        avg_token_holding_period: 0,
        transaction_frequency: 1,
        dex_volume_usd: 0,
        nft_collections_diversity: 3,
    },
    Diamond: {
        distinct_contract_count: 1,
        dex_platform_diversity: 1,
        avg_token_holding_period: 5,
        transaction_frequency: 0,
        dex_volume_usd: 1,
        nft_collections_diversity: 2,
    },
    Whale: {
        distinct_contract_count: 0,
        dex_platform_diversity: 0,
        avg_token_holding_period: 2,
        transaction_frequency: 1,
        dex_volume_usd: 5,
        nft_collections_diversity: 2,
    },
    Degen: {
        distinct_contract_count: 1,
        dex_platform_diversity: 4,
        avg_token_holding_period: 0,
        transaction_frequency: 3,
        dex_volume_usd: 2,
        nft_collections_diversity: 1,
    },
};

const metricKeys = [
    "distinct_contract_count",
    "dex_platform_diversity",
    "avg_token_holding_period",
    "transaction_frequency",
    "dex_volume_usd",
    "nft_collections_diversity",
];

// === Z-score 기반 정규화 도구 ===
function getStats(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const std = Math.sqrt(
        values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );
    return { mean, std };
}

function getZScore(value, mean, std) {
    if (std === 0) return 0;
    return (value - mean) / std;
}

function zToPercentile(z) {
    const cdf = 0.5 * (1 + erf(z / Math.sqrt(2)));
    return Math.round(cdf * 1000) / 10;
}

function erf(x) {
    const a1 = 0.254829592,
        a2 = -0.284496736,
        a3 = 1.421413741,
        a4 = -1.453152027,
        a5 = 1.061405429,
        p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    const absX = Math.abs(x);
    const t = 1 / (1 + p * absX);
    const y =
        1 -
        (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX));
    return sign * y;
}

// === 데이터베이스에서 지갑 데이터 가져오기 ===
async function getWalletDataFromDB() {
    try {
        const db = await initDatabase();
        const wallets = await getAllWallets(db);

        // 데이터베이스 연결 종료
        db.close(err => {
            if (err) console.error(`데이터베이스 연결 종료 오류: ${err.message}`);
        });

        return wallets;
    } catch (error) {
        console.error(`데이터베이스에서 지갑 데이터 가져오기 오류: ${error.message}`);
        throw error;
    }
}

// === 참조 통계 준비 ===
async function prepareReferenceStats() {
    try {
        const wallets = await getWalletDataFromDB();

        if (!wallets || wallets.length === 0) {
            throw new Error('통계 계산을 위한 지갑 데이터가 없습니다.');
        }

        const stats = {};
        for (const key of metricKeys) {
            // null 또는 undefined 값은 0으로 처리하여 통계에 포함
            const values = wallets.map(wallet => wallet[key] !== null && wallet[key] !== undefined ? wallet[key] : 0);
            stats[key] = getStats(values);
        }

        console.log(`${wallets.length}개의 지갑 데이터로 참조 통계를 준비했습니다.`);
        return stats;
    } catch (error) {
        console.error(`참조 통계 준비 중 오류: ${error.message}`);
        throw error;
    }
}

// === 새 지갑 평가 및 DB에 저장 ===
async function evaluateAndStoreWallet(wallet) {
    try {
        // 참조 통계 준비
        const stats = await prepareReferenceStats();

        // 지갑 평가
        const result = evaluateWallet(wallet, stats);

        // 평가 결과를 DB에 저장
        const db = await initDatabase();

        // 평가 결과를 포함하여 지갑 데이터 업데이트
        const walletDataWithScores = {
            ...wallet,
            explorer_score: result.scores.Explorer,
            diamond_score: result.scores.Diamond,
            whale_score: result.scores.Whale,
            degen_score: result.scores.Degen
        };

        await upsertWallet(db, walletDataWithScores);

        // 데이터베이스 연결 종료
        db.close(err => {
            if (err) console.error(`데이터베이스 연결 종료 오류: ${err.message}`);
        });

        return result;
    } catch (error) {
        console.error(`지갑 평가 및 저장 중 오류: ${error.message}`);
        throw error;
    }
}

// === 지갑 평가 ===
function evaluateWallet(wallet, stats) {
    const zScores = {};
    const percentiles = {};
    const percentileScores = {};

    for (const key of metricKeys) {
        const { mean, std } = stats[key];
        const value = wallet[key] !== null && wallet[key] !== undefined ? wallet[key] : 0;
        const z = getZScore(value, mean, std);
        const percentile = zToPercentile(z);
        zScores[key] = z;
        percentiles[key] = percentile;
        percentileScores[key] = Math.round((percentile / 100) * 5 * 10) / 10;
    }

    const scores = {};
    let maxScore = 0;
    let maxPosition = '';

    for (const position in positionWeights) {
        let score = 0;
        let totalWeight = 0;

        for (const key of metricKeys) {
            const weight = positionWeights[position][key] || 0;
            score += weight * (percentileScores[key] || 0);
            totalWeight += weight;
        }

        // 점수를 10점 만점으로 정규화
        const normalizedScore = totalWeight > 0 ? (score / (totalWeight * 5)) * 10 : 0;
        scores[position] = Math.round(normalizedScore * 10) / 10;

        // 최고 점수 포지션 기록
        if (scores[position] > maxScore) {
            maxScore = scores[position];
            maxPosition = position;
        }
    }

    return {
        ...wallet,
        scores,
        percentiles,
    };
}

// === 메인 실행 함수 ===
async function main() {
    try {
        const db = await initDatabase();
        // 참조 통계 준비
        const stats = await prepareReferenceStats();

        // 샘플 신규 지갑
        const newWallet = {
            address: "0x4da2d3f330f75458a7f4befe90f82921e318d0b8",
            balance: 100,
            distinct_contract_count: 15,
            dex_platform_diversity: 3,
            avg_token_holding_period: 150,
            transaction_frequency: 2.5,
            dex_volume_usd: 50000,
            nft_collections_diversity: 8,
        };

        // 지갑 평가 및 저장
        const result = await evaluateAndStoreWallet(newWallet);

        const wallet = await getWallet(db, "0x4da2d3f330f75458a7f4befe90f82921e318d0b8");
        console.log(wallet)

        console.log("🧠 새 지갑 평가 결과:");
        console.dir(result, { depth: null });
    } catch (error) {
        console.error(`메인 실행 중 오류: ${error.message}`);
    }
}

// 모듈 내보내기
module.exports = {
    prepareReferenceStats,
    evaluateWallet,
    evaluateAndStoreWallet,
    getWalletDataFromDB
};

// 직접 실행 시 메인 함수 호출
if (require.main === module) {
    main();
}