const readXlsxFile = require('read-excel-file/node');
const db = require('../config/database');

const archivo = 'C:/Users/JJo/Downloads/Catalogo_Minimarket_35_Productos_Por_Categoria.xlsx';
const categoriaPorCodigo = new Map([
    ['BEB', 1], ['LAC', 2], ['SNK', 3], ['ABA', 4], ['LIM', 5],
    ['CUI', 6], ['DUL', 7], ['PAN', 8], ['EMB', 9], ['CON', 10],
    ['LIC', 11], ['BAB', 12], ['MAS', 13], ['UTI', 14], ['HOG', 15],
    ['VER', 16], ['TEM', 17], ['TAB', 18], ['REFR', 19], ['FAR', 20]
]);

const normalizar = (valor) => String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toLowerCase();

async function main() {
    const hojas = await readXlsxFile(archivo);
    const hoja = hojas.find((item) => normalizar(item.sheet) === normalizar('Productos Minimarket'));
    if (!hoja || hoja.data.length < 2) throw new Error('No se encontró la hoja Productos Minimarket.');

    const encabezados = new Map(hoja.data[0].map((valor, indice) => [normalizar(valor), indice]));
    const campo = (fila, nombre) => {
        const indice = encabezados.get(normalizar(nombre));
        if (indice === undefined) throw new Error(`Falta la columna ${nombre}.`);
        return fila[indice];
    };

    const productos = hoja.data.slice(1).filter((fila) => fila.some((valor) => valor !== null && valor !== ''))
        .map((fila, indice) => {
            const codigo = String(campo(fila, 'Código') ?? '').trim().toUpperCase();
            const codigoCategoria = String(campo(fila, 'Código de categoría') ?? '').trim().toUpperCase();
            const categoriaFila = String(campo(fila, 'Categoría') ?? '').trim();
            const prefijo = codigo.match(/^[A-Z]+/)?.[0];
            const idCategoria = categoriaPorCodigo.get(codigoCategoria);
            const compra = Number(campo(fila, 'Precio compra'));
            const venta = Number(campo(fila, 'Precio venta'));
            const stock = Number(campo(fila, 'Stock inicial'));
            const minimo = Number(campo(fila, 'Stock mínimo'));
            const maximo = Number(campo(fila, 'Stock máximo'));
            const ruc = String(campo(fila, 'RUC') ?? '').replace(/\D/g, '');
            const producto = {
                fila: indice + 2,
                codigo,
                nombre: String(campo(fila, 'Producto') ?? '').trim(),
                codigoCategoria,
                categoriaFila,
                idCategoria,
                unidad: String(campo(fila, 'Unidad') ?? '').trim(),
                compra,
                venta,
                stock,
                minimo,
                maximo,
                proveedor: String(campo(fila, 'Proveedor') ?? '').trim(),
                ruc
            };

            if (!codigo || !producto.nombre || !idCategoria || prefijo !== codigoCategoria
                || !producto.unidad || !producto.proveedor || !/^\d{11}$/.test(ruc)
                || ![compra, venta, stock, minimo, maximo].every(Number.isFinite)
                || ![stock, minimo, maximo].every(Number.isSafeInteger)
                || compra < 0 || venta < compra || stock < 0 || minimo < 0 || maximo < minimo) {
                throw new Error(`Datos inválidos en la fila ${producto.fila}, código ${codigo || '(vacío)'}.`);
            }
            return producto;
        });

    const codigosFuente = new Set(productos.map((producto) => producto.codigo));
    const codigosCategoria = new Map();
    for (const producto of productos) {
        codigosCategoria.set(producto.codigoCategoria, (codigosCategoria.get(producto.codigoCategoria) || 0) + 1);
    }
    if (productos.length !== 700 || codigosFuente.size !== productos.length
        || codigosCategoria.size !== 20 || [...codigosCategoria.values()].some((total) => total !== 35)) {
        throw new Error('El catálogo debe tener 700 códigos únicos y 35 productos en cada una de las 20 categorías.');
    }

    const conexion = await db.promise().getConnection();
    try {
        await conexion.beginTransaction();

        const [categoriasDb] = await conexion.query('SELECT id_categoria FROM categorias WHERE estado = 1');
        const categoriasActivas = new Set(categoriasDb.map((fila) => Number(fila.id_categoria)));
        for (const idCategoria of categoriaPorCodigo.values()) {
            if (!categoriasActivas.has(idCategoria)) throw new Error(`La categoría ${idCategoria} no está activa en el sistema.`);
        }

        const [proveedoresDb] = await conexion.query('SELECT id_proveedor, razon_social, ruc FROM proveedores');
        const idProveedorPorRuc = new Map(proveedoresDb
            .filter((fila) => fila.ruc)
            .map((fila) => [String(fila.ruc).replace(/\D/g, ''), Number(fila.id_proveedor)]));
        const proveedoresArchivo = new Map();
        for (const producto of productos) {
            if (!proveedoresArchivo.has(producto.ruc)) proveedoresArchivo.set(producto.ruc, producto.proveedor);
            else if (proveedoresArchivo.get(producto.ruc) !== producto.proveedor) {
                throw new Error(`El RUC ${producto.ruc} figura con más de un proveedor.`);
            }
        }
        for (const [ruc, razonSocial] of proveedoresArchivo) {
            if (idProveedorPorRuc.has(ruc)) continue;
            const [insertado] = await conexion.query(
                'INSERT INTO proveedores (razon_social, ruc, estado) VALUES (?, ?, 1)',
                [razonSocial, ruc]
            );
            idProveedorPorRuc.set(ruc, insertado.insertId);
        }

        const [productosDb] = await conexion.query('SELECT id_producto, codigo, nombre FROM productos');
        const productoPorCodigo = new Map(productosDb.map((fila) => [fila.codigo, fila]));
        const agregadosPorCategoria = new Map();
        let reutilizados = 0;
        let codigosAdaptados = 0;

        for (const producto of productos) {
            const existente = productoPorCodigo.get(producto.codigo);
            if (existente && normalizar(existente.nombre) === normalizar(producto.nombre)) {
                reutilizados += 1;
                continue;
            }

            let codigoFinal = producto.codigo;
            if (existente) {
                const varianteExistente = [...productoPorCodigo.values()].find((fila) =>
                    fila.codigo.startsWith(`${producto.codigo}-CAT`) && normalizar(fila.nombre) === normalizar(producto.nombre));
                if (varianteExistente) {
                    reutilizados += 1;
                    continue;
                }

                let sufijo = 1;
                codigoFinal = `${producto.codigo}-CAT${sufijo}`;
                while (productoPorCodigo.has(codigoFinal)) {
                    sufijo += 1;
                    codigoFinal = `${producto.codigo}-CAT${sufijo}`;
                }
                codigosAdaptados += 1;
            }

            const descripcion = codigoFinal === producto.codigo
                ? null
                : `Código original del catálogo: ${producto.codigo}`;
            const [insertado] = await conexion.query(
                `INSERT INTO productos
                    (codigo, nombre, descripcion, id_categoria, id_proveedor, precio_compra, precio_venta,
                     stock_actual, stock_minimo, stock_maximo, unidad_medida, estado)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
                [codigoFinal, producto.nombre, descripcion, producto.idCategoria,
                    idProveedorPorRuc.get(producto.ruc), producto.compra, producto.venta,
                    producto.stock, producto.minimo, producto.maximo, producto.unidad]
            );
            const agregado = {
                id_producto: insertado.insertId,
                codigo: codigoFinal,
                nombre: producto.nombre,
                id_categoria: producto.idCategoria
            };
            productoPorCodigo.set(codigoFinal, agregado);
            agregadosPorCategoria.set(producto.idCategoria, (agregadosPorCategoria.get(producto.idCategoria) || 0) + 1);
        }

        const [conteoFinal] = await conexion.query(
            `SELECT c.id_categoria, c.nombre, COUNT(p.id_producto) AS productos
             FROM categorias c
             LEFT JOIN productos p ON p.id_categoria = c.id_categoria AND p.estado = 1
             WHERE c.estado = 1
             GROUP BY c.id_categoria, c.nombre
             ORDER BY c.id_categoria`
        );

        await conexion.commit();
        console.log(JSON.stringify({
            filas_catalogo: productos.length,
            productos_nuevos: [...agregadosPorCategoria.values()].reduce((suma, cantidad) => suma + cantidad, 0),
            filas_coincidentes_con_producto_existente: reutilizados,
            codigos_internos_adaptados: codigosAdaptados,
            proveedores_nuevos: [...proveedoresArchivo.keys()].filter((ruc) => !proveedoresDb.some((fila) => String(fila.ruc || '').replace(/\D/g, '') === ruc)).length,
            productos_por_categoria: conteoFinal.map((fila) => ({ categoria: fila.nombre, total: Number(fila.productos) })),
            historial_y_movimientos: 'sin modificar'
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
    console.error('No se importó el catálogo:', error.message);
    process.exitCode = 1;
});
