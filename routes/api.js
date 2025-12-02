const express = require('express');
const multer = require('multer');
const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');


// Inicializa la aplicación de Firebase
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'gs://file-upload-system-to-firebase.appspot.com', // Reemplaza con tu bucket de Firestore
});

// Configura Multer para almacenar archivos en Firestore
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const router = express.Router();
const bucket = admin.storage().bucket();

// Define una ruta para cargar archivos
router.post('/upload', upload.single('storage'), (req, res) => {

    const file = bucket.file(req.file.originalname);

    const blobStream = file.createWriteStream({
        metadata: {
            contentType: req.file.mimetype,
        },
    });

    blobStream.on('error', (error) => {
        console.error(error);
        res.status(500).send('Error uploading file');
    });

    blobStream.on('finish', () => {
        res.status(200).redirect('/');
    });

    blobStream.end(req.file.buffer);

});

router.get('/list-files', async (req, res) => {
    try {
      const [files] = await bucket.getFiles();
      const fileNames = files.map((file) => file.name);
      res.json({ files: fileNames});

    } catch (error) {
      console.error('Error listing files:', error);
      res.status(500).json({ error: 'An error occurred while listing files' });
    }
  });

module.exports = router;
