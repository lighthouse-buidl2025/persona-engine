const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { evaluateWallet, prepareReferenceStats, metricKeys } = require('./walletScorer');

// 데이터베이스 경로 설정
const dbPath = path.join(__dirname, '../../wallet_data.db');


// JSON 파일 경로 설정
const walletParametersPath = path.join(__dirname, '../../wallet_parameters.json');
const walletsPath = path.join(__dirname, '../../wallets.json');

const stableCoins = [
    "0xdac17f958d2ee523a2206206994597c13d831ec7",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
];
/**
 * 페르소나-컨트랙트 테이블 생성
 * @param {Object} db - SQLite 데이터베이스 연결 객체
 * @returns {Promise<void>}
 */
function createPersonaContractTable(db) {
    return new Promise((resolve, reject) => {
        db.run(`CREATE TABLE IF NOT EXISTS persona_contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_group TEXT NOT NULL,
            to_contract TEXT NOT NULL
        )`, (err) => {
            if (err) {
                console.log(`테이블 생성 오류: ${err.message}`)
                reject(`테이블 생성 오류: ${err.message}`);
                return;
            }

            console.log('persona_contracts 테이블이 생성되었습니다.');

            // from_group 인덱스 생성
            db.run(`CREATE INDEX IF NOT EXISTS idx_persona_contracts_from_group 
                    ON persona_contracts(from_group)`, (err) => {
                if (err) {
                    reject(`인덱스 생성 오류: ${err.message}`);
                    return;
                }

                console.log('from_group 인덱스가 생성되었습니다.');
                resolve();
            });
        });
    });
}

/**
 * 데이터베이스 초기화
 * @returns {Promise<Object>} - SQLite 데이터베이스 연결 객체
 */
function initPersonaContractDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(dbPath, async (err) => {
            if (err) {
                reject(`데이터베이스 연결 오류: ${err.message}`);
                return;
            }

            console.log('SQLite 데이터베이스에 연결되었습니다.');

            try {
                // 테이블 생성
                await createPersonaContractTable(db);
                resolve(db);
            } catch (error) {
                reject(error);
            }
        });
    });
}

/**
 * 페르소나 그룹과 컨트랙트 관계 추가 또는 카운트 증가
 * @param {Object} db - SQLite 데이터베이스 연결 객체
 * @param {string} fromGroup - 페르소나 그룹 (예: "Explorer_Whale")
 * @param {string} toContract - 컨트랙트 주소
 * @returns {Promise<Object>} - 처리 결과
 */
function insertPersonaContract(db, fromGroup, toContract) {
    return new Promise((resolve, reject) => {
        if (!fromGroup || !toContract) {
            reject('그룹과 컨트랙트 주소가 모두 필요합니다.');
            return;
        }

        // 새로운 데이터 삽입
        const stmt = db.prepare(`
            INSERT INTO persona_contracts (from_group, to_contract)
            VALUES (?, ?)
        `);

        stmt.run(fromGroup, toContract, function (err) {
            stmt.finalize();

            if (err) {
                reject(`데이터 저장 오류: ${err.message}`);
                return;
            }

            resolve({
                id: this.lastID,
                changes: this.changes
            });
        });
    });
}

/**
 * 페르소나 그룹별 인기 컨트랙트 조회
 * @param {Object} db - SQLite 데이터베이스 연결 객체
 * @param {string} fromGroup - 페르소나 그룹 (예: "Explorer_Whale")
 * @param {number} limit - 조회할 컨트랙트 수 제한 (기본값: 10)
 * @returns {Promise<Array>} - 인기 컨트랙트 목록
 */
function getPopularContractsByGroup(db, fromGroup, limit = 1) {
    return new Promise((resolve, reject) => {
        if (!fromGroup) {
            reject('그룹 정보가 필요합니다.');
            return;
        }

        const query = `
            SELECT to_contract as contract_address, COUNT(*) as frequency
            FROM persona_contracts
            WHERE from_group = ?
            GROUP BY to_contract
            ORDER BY frequency DESC
            LIMIT ?
        `;

        db.all(query, [fromGroup, limit], (err, rows) => {
            if (err) {
                reject(`조회 오류: ${err.message}`);
                return;
            }

            resolve(rows);
        });
    });
}

/**
 * 테이블 데이터 초기화
 * @param {Object} db - SQLite 데이터베이스 연결 객체
 * @returns {Promise<void>}
 */
