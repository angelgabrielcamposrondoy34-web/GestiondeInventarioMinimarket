const readXlsxFile = require('read-excel-file/node');
const db = require('../config/database');

const archivoCatalogo = "C:/Users/JJo/Downloads/Catalogo_Productos_Minimarket_Peru.xlsx";
const archivoKardex = "C:/Users/JJo/Downloads/KARDEX Minimarket TITO'S.xlsx";

const normalizar = (valor) => String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const hojaPorNombre = (hojas, nombre) => {
    const hoja = hojas.find((item) => normalizar(item.sheet) === normalizar(nombre));
    if (!hoja) throw new Error(`Falta la hoja ${nombre}.`);
    return hoja.data;
};

const indexar = (encabezados) => new Map(encabezados.map((texto, indice) => [normalizar(texto), indice]));

const fechaIso = (valor, numeroFila) => {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
    const texto = String(valor || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
    const formatoLocal = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (formatoLocal) return `${formatoLocal[3]}-${formatoLocal[2].padStart(2, '0')}-${formatoLocal[1].padStart(2, '0')}`;
    throw new Error(`Fecha inválida en la fila ${numeroFila} del Kardex.`);
};

const entero = (valor, campo, numeroFila) => {
    if (valor === null || valor === undefined || valor === '') throw new Error(`Falta ${campo} en la fila ${numeroFila}.`);
    const numero = Number(valor);
    if (!Number.isSafeInteger(numero) || numero < 0) throw new Error(`${campo} no es un entero válido en la fila ${numeroFila}.`);
    return numero;
};

async function main() {
    const [libroCatalogo, libroKardex] = await Promise.all([
        readXlsxFile(archivoCatalogo),
        readXlsxFile(archivoKardex)
    ]);
    const tablaCatalogo = hojaPorNombre(libroCatalogo, 'Productos Minimarket');
    const tablaCategorias = hojaPorNombre(libroKardex, 'Categorías');
    const tablaMaestroKardex = hojaPorNombre(libroKardex, 'Productos');
    const tablaKardex = hojaPorNombre(libroKardex, 'Kardex');

    const catalogoColumnas = indexar(tablaCatalogo[0]);
    const categoriaColumnas = indexar(tablaCategorias[0]);
    const maestroColumnas = indexar(tablaMaestroKardex[0]);
    const kardexColumnas = indexar(tablaKardex[0]);
    const valor = (fila, columnas, nombre) => fila[columnas.get(normalizar(nombre))];

    const categorias = tablaCategorias.slice(1).filter((fila) => fila.some((celda) => celda !== null && celda !== ''))
        .map((fila) => ({
            id: Number(valor(fila, categoriaColumnas, 'id_categoria')),
            codigo: String(valor(fila, categoriaColumnas, 'codigo_corto') || '').trim().toUpperCase(),
            nombre: String(valor(fila, categoriaColumnas, 'nombre') || '').trim(),
            descripcion: String(valor(fila, categoriaColumnas, 'descripcion') || '').trim()
        }));
    const categoriaPorCodigo = new Map(categorias.map((categoria) => [categoria.codigo, categoria]));
    if (categorias.length !== 20 || categoriaPorCodigo.size !== categorias.length) throw new Error('La hoja de categorías debe tener 20 códigos únicos.');

    const maestro = tablaMaestroKardex.slice(1).filter((fila) => fila.some((celda) => celda !== null && celda !== ''))
        .map((fila) => ({
            idOrigen: Number(valor(fila, maestroColumnas, 'id_producto')),
            codigo: String(valor(fila, maestroColumnas, 'codigo') || '').trim().toUpperCase(),
            nombre: String(valor(fila, maestroColumnas, 'nombre') || '').trim(),
            idCategoria: Number(valor(fila, maestroColumnas, 'id_categoria')),
            codigoCategoria: String(valor(fila, maestroColumnas, 'codigo_categoria') || '').trim().toUpperCase(),
            categoria: String(valor(fila, maestroColumnas, 'categoria') || '').trim(),
            unidad: String(valor(fila, maestroColumnas, 'unidad_medida') || '').trim(),
            compra: Number(valor(fila, maestroColumnas, 'precio_compra')),
            venta: Number(valor(fila, maestroColumnas, 'precio_venta')),
            minimo: Number(valor(fila, maestroColumnas, 'stock_minimo'))
        }));
    const maestroPorCodigo = new Map(maestro.map((producto) => [producto.codigo, producto]));
    const maestroPorId = new Map(maestro.map((producto) => [producto.idOrigen, producto.codigo]));
    if (maestro.length !== 30 || maestroPorCodigo.size !== maestro.length || maestroPorId.size !== maestro.length) {
        throw new Error('La hoja Productos del Kardex debe tener 30 productos con IDs y códigos únicos.');
    }

    const proveedores = new Map();
    const productos = tablaCatalogo.slice(1).filter((fila) => fila.some((celda) => celda !== null && celda !== ''))
        .map((fila, indice) => {
            const numeroFila = indice + 2;
            const codigo = String(valor(fila, catalogoColumnas, 'Código') || '').trim().toUpperCase();
            const nombreCatalogo = String(valor(fila, catalogoColumnas, 'Producto') || '').trim();
            const codigoCategoria = String(valor(fila, catalogoColumnas, 'Código de categoría') || '').trim().toUpperCase();
            const categoria = categoriaPorCodigo.get(codigoCategoria);
            const unidadCatalogo = String(valor(fila, catalogoColumnas, 'Unidad') || '').trim();
            const proveedor = String(valor(fila, catalogoColumnas, 'Proveedor') || '').trim();
            const ruc = String(valor(fila, catalogoColumnas, 'RUC') || '').replace(/\D/g, '');
            if (!codigo || !nombreCatalogo || !categoria) throw new Error(`Producto o categoría inválida en la fila ${numeroFila} del catálogo.`);
            if (!/^\d{11}$/.test(ruc)) throw new Error(`El RUC del proveedor de ${codigo} no contiene 11 dígitos.`);
            if (!proveedor) throw new Error(`Falta proveedor para ${codigo}.`);
            proveedores.set(ruc, proveedor);

            const k = maestroPorCodigo.get(codigo);
            if (k && (k.idCategoria !== categoria.id || k.codigoCategoria !== codigoCategoria)) {
                throw new Error(`El código de categoría no coincide para ${codigo}.`);
            }
            const compra = k ? k.compra : Number(valor(fila, catalogoColumnas, 'Precio compra'));
            const venta = k ? k.venta : Number(valor(fila, catalogoColumnas, 'Precio venta'));
            const stockMinimo = k ? k.minimo : Number(valor(fila, catalogoColumnas, 'Stock mínimo'));
            const stockMaximo = Number(valor(fila, catalogoColumnas, 'Stock máximo'));
            const stockActual = Number(valor(fila, catalogoColumnas, 'Stock inicial'));
            if (![compra, venta, stockMinimo, stockMaximo, stockActual].every(Number.isFinite)
                || compra < 0 || venta < compra || stockMinimo < 0 || stockMaximo < stockMinimo || stockActual < 0) {
                throw new Error(`Revisa precios y existencias del producto ${codigo}.`);
            }

            return {
                codigo,
                nombre: k ? k.nombre : nombreCatalogo,
                idCategoria: categoria.id,
                unidad: k ? k.unidad : unidadCatalogo,
                compra,
                venta,
                stockActual,
                stockMinimo,
                stockMaximo,
                proveedor,
                ruc
            };
        });
    const codigoSet = new Set(productos.map((producto) => producto.codigo));
    if (productos.length !== 79 || codigoSet.size !== productos.length) throw new Error('El catálogo debe contener 79 códigos de producto únicos.');

    const filasHistorial = tablaKardex.slice(1).filter((fila) => fila.some((celda) => celda !== null && celda !== ''));
    const historia = [];
    const clavesHistorial = new Set();
    const ultimaExistencia = new Map();
    const diasPorProducto = new Map();
    for (const [indice, fila] of filasHistorial.entries()) {
        const numeroFila = indice + 2;
        const idOrigen = entero(valor(fila, kardexColumnas, 'id_producto'), 'id_producto', numeroFila);
        const codigo = maestroPorId.get(idOrigen);
        if (!codigo || !codigoSet.has(codigo)) throw new Error(`El ID ${idOrigen} del Kardex no tiene un producto en el catálogo.`);
        const fecha = fechaIso(valor(fila, kardexColumnas, 'fecha'), numeroFila);
        const inicial = entero(valor(fila, kardexColumnas, 'stock_inicial'), 'stock_inicial', numeroFila);
        const entradas = entero(valor(fila, kardexColumnas, 'entradas'), 'entradas', numeroFila);
        const salidas = entero(valor(fila, kardexColumnas, 'salidas'), 'salidas', numeroFila);
        const final = entero(valor(fila, kardexColumnas, 'stock_final'), 'stock_final', numeroFila);
        if (inicial + entradas - salidas !== final) throw new Error(`El saldo no cuadra en la fila ${numeroFila} del Kardex.`);
        if (ultimaExistencia.has(codigo) && ultimaExistencia.get(codigo).stock !== inicial) {
            throw new Error(`La continuidad del stock no cuadra para ${codigo} en ${fecha}.`);
        }
        const clave = `${codigo}|${fecha}`;
        if (clavesHistorial.has(clave)) throw new Error(`Registro duplicado para ${codigo} en ${fecha}.`);
        clavesHistorial.add(clave);
        ultimaExistencia.set(codigo, { fecha, stock: final });
        diasPorProducto.set(codigo, (diasPorProducto.get(codigo) || 0) + 1);
        historia.push({ codigo, fecha, inicial, entradas, salidas, final });
    }
    if (historia.length !== 10950 || diasPorProducto.size !== 30 || [...diasPorProducto.values()].some((dias) => dias !== 365)) {
        throw new Error('El Kardex debe tener 365 registros por cada uno de los 30 productos.');
    }

    const conexion = await db.promise().getConnection();
    try {
        await conexion.beginTransaction();

        const [[noSimulados]] = await conexion.query(
            "SELECT COUNT(*) AS total FROM historial_stock WHERE origen_datos <> 'simulado'"
        );
        if (Number(noSimulados.total) > 0) {
            throw new Error('Hay historial real o sin clasificar en la base. Se detuvo la sustitución para conservarlo.');
        }

        const [categoriasActuales] = await conexion.query('SELECT id_categoria FROM categorias');
        const categoriasExistentes = new Set(categoriasActuales.map((fila) => Number(fila.id_categoria)));
        for (const categoria of categorias) {
            if (!categoriasExistentes.has(categoria.id)) {
                await conexion.query(
                    'INSERT INTO categorias (id_categoria, nombre, descripcion, estado) VALUES (?, ?, ?, 0)',
                    [categoria.id, `__TEMP_CATEGORIA_${categoria.id}__`, '']
                );
            }
        }
        await conexion.query("UPDATE categorias SET nombre = CONCAT('__TEMP_CATEGORIA_', id_categoria, '__'), estado = 0");
        for (const categoria of categorias) {
            await conexion.query(
                `INSERT INTO categorias (id_categoria, nombre, descripcion, estado)
                 VALUES (?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE nombre = VALUES(nombre), descripcion = VALUES(descripcion), estado = 1`,
                [categoria.id, categoria.nombre, categoria.descripcion]
            );
        }
        await conexion.query(
            "UPDATE categorias SET nombre = CONCAT('Categoría archivada ', id_categoria), descripcion = 'Categoría anterior conservada por historial', estado = 0 WHERE id_categoria NOT IN (?)",
            [categorias.map((categoria) => categoria.id)]
        );

        for (const [ruc, razonSocial] of proveedores) {
            const [existentes] = await conexion.query('SELECT id_proveedor FROM proveedores WHERE ruc = ? ORDER BY id_proveedor LIMIT 1', [ruc]);
            if (existentes.length) {
                await conexion.query(
                    'UPDATE proveedores SET razon_social = ?, estado = 1 WHERE id_proveedor = ?',
                    [razonSocial, existentes[0].id_proveedor]
                );
            } else {
                await conexion.query(
                    'INSERT INTO proveedores (razon_social, ruc, telefono, correo, direccion, estado) VALUES (?, ?, NULL, NULL, NULL, 1)',
                    [razonSocial, ruc]
                );
            }
        }
        const [proveedoresDb] = await conexion.query('SELECT id_proveedor, ruc FROM proveedores');
        const idProveedorPorRuc = new Map(proveedoresDb.map((fila) => [String(fila.ruc), Number(fila.id_proveedor)]));
        const rucsActivos = [...proveedores.keys()];
        await conexion.query('UPDATE proveedores SET estado = 0 WHERE ruc NOT IN (?)', [rucsActivos]);

        for (const producto of productos) {
            const idProveedor = idProveedorPorRuc.get(producto.ruc);
            if (!idProveedor) throw new Error(`No se encontró el proveedor de ${producto.codigo}.`);
            await conexion.query(
                `INSERT INTO productos
                    (codigo, nombre, descripcion, id_categoria, id_proveedor, precio_compra, precio_venta,
                     stock_actual, stock_minimo, stock_maximo, unidad_medida, estado)
                 VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE
                    nombre = VALUES(nombre), descripcion = NULL, id_categoria = VALUES(id_categoria),
                    id_proveedor = VALUES(id_proveedor), precio_compra = VALUES(precio_compra),
                    precio_venta = VALUES(precio_venta), stock_actual = VALUES(stock_actual),
                    stock_minimo = VALUES(stock_minimo), stock_maximo = VALUES(stock_maximo),
                    unidad_medida = VALUES(unidad_medida), estado = 1`,
                [producto.codigo, producto.nombre, producto.idCategoria, idProveedor, producto.compra,
                    producto.venta, producto.stockActual, producto.stockMinimo, producto.stockMaximo, producto.unidad]
            );
        }
        await conexion.query('UPDATE productos SET estado = 0 WHERE codigo NOT IN (?)', [[...codigoSet]]);

        const [productosDb] = await conexion.query('SELECT id_producto, codigo FROM productos WHERE estado = 1 AND codigo IN (?)', [[...codigoSet]]);
        const idProductoPorCodigo = new Map(productosDb.map((fila) => [fila.codigo, Number(fila.id_producto)]));
        if (idProductoPorCodigo.size !== productos.length) throw new Error('No se pudo relacionar todo el catálogo con los productos del sistema.');

        await conexion.query('DELETE FROM predicciones_demanda');
        const [borradoSimulado] = await conexion.query("DELETE FROM historial_stock WHERE origen_datos = 'simulado'");
        const filasDb = historia.map((fila) => [
            idProductoPorCodigo.get(fila.codigo), fila.fecha, fila.inicial, fila.entradas, fila.salidas, fila.final, 'real'
        ]);
        for (let inicio = 0; inicio < filasDb.length; inicio += 500) {
            await conexion.query(
                `INSERT INTO historial_stock
                    (id_producto, fecha, stock_inicial, entradas, salidas, stock_final, origen_datos)
                 VALUES ?`,
                [filasDb.slice(inicio, inicio + 500)]
            );
        }

        await conexion.commit();
        console.log(JSON.stringify({
            productos_activos: productos.length,
            productos_con_historial: diasPorProducto.size,
            categorias_activas: categorias.length,
            proveedores_activos: proveedores.size,
            filas_kardex_reales_importadas: filasDb.length,
            filas_simuladas_retiradas: borradoSimulado.affectedRows,
            fechas: [historia[0].fecha, historia[historia.length - 1].fecha]
        }, null, 2));
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
        db.end();
    }
}

main().catch((error) => {
    console.error('No se completó la importación:', error.message);
    process.exitCode = 1;
});
