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


app.post('/upload', upload.single('file'), (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Файл не загружен' });
  }

  const stream = fs.createReadStream(file.path);

  const params = {
    Bucket: process.env.S3_BUCKET_NAME || 'my-app-bucket-1254',
    Key: file.originalname,
    Body: stream,
  };

  s3.upload(params, (err, data) => {

    fs.unlink(file.path, (unlinkErr) => {
      if (unlinkErr) console.error('Ошибка удаления временного файла:', unlinkErr);
    });

    if (err) {
      console.error('Ошибка загрузки:', err);
      return res.status(500).json({ error: 'Ошибка загрузки' });
    }

    res.json({ message: 'Файл успешно загружен в S3', location: data.Location });
  });
});


app.post('/size-report', (req, res) => {
  const { filename, size_bytes } = req.body;
  if (!filename || !size_bytes) {
    return res.status(400).json({ error: 'Неверные данные' });
  }
  console.log(`Получен размер файла ${filename}: ${size_bytes} байт`);
  fileSizes[filename] = size_bytes;
  res.sendStatus(200);
});


app.get('/sizes', (req, res) => {
  res.json(fileSizes);
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Frontend запущен на http://0.0.0.0:${port}`);
});
