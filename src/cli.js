#!/usr/bin/env node
require("dotenv").config();
const fs = require("fs");

// 각 분석 함수들은 controllers/walletController.js에서 가져옵니다
const walletController = require("./controllers/walletController");

/**
 * 단일 지갑 주소에 대한 데이터 수집 및 저장
 * @param {string} address - 이더리움 지갑 주소
 * @returns {Promise<Object>} - 지갑 분석 결과
 */
async function processSingleWallet(address) {
  try {
    // 지갑 정보 분석 모듈 호출
    const result = await walletController.getWalletInfo(address);

    // 결과 저장
    const outputFile = `${result.wallet}_wallet_data.json`;
    fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));

    console.log(`분석 완료! 결과가 ${outputFile}에 저장되었습니다.`);
    return result;
  } catch (error) {
    console.error(`주소 ${address} 처리 중 오류 발생: ${error.message}`);
    return null;
  }
}

/**
 * 메인 함수 - 명령줄 인자 처리
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log("사용법: node cli.js <지갑주소>");
    process.exit(1);
  }

  const address = args[0];
  processSingleWallet(address)
    .then(() => {
      console.log("작업이 완료되었습니다.");
    })
    .catch((error) => {
      console.error("오류가 발생했습니다:", error.message);
      process.exit(1);
    });
}

// 스크립트가 직접 실행될 때만 main 함수 호출
if (require.main === module) {
  main();
}

module.exports = { processSingleWallet };
