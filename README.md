# 이더리움 지갑 분석 API

이 프로젝트는 이더리움 지갑 주소를 분석하여 다양한 정보를 제공하고 지갑 활동을 점수화하는 REST API입니다. Python 코드를 JavaScript로 변환한 버전입니다.

## 기능

- 이더리움 지갑의 트랜잭션 정보 분석
- NFT 보유 정보 확인
- ERC-20 토큰 보유 정보 분석
- DEX 거래량 조회
- 지갑 메타데이터 분석
- 지갑 페르소나 평가 및 점수화 (Explorer, Diamond, Whale, Degen)
- 데이터 캐싱 및 업데이트

## 설치 방법

먼저 필요한 패키지를 설치합니다:

```bash
npm install
```

## 환경 변수 설정

`.env` 파일을 생성하고 다음 내용을 입력합니다:

```
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
ALCHEMY_API_KEY=YOUR_ALCHEMY_API_KEY
BITQUERY_API_KEYS=YOUR_BITQUERY_API_KEY1,YOUR_BITQUERY_API_KEY2
BITQUERY_API_URL=https://graphql.bitquery.io/
PORT=8021
```

## 사용 방법

### API 서버 실행

```bash
npm start
```

개발 모드로 실행 (코드 변경 시 자동 재시작):

```bash
npm run start
```

### API 엔드포인트

- `GET /api/persona-engine/update/:address`: 지정된 이더리움 주소의 지갑 정보를 실시간으로 분석합니다.
- `GET /api/persona-engine/wallet/:address`: 지정된 이더리움 주소의 지갑 정보를 캐싱된 데이터를 활용하여 분석합니다.

### API 응답 구조

API 호출 시 반환되는 데이터 구조는 다음과 같습니다:

```json
{
  "success": true,
  "data": {
    "wallet": {
      "address": "0x...", // 이더리움 지갑 주소
      "balance": 6.24e18, // 이더리움 잔액 (Wei 단위)

      // 지갑 활동 지표
      "distinct_contract_count": 9, // 상호작용한 고유 컨트랙트 수
      "dex_platform_diversity": 2, // 사용한 DEX 플랫폼 다양성
      "avg_token_holding_period": 292.81, // 평균 토큰 보유 기간 (일)
      "transaction_frequency": 1.95, // 트랜잭션 빈도
      "dex_volume_usd": 17426451.01, // DEX 거래 총 볼륨 (USD)
      "nft_collections_diversity": 25, // 보유 NFT 컬렉션 다양성

      // 페르소나 점수 (0-10점 척도)
      "explorer_score": 3.3, // Explorer 페르소나 점수
      "diamond_score": 3.6, // Diamond 페르소나 점수
      "whale_score": 4.4, // Whale 페르소나 점수
      "degen_score": 3.5, // Degen 페르소나 점수

      // 백분위 지표 (0-100)
      "distinct_contract_count_percentile": 20.3,
      "dex_platform_diversity_percentile": 29.9,
      "avg_token_holding_period_percentile": 30.9,
      "transaction_frequency_percentile": 30.7,
      "dex_volume_usd_percentile": 48.8,
      "nft_collections_diversity_percentile": 53.4,

      // 타임스탬프
      "created_at": "2025-04-12 01:07:16", // 데이터 생성 시간
      "updated_at": "2025-04-12 01:07:16" // 데이터 업데이트 시간
    }
  },
  "status": 200 // HTTP 상태 코드
}
```

### CLI 모드 실행

명령줄에서 지갑 분석 후 파일로 저장:

```bash
node src/cli.js 0xYourEthereumAddress
```

## 기술 스택

- Node.js
- Express.js
- Web3.js
- Axios
- Moment.js
- MongoDB (데이터 캐싱)
