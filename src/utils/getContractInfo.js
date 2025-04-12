// src/utils/getContractInfo.js
const axios = require('axios');

/**
 * 컨트랙트 주소에 대한 정보를 외부 API에서 가져옵니다
 * 요청이 실패해도 중단되지 않고 오류 정보를 반환합니다
 * @param {string} contractAddress - 이더리움 컨트랙트 주소
 * @returns {Promise<Object>} - 컨트랙트 정보 객체 또는 오류 정보
 */
async function getContractInfo(contractAddress) {
    try {
        if (!contractAddress || typeof contractAddress !== 'string') {
            return {
                success: false,
                error: '유효한 컨트랙트 주소가 필요합니다.',
                contractAddress: contractAddress
            };
        }

        // 외부 API에 요청
        const response = await axios.get(
            `http://localhost:8023/api/env-info/contract/${contractAddress}`,
            { timeout: 5000 } // 타임아웃 설정 (5초)
        );

        // 응답 검증
        if (!response.data) {
            return {
                success: false,
                error: 'API에서 데이터를 가져오지 못했습니다.',
                contractAddress: contractAddress
            };
        }

        console.log(`컨트랙트 ${contractAddress}의 정보를 성공적으로 가져왔습니다.`);
        return {
            success: true,
            data: response.data,
            contractAddress: contractAddress
        };
    } catch (error) {
        console.error(`컨트랙트 ${contractAddress} 정보 조회 오류: ${error.message}`);

        // 오류 정보 구성
        const errorResponse = {
            success: false,
            error: error.message,
            contractAddress: contractAddress
        };

        // API 응답 오류 추가 정보
        if (error.response) {
            errorResponse.statusCode = error.response.status;
            errorResponse.apiResponse = error.response.data;
        } else if (error.request) {
            // 요청은 이루어졌지만 응답이 없는 경우
            errorResponse.errorType = 'network';
            errorResponse.request = 'Request was made but no response received';
        } else {
            // 요청 설정 중 오류 발생
            errorResponse.errorType = 'config';
        }

        // 오류 정보 반환 (중단되지 않음)
        return errorResponse;
    }
}


module.exports = { getContractInfo };
// getContractInfo('0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48').then(console.log);