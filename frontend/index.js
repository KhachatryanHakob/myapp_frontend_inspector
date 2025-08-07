const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

const fileSizes = {};

app.use(express.json());
app.use(express.static('public'));

// Get AWS configuration from environment variables
const awsRegion = process.env.AWS_REGION || 'eu-central-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const s3Bucket = process.env.S3_BUCKET_NAME || 'my-app-bucket-1254';
const sqsQueueUrl = process.env.SQS_QUEUE_URL;

if (!accessKeyId || !secretAccessKey) {
  console.error("AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set!");
  process.exit(1);
}

const s3 = new AWS.S3({
  region: awsRegion,
  accessKeyId,
  secretAccessKey,
});

const sqs = new AWS.SQS({
  region: awsRegion,
  accessKeyId,
  secretAccessKey,
});

const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'File not uploaded' });
  }

  const stream = fs.createReadStream(file.path);

  const params = {
    Bucket: s3Bucket,
    Key: file.originalname,
    Body: stream,
  };

  s3.upload(params, (err, data) => {
    // Remove temporary file after upload
    fs.unlink(file.path, (unlinkErr) => {
      if (unlinkErr) console.error('Error removing temporary file:', unlinkErr);
    });

    if (err) {
      console.error('S3 upload error:', err);
      return res.status(500).json({ error: 'Upload error' });
    }

    console.log('File uploaded to S3:', data.Location);

    // Send message to SQS

    if (sqsQueueUrl) {
      const sqsParams = {
        QueueUrl: sqsQueueUrl,
        MessageBody: JSON.stringify({
          bucket: s3Bucket,
          key: file.originalname,
        }),
      };

      sqs.sendMessage(sqsParams, (sqsErr, sqsData) => {
        if (sqsErr) {
          console.error('Error sending message to SQS:', sqsErr);
        } else {
          console.log('Message sent to SQS. ID:', sqsData.MessageId);
        }
      });
    }


    res.json({ message: 'File successfully uploaded to S3', location: data.Location });
  });
});

app.post('/size-report', (req, res) => {
  const { filename, size_bytes } = req.body;
  if (!filename || typeof size_bytes !== 'number') {
    return res.status(400).json({ error: 'Invalid data' });
  }
  console.log(`Received file size for ${filename}: ${size_bytes} bytes`);
  fileSizes[filename] = size_bytes;
  res.sendStatus(200);
});

app.get('/sizes', (req, res) => {
  res.json(fileSizes);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Frontend running at http://0.0.0.0:${port}`);
});
