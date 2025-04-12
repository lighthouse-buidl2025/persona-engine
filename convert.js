const fs = require('fs');
const path = require('path');
const { extractWalletParameters, fetchWalletData } = require('./src/controllers/walletController');

// 변환 대상 파일 경로와 저장할 파일 경로 설정
const walletsFilePath = path.join(__dirname, '../wallet-info/wallets.json');
const outputFilePath = path.join(__dirname, '../wallet-info/wallet_parameters.json');

// 지갑 데이터 파일 읽기
async function convertWalletData() {
    try {
        console.log('지갑 데이터 파일 읽는 중...');
        const walletsData = JSON.parse(fs.readFileSync(walletsFilePath, 'utf8'))["wallets"];

        const totalWallets = Object.keys(walletsData).length;
        console.log(`총 ${totalWallets}개의 지갑 데이터를 처리합니다.`);

        // 변환된 파라미터를 저장할 객체
        const walletParameters = {};

        // 진행 상황을 위한 카운터
        let processedCount = 0;

        // 각 지갑에 대해 파라미터 추출
        for (const [walletAddress, walletData] of Object.entries(walletsData)) {
            try {
                // 지갑 데이터에서 필요한 파라미터 추출
                const parameters = extractWalletParameters(walletData);

                // balance 정보 추가
                parameters.balance = walletData.balance;
                parameters.address = walletData.wallet;

                // 결과 객체에 추가
                walletParameters[walletData.wallet] = parameters;

                // 진행 상황 업데이트
                processedCount++;
                if (processedCount % 100 === 0 || processedCount === totalWallets) {
                    console.log(`${processedCount}/${totalWallets} 지갑 처리 완료 (${Math.round(processedCount / totalWallets * 100)}%)`);
                }
            } catch (error) {
                console.error(`지갑 ${walletAddress} 처리 중 오류: ${error.message}`);
                // 오류가 발생한 지갑은 건너뛰고 계속 진행
                continue;
            }
        }

        // 결과를 JSON 파일로 저장
        console.log('변환된 파라미터를 파일에 저장 중...');
        fs.writeFileSync(outputFilePath, JSON.stringify(walletParameters, null, 2));

        console.log(`모든 처리가 완료되었습니다. 결과가 ${outputFilePath}에 저장되었습니다.`);
    } catch (error) {
        console.error(`변환 과정에서 오류가 발생했습니다: ${error.message}`);
    }
}

// 함수 실행
convertWalletData()
    .then(() => console.log('프로그램 종료'))
    .catch(err => console.error('프로그램 실행 중 오류:', err));