function clearPersonaContractTable(db) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM persona_contracts', (err) => {
            if (err) {
                reject(`테이블 초기화 오류: ${err.message}`);
                return;
            }

            console.log('persona_contracts 테이블이 초기화되었습니다.');
            resolve();
        });
    });
}

/**
 * 지갑 데이터를 읽고 그룹을 계산하여 DB에 삽입
 * @returns {Promise<void>}
 */
async function processWalletData() {
    try {
        // JSON 파일 읽기
        const walletParameters = JSON.parse(fs.readFileSync(walletParametersPath, 'utf8'));
        const wallets = JSON.parse(fs.readFileSync(walletsPath, 'utf8'))["wallets"];


        // 데이터베이스 초기화
        const db = await initPersonaContractDatabase();

        // clearPersonaContractTable(db);
        // ["Explorer", "Diamond", "Whale", "Degen"].forEach(group => {
        //     ["Explorer", "Diamond", "Whale", "Degen"].forEach(group2 => {
        //         if (group !== group2) {
        //             getPopularContractsByGroup(db, `${group}_${group2}`, 3).then(console.log)
        //         }
        //     })
        // })

        // return;

        // 각 지갑별 고유 값 확인을 위한 로그
        console.log("지갑별 고유 값 확인:");
        for (const wallet of wallets) {
            if (walletParameters[wallet.wallet]) {
                walletParameters[wallet.wallet]["transactions"] = wallet.transactions;
            }
        }

        // 참조 통계를 한 번만 준비
        const stats = await prepareReferenceStats();

        // stats 객체 로그
        console.log("참조 통계 값:");
        for (const key of Object.keys(stats)) {
            console.log(`${key}: mean=${stats[key].mean}, std=${stats[key].std}`);
        }

        for (const wallet of Object.values(walletParameters)) {
            console.log(`처리 중인 지갑: ${wallet.wallet || wallet.address}`);

            // 지갑이 필요한 모든 속성을 가지고 있는지 확인
            const walletWithDefaults = { ...wallet };
            for (const key of metricKeys) {
                if (walletWithDefaults[key] === undefined || walletWithDefaults[key] === null) {
                    console.log(`지갑에 ${key} 값이 없어 기본값 0으로 설정합니다.`);
                    walletWithDefaults[key] = 0;
                }
            }

            // 지갑 평가
            const result = evaluateWallet(walletWithDefaults, stats);

            // 그룹 ID 생성
            const scores = [
                { name: 'Explorer', value: result.scores.Explorer },
                { name: 'Diamond', value: result.scores.Diamond },
                { name: 'Whale', value: result.scores.Whale },
                { name: 'Degen', value: result.scores.Degen }
            ];

            // 점수를 내림차순으로 정렬
            scores.sort((a, b) => b.value - a.value);
            const groupId = `${scores[0].name}_${scores[1].name}`;

            // 데이터베이스에 삽입
            if (wallet["transactions"] && Array.isArray(wallet["transactions"])) {
                // 중복을 제거하기 위한 Set 사용
                const uniqueContracts = new Set();

                // 각 트랜잭션에서 contract_address 수집
                for (const tx of wallet["transactions"]) {
                    if (tx.contract_address && tx.method !== "transfer" && !stableCoins.includes(tx.contract_address)) {
                        uniqueContracts.add(tx.contract_address);
                    }
                }

                // 고유한 contract_address만 삽입
                for (const contractAddress of uniqueContracts) {
                    await insertPersonaContract(db, groupId, contractAddress);
                }

                console.log(`지갑 ${wallet.wallet || wallet.address}에서 ${uniqueContracts.size}개의 고유 컨트랙트 주소를 삽입했습니다.`);
            } else {
                console.log(`지갑 ${wallet.wallet || wallet.address}에 트랜잭션 데이터가 없거나 배열이 아닙니다.`);
            }

            await insertPersonaContract(db, groupId, wallet.address);
        }

        // 데이터베이스 연결 종료
        db.close(err => {
            if (err) console.error(`데이터베이스 연결 종료 오류: ${err.message}`);
        });

        console.log('지갑 데이터 처리가 완료되었습니다.');
    } catch (error) {
        console.error(`지갑 데이터 처리 중 오류: ${error.message}`);
        // 스택 트레이스 출력
        console.error(error.stack);
    }
}

// processWalletData();

module.exports = {
    initPersonaContractDatabase,
    insertPersonaContract,
    getPopularContractsByGroup,
    clearPersonaContractTable,
    processWalletData
}; 