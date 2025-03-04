const express = require("express");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const path = require("path");
const QRCode = require("qrcode");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 8080;

app.use(bodyParser.json({ limit: "10mb", type: "application/json" }));
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

// Чтение переменных окружения
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

if (
  !CLIENT_ID ||
  !CLIENT_SECRET ||
  !REDIRECT_URI ||
  !REFRESH_TOKEN ||
  !DATABASE_URL
) {
  console.error("Одна или несколько переменных окружения не настроены!");
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// Настройка подключения к PostgreSQL
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Для Railway
});

async function sendMail(to, subject, text, html, attachment) {
  try {
    const accessToken = await oAuth2Client.getAccessToken();

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: "nik.timofeev.966@gmail.com",
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    const mailOptions = {
      from: "nik.timofeev.966@gmail.com",
      to: to,
      subject: subject,
      text: text,
      html: html,
      attachments: [
        {
          filename: "qrcode.png",
          content: attachment,
          encoding: "base64",
        },
      ],
    };

    const result = await transporter.sendMail(mailOptions);
    console.log("Письмо отправлено:", result);
    return result;
  } catch (error) {
    console.error("Ошибка отправки письма:", error);
    throw error;
  }
}

app.post("/send-email", async (req, res) => {
  const { surname, name, email } = req.body;

  const qrData = `Фамилия: ${surname}, Имя: ${name}, Email: ${email}`;
  try {
    const qrCodeUrl = await QRCode.toDataURL(qrData);
    const qrCodeBase64 = qrCodeUrl.split(",")[1];

    const subject = "Ваш QR-код";
    const text = `Добрый день, ${name} ${surname}! Ваш QR-код прилагается.`;
    const html = `<p>Добрый день, ${name} ${surname}!</p><p>Ваш QR-код для доступа прикреплен к письму.</p>`;

    await sendMail(email, subject, text, html, qrCodeBase64);
    res.status(200).json({ message: "Письмо отправлено успешно" });
  } catch (error) {
    res.status(500).json({
      message: "Ошибка генерации или отправки письма",
      error: error.message,
    });
  }
});

app.post("/receive-qr", async (req, res) => {
  const { qrCodeData } = req.body;
  if (!qrCodeData) {
    return res.status(400).json({ message: "Нет данных QR-кода" });
  }

  try {
    const client = await pool.connect();
    const checkQuery = "SELECT COUNT(*) FROM qrcodes WHERE data = $1";
    const checkResult = await client.query(checkQuery, [qrCodeData]);
    const isDuplicate = parseInt(checkResult.rows[0].count) > 0;

    if (!isDuplicate) {
      const insertQuery =
        "INSERT INTO qrcodes (data, timestamp) VALUES ($1, $2)";
      await client.query(insertQuery, [qrCodeData, new Date().toISOString()]);
      console.log("New QR code saved:", qrCodeData);
    } else {
      console.log("Duplicate QR code detected, not saved:", qrCodeData);
    }

    client.release();
    res
      .status(200)
      .json({ message: "QR-код обработан", data: qrCodeData, isDuplicate });
  } catch (error) {
    console.error("Ошибка работы с базой данных:", error);
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

app.post("/clear-qrcodes", async (req, res) => {
  try {
    const client = await pool.connect();
    await client.query("DELETE FROM qrcodes");
    client.release();
    res.status(200).json({ message: "QR-коды удалены" });
  } catch (error) {
    console.error("Ошибка очистки базы данных:", error);
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

app.use(express.static(path.join(__dirname)));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "main.html"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

app.get("/get-qrcodes", async (req, res) => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT data, timestamp FROM qrcodes ORDER BY timestamp DESC"
    );
    client.release();
    res.json(result.rows);
  } catch (error) {
    console.error("Ошибка получения данных:", error);
    res.status(500).json({ message: "Ошибка сервера", error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Сервер запущен на порту ${port}`);

  // Инициализация таблицы qrcodes, если она не существует
  pool.query(
    `
    CREATE TABLE IF NOT EXISTS qrcodes (
      id SERIAL PRIMARY KEY,
      data TEXT NOT NULL UNIQUE,
      timestamp TIMESTAMP NOT NULL
    )`,
    (err) => {
      if (err) console.error("Ошибка создания таблицы:", err);
      else console.log("Таблица qrcodes готова или уже существует");
    }
  );
});
