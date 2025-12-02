const express = require('express');
const app = express();
const port = 3000;

// Importa las rutas de la API desde routes/api.js
const apiRoutes = require('./routes/api');

// Sirve los archivos estáticos de la carpeta 'public' (ahí está tu index.html)
app.use(express.static('public'));

// Le dice a Express que use las rutas definidas en api.js para cualquier URL que empiece con /api
app.use('/api', apiRoutes);

app.listen(port, () => {
  console.log(`Servidor TechConnect en ejecución en http://localhost:${port}`);
});
