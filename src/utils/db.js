const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// 데이터베이스 경로 설정
const dbPath = path.join(__dirname, '../../wallet_data.db');
const walletParamsPath = path.join(__dirname, '../../wallet_parameters.json');

// SQLite3 데이터베이스 생성 및 테이블 초기화
function initDatabase() {
    return new Promise((resolve, reject) => {
        // 데이터베이스 연결
        const db = new sqlite3.Database(dbPath, (err) => {
            if (err) {
                reject(`데이터베이스 연결 오류: ${err.message}`);
                return;
            }
            console.log('SQLite 데이터베이스에 연결되었습니다.');

            // 테이블 생성
            db.run(`CREATE TABLE IF NOT EXISTS wallets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    address TEXT UNIQUE,
                    balance REAL,
                    distinct_contract_count INTEGER,
                    dex_platform_diversity INTEGER,
                    avg_token_holding_period REAL,
                    transaction_frequency REAL,
                    dex_volume_usd REAL,
                    nft_collections_diversity INTEGER,
                    
                    explorer_score REAL DEFAULT 0,
                    diamond_score REAL DEFAULT 0,
                    whale_score REAL DEFAULT 0,
                    degen_score REAL DEFAULT 0,
                    
                    distinct_contract_count_percentile REAL DEFAULT 0,
                    dex_platform_diversity_percentile REAL DEFAULT 0,
                    avg_token_holding_period_percentile REAL DEFAULT 0,
                    transaction_frequency_percentile REAL DEFAULT 0,
                    dex_volume_usd_percentile REAL DEFAULT 0,
                    nft_collections_diversity_percentile REAL DEFAULT 0,
                    
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )`, (err) => {
                if (err) {
                    db.close();
                    reject(`테이블 생성 오류: ${err.message}`);
                    return;
                }

                console.log('wallets 테이블이 생성되었습니다.');
                resolve(db);
            });
        });
    });
}

// JSON 파일에서 지갑 데이터 읽기
function readWalletData() {
    try {
        const data = fs.readFileSync(walletParamsPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error(`지갑 데이터 읽기 오류: ${error.message}`);
        throw error;
    }
}

// 지갑 데이터를 데이터베이스에 삽입
// 지갑 데이터를 데이터베이스에 삽입
function insertWalletData(db, walletData) {
    return new Promise((resolve, reject) => {
        // 트랜잭션 시작
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');

            const stmt = db.prepare(`
        INSERT INTO wallets 
        (address, balance, distinct_contract_count, dex_platform_diversity, 
         avg_token_holding_period, transaction_frequency, dex_volume_usd, 
         nft_collections_diversity, 
         explorer_score, diamond_score, whale_score, degen_score,
         distinct_contract_count_percentile, dex_platform_diversity_percentile,
         avg_token_holding_period_percentile, transaction_frequency_percentile,
         dex_volume_usd_percentile, nft_collections_diversity_percentile,
         updated_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(address) DO UPDATE SET
          balance = excluded.balance,
          distinct_contract_count = excluded.distinct_contract_count,
          dex_platform_diversity = excluded.dex_platform_diversity,
          avg_token_holding_period = excluded.avg_token_holding_period,
          transaction_frequency = excluded.transaction_frequency,
          dex_volume_usd = excluded.dex_volume_usd,
          nft_collections_diversity = excluded.nft_collections_diversity,
          explorer_score = excluded.explorer_score,
          diamond_score = excluded.diamond_score,
          whale_score = excluded.whale_score,
          degen_score = excluded.degen_score,
          distinct_contract_count_percentile = excluded.distinct_contract_count_percentile,
          dex_platform_diversity_percentile = excluded.dex_platform_diversity_percentile,
          avg_token_holding_period_percentile = excluded.avg_token_holding_period_percentile,
          transaction_frequency_percentile = excluded.transaction_frequency_percentile,
          dex_volume_usd_percentile = excluded.dex_volume_usd_percentile,
          nft_collections_diversity_percentile = excluded.nft_collections_diversity_percentile,
          updated_at = CURRENT_TIMESTAMP
      `);

            let insertCount = 0;
            let errorCount = 0;

            // 각 지갑 데이터 순회하며 삽입
            for (const [address, wallet] of Object.entries(walletData)) {
                try {
                    stmt.run(
                        wallet.address || address,
                        wallet.balance || 0,
                        wallet.distinct_contract_count || 0,
                        wallet.dex_platform_diversity || 0,
                        wallet.avg_token_holding_period || 0,
                        wallet.transaction_frequency || 0,
                        wallet.dex_volume_usd || 0,
                        wallet.nft_collections_diversity || 0,
                        wallet.explorer_score || 0,
                        wallet.diamond_score || 0,
                        wallet.whale_score || 0,
                        wallet.degen_score || 0,
                        wallet.distinct_contract_count_percentile || 0,
                        wallet.dex_platform_diversity_percentile || 0,
                        wallet.avg_token_holding_period_percentile || 0,
                        wallet.transaction_frequency_percentile || 0,
                        wallet.dex_volume_usd_percentile || 0,
                        wallet.nft_collections_diversity_percentile || 0,
                        function (err) {
                            if (err) {
                                console.error(`지갑 ${address} 삽입 오류: ${err.message}`);
                                errorCount++;
                            } else {
                                insertCount++;
                            }
                        }
                    );
                } catch (error) {
                    console.error(`지갑 ${address} 처리 중 오류: ${error.message}`);
                    errorCount++;
                }
            }

            stmt.finalize();

            db.run('COMMIT', (err) => {
                if (err) {
                    console.error(`트랜잭션 커밋 오류: ${err.message}`);
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                }

                console.log(`지갑 데이터 삽입 완료: ${insertCount}개 성공, ${errorCount}개 실패`);
                resolve({ insertCount, errorCount });
            });
        });
    });
}

