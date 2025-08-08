// Fixed version of frontend/index.js
const express = require('express'); // Use CommonJS require instead of ES6 import
const multer = require('multer');
const AWS = require('aws-sdk'); // Use AWS SDK v2 consistently
const fs = require('fs');
const path = require('path');
require('dotenv').config(); // Load environment variables

const app = express();
const port = 3000;

// S3 and SQS configs from environment
const bucketName = process.env.S3_BUCKET_NAME;
const region = process.env.AWS_REGION || 'eu-central-1';
const sqsQueueUrl = process.env.SQS_QUEUE_URL; // Use direct queue URL from Terraform

// Setup AWS config - REMOVED credentials for IAM role
AWS.config.update({
  region: region
  // AWS SDK will automatically use IAM role credentials
});

const s3 = new AWS.S3();
const sqs = new AWS.SQS();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
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
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Uploading file:', req.file.filename);
    console.log('Using bucket:', bucketName);

    const fileContent = fs.readFileSync(req.file.path);
    const params = {
      Bucket: bucketName,
      Key: req.file.filename,
      Body: fileContent,
    };

    // Upload to S3
    const data = await s3.upload(params).promise();
    console.log(`File uploaded successfully at ${data.Location}`);

    // Send message to SQS using direct queue URL
    if (sqsQueueUrl) {
      const sqsParams = {
        QueueUrl: sqsQueueUrl,
        MessageBody: JSON.stringify({
          bucket: bucketName,
          key: req.file.filename,
          location: data.Location
        }),
      };

      await sqs.sendMessage(sqsParams).promise();
      console.log('Message sent to SQS');
    }

    res.status(200).json({
      message: 'File uploaded successfully',
      location: data.Location,
      filename: req.file.filename
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Error uploading file: ' + error.message });
  } finally {
    // Clean up local file
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting temporary file:', unlinkError);
      }
    }
  }
});

// File size reporting endpoint (used by inspector.py)
app.post('/size-report', (req, res) => {
  const { filename, size_bytes } = req.body;
  console.log(`Received file size: ${filename} - ${size_bytes} bytes`);
  res.status(200).json({ message: 'Size received' });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Frontend running at http://0.0.0.0:${port}`);
  console.log('Environment variables:');
  console.log('- S3_BUCKET_NAME:', bucketName);
  console.log('- AWS_REGION:', region);
  console.log('- SQS_QUEUE_URL:', sqsQueueUrl);
});