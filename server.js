// Usamos import en lugar de require para compatibilidad con node-fetch v3+
import 'dotenv/config'; // Carga las variables de entorno
import express from 'express';
import path from 'path';
import admin from 'firebase-admin';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// --- Helpers para __dirname en ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuración de Firebase ---
try {
    // CAMBIO IMPORTANTE: Usamos require() para cargar el JSON. 
    // Esto maneja automáticamente el formato del archivo.
    const serviceAccount = require('./serviceAccountKey.json');
    
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log('Firebase Admin SDK inicializado correctamente.');
} catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') { 
        console.error('Error: El archivo serviceAccountKey.json no se encontró.');
        console.error('Por favor, asegúrate de que el archivo está en la raíz del proyecto y que has reiniciado el servidor.');
    } else {
        console.error('Ocurrió un error inesperado al inicializar Firebase:', error);
    }
    process.exit(1); // Detiene la aplicación si no puede inicializar Firebase
}
// ----------------------------------

const db = admin.firestore();
const app = express();

// --- Lógica de Verificación de PayPal ---
const PAYPAL_API_BASE = process.env.NODE_ENV === 'production' 
    ? 'https://api-m.paypal.com' 
    : 'https://api-m.sandbox.paypal.com';

async function getPayPalAccessToken() {
    const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
    
    const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
        method: 'POST',
        body: 'grant_type=client_credentials',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${auth}`,
        },
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error("Respuesta de error de PayPal:", errorData);
        throw new Error(`Failed to get PayPal access token. Status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.access_token;
}

async function verifyPayPalWebhook(headers, rawBody) {
    try {
        const accessToken = await getPayPalAccessToken();

        const verificationData = {
            auth_algo: headers['paypal-auth-algo'],
            cert_url: headers['paypal-cert-url'],
            transmission_id: headers['paypal-transmission-id'],
            transmission_sig: headers['paypal-transmission-sig'],
            transmission_time: headers['paypal-transmission-time'],
            webhook_id: process.env.PAYPAL_WEBHOOK_ID,
            webhook_event: JSON.parse(rawBody), // PayPal espera el cuerpo como un objeto JSON
        };

        const response = await fetch(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(verificationData),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('La llamada a la API de verificación de PayPal falló:', response.status, errorText);
            return false;
        }

        const verificationResult = await response.json();
        return verificationResult.verification_status === 'SUCCESS';

    } catch (error) {
        console.error('Error durante la verificación del webhook:', error.message);
        return false;
    }
}
// ------------------------------------------

// Middleware para parsear JSON, pero guardando el cuerpo original (rawBody)
// Es crucial porque la verificación de firma de PayPal necesita el cuerpo sin procesar.
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));


// --- Ruta del Webhook de PayPal ---
app.post('/api/paypal-webhook', async (req, res) => {
    console.log('Webhook de PayPal recibido...');

    // 1. VERIFICACIÓN DEL WEBHOOK USANDO EL CUERPO ORIGINAL
    const isVerified = await verifyPayPalWebhook(req.headers, req.rawBody);

    if (!isVerified) {
        console.log('¡ALERTA DE SEGURIDAD! Webhook no verificado. Petición rechazada.');
        return res.status(401).send('Verificación de Webhook fallida.');
    }
    
    console.log('Webhook verificado correctamente por PayPal.');
    
    const event = req.body;
    console.log('Tipo de evento:', event.event_type);

    // 2. PROCESAR EL EVENTO DE CANCELACIÓN
    if (event.event_type === 'BILLING.SUBSCRIPTION.CANCELLED') {
        const technicianId = event.resource.custom_id; 
        
        if (!technicianId) {
            console.log('Evento de cancelación recibido pero sin custom_id (technicianId). No se puede procesar.');
            return res.status(200).send('Evento recibido pero sin technicianId.');
        }

        console.log(`Procesando cancelación para el técnico: ${technicianId}`);

        try {
            const technicianRef = db.collection('technicians').doc(technicianId);
            await technicianRef.update({
                validationStatus: 'pending' 
            });
            console.log(`El estado de validación del técnico ${technicianId} ha sido actualizado a 'pending' en Firebase.`);
        } catch (error) {
            console.error(`Error al actualizar el técnico ${technicianId} en Firebase:`, error);
            // Si hay un error con Firebase, respondemos con 500 para que PayPal pueda reintentar.
            return res.status(500).send('Error interno del servidor al actualizar la base de datos.');
        }
    } else {
        console.log(`Evento '${event.event_type}' recibido, pero no es de cancelación. No se tomará acción.`);
    }

    // 3. RESPONDER A PAYPAL
    res.status(200).send('Webhook recibido y procesado');
});
// ----------------------------------

// Middleware para servir archivos estáticos (tu página de promoción)
app.use(express.static(path.join(__dirname, 'public')));

// Ruta de la página principal que sirve el index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Arrancar el servidor
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  console.log(`Accede a la página de promoción en http://localhost:${PORT}`);
});
