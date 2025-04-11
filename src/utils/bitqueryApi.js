const axios = require("axios");
require("dotenv").config();

// BITQUERY API 키 배열을 환경 변수에서 불러오기
let keys = process.env.BITQUERY_API_KEYS.split(",");
const BITQUERY_API_URL = process.env.BITQUERY_API_URL;

/**
 * BitQuery GraphQL API에 쿼리 실행
 * @param {string} query - GraphQL 쿼리 문자열
 * @returns {Promise<Object>} - API 응답 데이터
 */
async function runQuery(query) {
  // 키 로테이션 - 첫 번째 키를 마지막으로 이동
  keys = keys.slice(1).concat(keys.slice(0, 1));

  try {
    const headers = { Authorization: `Bearer ${keys[0]}` };
    const response = await axios.post(BITQUERY_API_URL, { query }, { headers });

    if (response.status === 200) {
      return response.data;
    } else {
      throw new Error(`Query failed with status code ${response.status}`);
    }
  } catch (error) {
    throw new Error(`BitQuery API 요청 실패: ${error.message}`);
  }
}

module.exports = { runQuery };
