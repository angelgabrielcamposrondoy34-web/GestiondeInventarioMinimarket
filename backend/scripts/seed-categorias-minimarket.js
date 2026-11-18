const db = require('../config/database');

const categorias = [
    ['Abarrotes', 'Arroz, azúcar, aceite, fideos, menestras, harina, conservas, salsas y condimentos.'],
    ['Golosinas', 'Caramelos, chocolates, chicles, chupetines, gomitas y marshmallows.'],
    ['Snacks y galletas', 'Papas fritas, chizitos, maní, cancha y galletas dulces o saladas.'],
    ['Bebidas', 'Gaseosas, agua, jugos, refrescos y bebidas energéticas o isotónicas.'],
    ['Lácteos y refrigerados', 'Leche, yogurt, queso, mantequilla, margarina y postres refrigerados.'],
    ['Panadería y desayunos', 'Pan embolsado, tostadas, queques, café, té, avena y cocoa.'],
    ['Congelados y helados', 'Helados, hielo y alimentos congelados que requieran congeladora.'],
    ['Licores', 'Cerveza, vino, pisco, ron, vodka y bebidas preparadas; sujeto a autorización vigente.'],
    ['Limpieza del hogar', 'Detergente, lejía, lavavajilla, desinfectante, bolsas y esponjas.'],
    ['Cuidado personal', 'Jabón, shampoo, pasta dental, desodorante y artículos de higiene.'],
    ['Bebés', 'Pañales, toallitas húmedas, fórmula y compotas.'],
    ['Mascotas', 'Alimento para perros y gatos, arena sanitaria y snacks para mascotas.'],
    ['Útiles escolares y oficina', 'Cuadernos, lapiceros, lápices, borradores y artículos básicos de oficina.'],
    ['Hogar y varios', 'Pilas, focos, encendedores, cinta adhesiva y artículos de uso cotidiano.'],
    ['Temporada', 'Productos estacionales para campañas, celebraciones y fechas especiales.'],
    ['Tabaco y accesorios', 'Cigarrillos y accesorios; sujeto a la normativa vigente y venta solo a adultos.']
];

const normalizar = (texto) => texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('es');

db.query('SELECT nombre FROM categorias', (error, existentes) => {
    if (error) {
        console.error('No se pudieron consultar las categorías:', error.message);
        db.end();
        process.exitCode = 1;
        return;
    }

    const nombres = new Set(existentes.map(({ nombre }) => normalizar(nombre)));
    const nuevas = categorias.filter(([nombre]) => !nombres.has(normalizar(nombre)));

    if (nuevas.length === 0) {
        console.log('Las categorías sugeridas ya están registradas.');
        db.end();
        return;
    }

    db.query(
        'INSERT INTO categorias (nombre, descripcion) VALUES ?',
        [nuevas],
        (errorInsertar, resultado) => {
            if (errorInsertar) {
                console.error('No se pudieron registrar las categorías:', errorInsertar.message);
                db.end();
                process.exitCode = 1;
                return;
            }

            console.log(`Se agregaron ${resultado.affectedRows} categorías nuevas.`);
            db.end();
        }
    );
});
