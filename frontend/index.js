import express from 'express';
import multer from 'multer';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// S3 and SQS configs from environment
const bucketName = process.env.S3_BUCKET_NAME;
const region = process.env.AWS_REGION;
const sqsQueueName = process.env.SQS_QUEUE_NAME;
const awsAccountId = process.env.AWS_ACCOUNT_ID;

// Setup AWS config
AWS.config.update({
  region,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const s3 = new AWS.S3();
const sqs = new SQSClient({ region });

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// File upload route
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const fileContent = fs.readFileSync(req.file.path);
    const params = {
      Bucket: bucketName,
      Key: req.file.filename,
      Body: fileContent,
    };

    // Upload to S3
    const data = await s3.upload(params).promise();
    console.log(`File uploaded successfully at ${data.Location}`);

    // Send message to SQS
    if (!awsAccountId) {
      throw new Error('AWS_ACCOUNT_ID env variable is not set');
    }
    const queueUrl = `https://sqs.${region}.amazonaws.com/${awsAccountId}/${sqsQueueName}`;

    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({
        bucket: bucketName,
        key: req.file.filename,
      }),
    });

    await sqs.send(command);
    console.log('Message sent to SQS');

    res.status(200).send({ message: 'File uploaded and message sent to SQS' });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).send({ error: 'Error uploading file' });
  } finally {
    // Исправлена опечатка: было req.file.paZth, должно быть req.file.path
    fs.unlinkSync(req.file.path); // Clean up local file
  }
});

// File size reporting endpoint (used by inspector.py)
app.post('/size-report', (req, res) => {
  const { filename, size } = req.body;
  console.log(`Received file size: ${filename} - ${size} bytes`);
  res.status(200).send('Size received');
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Frontend running at http://0.0.0.0:${port}`);
});
