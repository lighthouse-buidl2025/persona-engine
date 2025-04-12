const express = require("express");
const router = express.Router();
const { getWalletParameters, getOrFetchWalletParameters, getPopularContractsByPersonaGroup, getWalletLogs, getAverageMetricsByPersonaGroup } = require("../controllers/walletController");

// 단일 지갑 분석 라우트
router.get('/persona-engine/update/:address', getWalletParameters);

// 새로운 라우트 (DB 캐싱 적용)
router.get('/persona-engine/wallet/:address', getOrFetchWalletParameters);

router.get('/persona-engine/wallet/:address', getOrFetchWalletParameters);

router.get('/persona-engine/logs/:address', getWalletLogs);

router.get('/persona-engine/category/:group', getPopularContractsByPersonaGroup);

router.get('/persona-engine/average/:group', getAverageMetricsByPersonaGroup);

module.exports = router;
