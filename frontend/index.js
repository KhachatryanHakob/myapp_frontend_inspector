require('dotenv').config();

const express = require('express');
const multer = require('multer');
const AWS = require('aws-sdk');
const fs = require('fs');
const app = express();
const port = 3000;

const fileSizes = {};

app.use(express.json());

const s3 = new AWS.S3({
  region: process.env.AWS_REGION || 'eu-central-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const upload = multer({ dest: 'uploads/' });
app.use(express.static('public'));

app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'File not uploaded' });
  }

  const stream = fs.createReadStream(file.path);

  const params = {
    Bucket: process.env.S3_BUCKET_NAME || 'my-app-bucket-1254',
    Key: file.originalname,
    Body: stream,
  };

  s3.upload(params, (err, data) => {

    fs.unlink(file.path, (unlinkErr) => {
      if (unlinkErr) console.error('Error removing temporary file:', unlinkErr);
    });

    if (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: 'Upload error' });
    }

    res.json({ message: 'File successfully uploaded to S3', location: data.Location });
  });
});

app.post('/size-report', (req, res) => {
  const { filename, size_bytes } = req.body;
  if (!filename || !size_bytes) {
    return res.status(400).json({ error: 'Invalid data' });
  }
  console.log(`Received file size ${filename}: ${size_bytes} bytes`);
  fileSizes[filename] = size_bytes;
  res.sendStatus(200);
});

app.get('/sizes', (req, res) => {
  res.json(fileSizes);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Frontend running at http://0.0.0.0:${port}`);
});
