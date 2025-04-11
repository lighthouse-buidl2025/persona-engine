# 이더리움 지갑 분석 API

이 프로젝트는 이더리움 지갑 주소를 분석하여 다양한 정보를 제공하는 REST API입니다. Python 코드를 JavaScript로 변환한 버전입니다.

## 기능

- 이더리움 지갑의 트랜잭션 정보 분석
- NFT 보유 정보 확인
- ERC-20 토큰 보유 정보 분석
- DEX 거래량 조회
- 지갑 메타데이터 분석

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
PORT=3000
```

## 사용 방법

### API 서버 실행

```bash
npm start
```

개발 모드로 실행 (코드 변경 시 자동 재시작):

```bash
npm run dev
```

### API 엔드포인트

- `GET /api/wallet/:address`: 지정된 이더리움 주소의 지갑 정보를 분석합니다.

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
