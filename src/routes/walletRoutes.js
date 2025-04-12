const express = require("express");
const router = express.Router();
const { getWalletParameters, getOrFetchWalletParameters, getPopularContractsByPersonaGroup, getWalletLogs } = require("../controllers/walletController");

// 단일 지갑 분석 라우트
router.get('/persona-engine/update/:address', getWalletParameters);

// 새로운 라우트 (DB 캐싱 적용)
router.get('/persona-engine/wallet/:address', getOrFetchWalletParameters);

router.get('/persona-engine/wallet/:address', getOrFetchWalletParameters);

router.get('/persona-engine/logs/:address', getWalletLogs);

router.get('/persona-engine/category/:group', getPopularContractsByPersonaGroup);

// 나중에 필요한 추가 라우트를 여기에 정의할 수 있습니다

module.exports = router;