// 데이터베이스 통계 조회
function getDBStats(db) {
    return new Promise((resolve, reject) => {
        db.get('SELECT COUNT(*) as count FROM wallets', (err, row) => {
            if (err) {
                reject(`통계 조회 오류: ${err.message}`);
                return;
            }

            console.log(`총 ${row.count}개의 지갑 정보가 데이터베이스에 저장되었습니다.`);
            resolve(row.count);
        });
    });
}

// 테이블의 모든 지갑 조회
function getAllWallets(db) {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM wallets ORDER BY updated_at DESC`, (err, rows) => {
            if (err) {
                reject(`지갑 조회 오류: ${err.message}`);
                return;
            }

            console.log(`${rows.length}개의 지갑 정보를 조회했습니다.`);
            resolve(rows);
        });
    });
}

// 단일 지갑 조회
function getWallet(db, address) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM wallets WHERE address = ?`, [address], (err, row) => {
            if (err) {
                reject(`지갑 조회 오류: ${err.message}`);
                return;
            }

            if (!row) {
                console.log(`주소가 ${address}인 지갑을 찾을 수 없습니다.`);
                resolve(null);
                return;
            }

            console.log(`주소가 ${address}인 지갑 정보를 조회했습니다.`);
            resolve(row);
        });
    });
}

/**
 * 지갑 데이터를 주소 기준으로 업데이트하거나 삽입 (upsert)
 * @param {Object} db - SQLite 데이터베이스 연결 객체
 * @param {Object} walletData - 지갑 데이터 객체
 * @returns {Promise<Object>} - 처리 결과 (id, changes)
 */
