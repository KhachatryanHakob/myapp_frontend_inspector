const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const port = 3000;

const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// AWS конфигурация
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();
const sqs = new AWS.SQS();
let lastFileSize = null;

// Маршрут загрузки
app.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  const fileContent = fs.readFileSync(file.path);

  const s3Params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: file.originalname,
    Body: fileContent,
  };

  try {
    await s3.upload(s3Params).promise();

    const message = {
      QueueUrl: process.env.SQS_QUEUE_NAME,
      MessageBody: JSON.stringify({ key: file.originalname }),
    };

    await sqs.sendMessage(message).promise();

    fs.unlinkSync(file.path);
    res.sendStatus(200);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).send('Upload failed');
  }
});

// Маршрут получения размера
app.get('/size-report', (req, res) => {
  if (lastFileSize !== null) {
    res.json({ size: lastFileSize });
    lastFileSize = null;
  } else {
    res.status(204).send();
  }
});

// Получение отчета от инспектора
app.post('/size-report', (req, res) => {
  const { size } = req.body;
  lastFileSize = size;
  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Frontend running on http://localhost:${port}`);
});
