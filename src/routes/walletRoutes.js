const express = require("express");
const router = express.Router();
const { analyzeWallet } = require("../controllers/walletController");

// 단일 지갑 분석 라우트
router.get("/wallet/:address", analyzeWallet);

// 나중에 필요한 추가 라우트를 여기에 정의할 수 있습니다

module.exports = router;