function upsertWallet(db, walletData) {
    return new Promise((resolve, reject) => {
        const {
            address,
            balance = 0,
            distinct_contract_count = 0,
            dex_platform_diversity = 0,
            avg_token_holding_period = 0,
            transaction_frequency = 0,
            dex_volume_usd = 0,
            nft_collections_diversity = 0,

            explorer_score = 0,
            diamond_score = 0,
            whale_score = 0,
            degen_score = 0,

            distinct_contract_count_percentile = 0,
            dex_platform_diversity_percentile = 0,
            avg_token_holding_period_percentile = 0,
            transaction_frequency_percentile = 0,
            dex_volume_usd_percentile = 0,
            nft_collections_diversity_percentile = 0
        } = walletData;

        if (!address) {
            reject('지갑 주소가 필요합니다.');
            return;
        }

        // SQLite의 UPSERT 구문 사용 (INSERT OR REPLACE)
        const stmt = db.prepare(`
      INSERT INTO wallets 
      (address, balance, distinct_contract_count, dex_platform_diversity, 
       avg_token_holding_period, transaction_frequency, dex_volume_usd, 
       nft_collections_diversity, 
       explorer_score, diamond_score, whale_score, degen_score,
       distinct_contract_count_percentile, dex_platform_diversity_percentile,
       avg_token_holding_period_percentile, transaction_frequency_percentile,
       dex_volume_usd_percentile, nft_collections_diversity_percentile,
       updated_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(address) DO UPDATE SET
        balance = excluded.balance,
        distinct_contract_count = excluded.distinct_contract_count,
        dex_platform_diversity = excluded.dex_platform_diversity,
        avg_token_holding_period = excluded.avg_token_holding_period,
        transaction_frequency = excluded.transaction_frequency,
        dex_volume_usd = excluded.dex_volume_usd,
        nft_collections_diversity = excluded.nft_collections_diversity,
        explorer_score = excluded.explorer_score,
        diamond_score = excluded.diamond_score,
        whale_score = excluded.whale_score,
        degen_score = excluded.degen_score,
        distinct_contract_count_percentile = excluded.distinct_contract_count_percentile,
        dex_platform_diversity_percentile = excluded.dex_platform_diversity_percentile,
        avg_token_holding_period_percentile = excluded.avg_token_holding_period_percentile,
        transaction_frequency_percentile = excluded.transaction_frequency_percentile,
        dex_volume_usd_percentile = excluded.dex_volume_usd_percentile,
        nft_collections_diversity_percentile = excluded.nft_collections_diversity_percentile,
        updated_at = CURRENT_TIMESTAMP
    `);

        stmt.run(
            address,
            balance,
            distinct_contract_count,
            dex_platform_diversity,
            avg_token_holding_period,
            transaction_frequency,
            dex_volume_usd,
            nft_collections_diversity,
            explorer_score,
            diamond_score,
            whale_score,
            degen_score,
            distinct_contract_count_percentile,
            dex_platform_diversity_percentile,
            avg_token_holding_period_percentile,
            transaction_frequency_percentile,
            dex_volume_usd_percentile,
            nft_collections_diversity_percentile,
            function (err) {
                stmt.finalize();

                if (err) {
                    reject(`지갑 ${address} 업데이트/삽입 오류: ${err.message}`);
                    return;
                }

                // this.changes가 0이면 변경된 내용이 없음을 의미 (이미 같은 데이터가 있는 경우)
                const action = this.changes > 0 ? (
                    this.lastID ? '삽입' : '업데이트'
                ) : '변경 없음';

                console.log(`지갑 ${address} 정보가 ${action} 되었습니다.`);
                resolve({
                    id: this.lastID,
                    changes: this.changes,
                    action
                });
            }
        );
    });
}


// 메인 함수
async function main() {
    let db;

    try {
        // 데이터베이스 초기화
        db = await initDatabase();

        // 지갑 데이터 읽기
        const walletData = readWalletData();

        // 지갑 데이터 삽입
        await insertWalletData(db, walletData);



        // 데이터베이스 통계 조회
        await getDBStats(db);

        const wallet = await getWallet(db, "0x4da2d3f330f75458a7f4befe90f82921e318d0b7");
        console.log(wallet)

        // const wallets = await getAllWallets(db);
        // console.log(wallets)

        console.log('모든 작업이 완료되었습니다.');
    } catch (error) {
        console.error(`오류 발생: ${error.message}`);
    } finally {
        // 데이터베이스 연결 종료
        if (db) {
            db.close((err) => {
                if (err) {
                    console.error(`데이터베이스 연결 종료 오류: ${err.message}`);
                } else {
                    console.log('데이터베이스 연결이 종료되었습니다.');
                }
            });
        }
    }
}

// 실행
// main();

module.exports = {
    upsertWallet,
    getWallet,
    getAllWallets,
    getDBStats,
    insertWalletData,
    readWalletData,
    initDatabase
};

