import express from 'express';
import multer from 'multer';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

dotenv.config();

const app = express();
const port = 3000;

// S3 and SQS configs from environment
const bucketName = process.env.S3_BUCKET_NAME;
const region = process.env.AWS_REGION;
const sqsQueueName = process.env.SQS_QUEUE_NAME;

// Setup AWS config
AWS.config.update({
  region,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const s3 = new AWS.S3();
const sqs = new SQSClient({ region });

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Чтобы хранить последнее уведомление
let lastNotification = null;

app.use(express.json());
app.use(express.static('public'));

// File upload route
app.post('/upload', upload.single('file'), async (req, res) => {
  const fileContent = fs.readFileSync(req.file.path);
  const params = {
    Bucket: bucketName,
    Key: req.file.filename,
    Body: fileContent
  };

  try {
    // Upload to S3
    const data = await s3.upload(params).promise();
    console.log(`File uploaded successfully at ${data.Location}`);

    // Send message to SQS
    const queueUrl = `https://sqs.${region}.amazonaws.com/${process.env.AWS_ACCOUNT_ID}/${sqsQueueName}`;

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        bucket: bucketName,
        key: req.file.filename
      })
    });

    await sqs.send(command);
    console.log('Message sent to SQS');

    res.status(200).json({ message: 'File uploaded and message sent to SQS' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Error uploading file' });
  } finally {
    fs.unlinkSync(req.file.path); // Clean up local file
  }
});

// New endpoint: inspector sends here file size info
app.post('/notify', (req, res) => {
  const { filename, size } = req.body;
  console.log(`📁 Notification received: ${filename}, size: ${size} bytes`);
  lastNotification = { filename, size };
  res.json({ success: true });
});

// New endpoint: frontend polls this to get last upload info
app.get('/last-upload', (req, res) => {
  if (lastNotification) {
    res.json(lastNotification);
  } else {
    res.json({ message: 'No files uploaded yet' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Frontend running at http://0.0.0.0:${port}`);
});
