const express = require("express");
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const bodyParser = require("body-parser");
const path = require("path");
const QRCode = require("qrcode");
const fs = require("fs");

const app = express();
const port = 8080;

// Настройка UTF-8 для корректной передачи данных
app.use(bodyParser.json({ limit: "10mb", type: "application/json" }));
app.use(bodyParser.urlencoded({ extended: true }));

// Установка заголовков для корректной работы с UTF-8
app.use((req, res, next) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  next();
});

// Настройка OAuth2 для отправки почты
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI || !REFRESH_TOKEN) {
  console.error("Одна или несколько переменных окружения не настроены!");
  process.exit(1); // Завершаем процесс, если переменные отсутствуют
}

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// Функция для чтения данных из JSON
function readData() {
  try {
    const data = fs.readFileSync("qrcodes.json", "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return []; // Если файла нет, возвращаем пустой массив
  }
}

// Функция для записи данных в JSON
function writeData(data) {
  fs.writeFileSync("qrcodes.json", JSON.stringify(data, null, 2));
}

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

// API для отправки письма с QR-кодом
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

// Эндпоинт для получения QR-кодов от ESP32-CAM
app.post("/receive-qr", (req, res) => {
  const { qrCodeData } = req.body;
  if (!qrCodeData) {
    return res.status(400).json({ message: "Нет данных QR-кода" });
  }

  const qrcodes = readData();
  qrcodes.push({ data: qrCodeData, timestamp: new Date().toISOString() });
  writeData(qrcodes);

  res.status(200).json({ message: "QR-код сохранен", data: qrCodeData });
});

// Раздача статических файлов и маршруты
app.use(express.static(path.join(__dirname)));

// Главная страница
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "main.html"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

// Страница авторизации
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "login.html"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

// Панель управления
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "admin.html"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

app.post("/clear-qrcodes", (req, res) => {
  writeData([]); // Очищаем массив, записываем пустой
  res.status(200).json({ message: "QR-коды очищены" });
});

// Эндпоинт для отображения сохраненных QR-кодов на панели
app.get("/get-qrcodes", (req, res) => {
  const qrcodes = readData();
  res.json(qrcodes);
});

// Запуск сервера
app.listen(port, "0.0.0.0", () => {
  console.log(`Сервер запущен на http://127.0.0.1:${port}`);
});