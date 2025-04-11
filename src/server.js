require("dotenv").config();
const express = require("express");
const cors = require("cors");
const walletRoutes = require("./routes/walletRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// 미들웨어 설정
app.use(cors());
app.use(express.json());

// 라우트 설정
app.use("/api", walletRoutes);

// 기본 라우트
app.get("/", (req, res) => {
  res.json({ message: "server is running" });
});

// 서버 시작
app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다`);
});
