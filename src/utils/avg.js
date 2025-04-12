/**
 * 특정 페르소나 그룹의 지표 평균 계산
 * @param {Object} db - SQLite 데이터베이스 연결 객체
 * @param {string} fromGroup - 페르소나 그룹 (예: "Explorer_Whale")
 * @returns {Promise<Object>} - 평균 지표 정보
 */
function getAverageMetricsByGroup(db, fromGroup) {
    return new Promise((resolve, reject) => {
        if (!fromGroup) {
            reject('그룹 정보가 필요합니다.');
            return;
        }

        // 일치하는 그룹의 고유 주소 목록과 지표 평균을 계산하는 쿼리
        const query = `
            SELECT 
                pc.from_group,
                COUNT(DISTINCT pc.address) AS unique_addresses,
                AVG(w.distinct_contract_count) AS avg_distinct_contract_count,
                AVG(w.dex_platform_diversity) AS avg_dex_platform_diversity,
                AVG(w.avg_token_holding_period) AS avg_token_holding_period,
                AVG(w.transaction_frequency) AS avg_transaction_frequency,
                AVG(w.dex_volume_usd) AS avg_dex_volume_usd,
                AVG(w.nft_collections_diversity) AS avg_nft_collections_diversity
            FROM 
                persona_contracts pc
            JOIN 
                wallets w ON pc.address = w.address
            WHERE 
                pc.from_group = ?
            GROUP BY 
                pc.from_group
        `;

        db.get(query, [fromGroup], (err, row) => {
            if (err) {
                reject(`조회 오류: ${err.message}`);
                return;
            }

            if (!row) {
                resolve({
                    fromGroup: fromGroup,
                    uniqueAddresses: 0,
                    averageMetrics: {
                        distinct_contract_count: 0,
                        dex_platform_diversity: 0,
                        avg_token_holding_period: 0,
                        transaction_frequency: 0,
                        dex_volume_usd: 0,
                        nft_collections_diversity: 0
                    }
                });
                return;
            }

            // 결과 포맷팅
            const result = {
                fromGroup: fromGroup,
                uniqueAddresses: row.unique_addresses,
                averageMetrics: {
                    distinct_contract_count: parseFloat(row.avg_distinct_contract_count.toFixed(2)),
                    dex_platform_diversity: parseFloat(row.avg_dex_platform_diversity.toFixed(2)),
                    avg_token_holding_period: parseFloat(row.avg_token_holding_period.toFixed(2)),
                    transaction_frequency: parseFloat(row.avg_transaction_frequency.toFixed(2)),
                    dex_volume_usd: parseFloat(row.avg_dex_volume_usd.toFixed(2)),
                    nft_collections_diversity: parseFloat(row.avg_nft_collections_diversity.toFixed(2))
                }
            };

            resolve(result);
        });
    });
}

module.exports = { getAverageMetricsByGroup };
