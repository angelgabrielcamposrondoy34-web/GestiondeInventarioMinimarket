const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const readXlsxFile = require('read-excel-file/node');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const db = require('./config/database');
const { MODEL_NAME, MIN_TRAIN_DAYS, MIN_VALIDATION_DAYS, trainDemandForecast } = require('./ml/forecast');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'minemarket_tesis_secreto_2026');
if (!JWT_SECRET) throw new Error('Configura JWT_SECRET antes de iniciar el servidor en producción.');
const origenesPermitidos = [process.env.CLIENT_ORIGIN, 'http://localhost:5173'].filter(Boolean);
app.use((req, res, next) => {
    const origen = req.get('origin');
    let mismoOrigen = false;
    try { mismoOrigen = Boolean(origen) && new URL(origen).host === req.get('host'); } catch {}
    return cors({ origin: (solicitud, callback) => {
        if (!solicitud || mismoOrigen || origenesPermitidos.includes(solicitud)) return callback(null, true);
        return callback(new Error('Origen no permitido por CORS.'));
    } })(req, res, next);
});
app.use(express.json());
const frontendDist = path.join(__dirname, '../frontend/dist');
app.use(express.static(frontendDist));
app.get('/health', (req, res) => res.status(200).json({ estado: 'ok' }));

// ========================================
// RUTA PRINCIPAL
// ========================================

app.get('/', (req, res) => {
    res.json({
        mensaje: 'API del Sistema de Inventarios funcionando correctamente'
    });
});
// ========================================
// LOGIN DE USUARIOS
// ========================================

app.post('/api/auth/login', (req, res) => {

    const { correo, password } = req.body;

    // Validar datos
    if (!correo || !password) {
        return res.status(400).json({
            error: 'El correo y la contraseña son obligatorios'
        });
    }

    // Buscar usuario
    const sql = `
        SELECT
            id_usuario,
            nombre,
            apellido,
            correo,
            password,
            rol,
            estado
        FROM usuarios
        WHERE correo = ?
        LIMIT 1
    `;

    db.query(sql, [correo], async (error, resultados) => {

        if (error) {
            console.error('❌ Error al buscar usuario:', error);

            return res.status(500).json({
                error: 'Error interno del servidor'
            });
        }

        // Usuario no encontrado
        if (resultados.length === 0) {
            return res.status(401).json({
                error: 'Correo o contraseña incorrectos'
            });
        }

        const usuario = resultados[0];

        // Verificar si el usuario está activo
        if (Number(usuario.estado) !== 1) {
            return res.status(403).json({
                error: 'El usuario está desactivado'
            });
        }

        // Comparar contraseña con bcrypt
        const passwordCorrecta = await bcrypt.compare(
            password,
            usuario.password
        );

        if (!passwordCorrecta) {
            return res.status(401).json({
                error: 'Correo o contraseña incorrectos'
            });
        }

        // Crear JWT
        const token = jwt.sign(
            {
                id_usuario: usuario.id_usuario,
                correo: usuario.correo,
                rol: usuario.rol
            },
            JWT_SECRET,
            {
                expiresIn: '8h'
            }
        );

        // Respuesta
        res.json({
            mensaje: 'Inicio de sesión exitoso',

            token,

            usuario: {
                id_usuario: usuario.id_usuario,
                nombre: usuario.nombre,
                apellido: usuario.apellido,
                correo: usuario.correo,
                rol: usuario.rol
            }
        });
    });
});

app.use('/api', (req, res, next) => {
    if (req.path === '/auth/login') return next();

    const encabezado = req.get('authorization') || '';
    const token = encabezado.startsWith('Bearer ') ? encabezado.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Inicia sesión para continuar.' });

    try {
        req.usuarioAutenticado = jwt.verify(token, JWT_SECRET);
        return next();
    } catch {
        return res.status(401).json({ error: 'La sesión venció. Inicia sesión nuevamente.' });
    }
});
// ========================================
// LISTAR CATEGORÍAS
// ========================================

app.get('/api/categorias', (req, res) => {

    const sql = `
        SELECT
            id_categoria,
            nombre,
            descripcion,
            estado,
            fecha_creacion
        FROM categorias
        WHERE estado = 1
        ORDER BY nombre ASC
    `;

    db.query(sql, (error, resultados) => {

        if (error) {
            console.error('❌ Error al consultar categorías:', error);

            return res.status(500).json({
                error: 'Error al consultar categorías'
            });
        }

        res.json(resultados);
    });
});

// ========================================
// REGISTRAR CATEGORÍA
// ========================================

app.post('/api/categorias', (req, res) => {

    const {
        nombre,
        descripcion
    } = req.body;

    if (!nombre) {
        return res.status(400).json({
            error: 'El nombre de la categoría es obligatorio'
        });
    }

    const sql = `
        INSERT INTO categorias (
            nombre,
            descripcion
        )
        VALUES (?, ?)
    `;

    db.query(
        sql,
        [nombre, descripcion || null],
        (error, resultado) => {

            if (error) {
                console.error('❌ Error al registrar categoría:', error);

                return res.status(500).json({
                    error: 'Error al registrar categoría'
                });
            }

            res.status(201).json({
                mensaje: 'Categoría registrada correctamente',
                id_categoria: resultado.insertId
            });
        }
    );
});
// ========================================
// ELIMINAR CATEGORÍA
// ========================================

app.delete('/api/categorias/:id', (req, res) => {
    const { id } = req.params;

    // Comprobar si existen productos asociados
    const sqlComprobar = `
        SELECT COUNT(*) AS total
        FROM productos
        WHERE id_categoria = ?
    `;

    db.query(sqlComprobar, [id], (error, resultados) => {
        if (error) {
            console.error('Error al comprobar la categoría:', error);

            return res.status(500).json({
                error: 'Error al comprobar los productos asociados'
            });
        }

        const totalProductos = Number(resultados[0].total);

        // No eliminar categorías que tengan productos asociados
        if (totalProductos > 0) {
            return res.status(409).json({
                error: 'No se puede eliminar esta categoría porque tiene productos asociados. Puedes conservarla o desactivarla.'
            });
        }

        const sqlEliminar = `
            DELETE FROM categorias
            WHERE id_categoria = ?
        `;

        db.query(sqlEliminar, [id], (errorEliminar, resultado) => {
            if (errorEliminar) {
                console.error('Error al eliminar categoría:', errorEliminar);

                return res.status(500).json({
                    error: 'No se pudo eliminar la categoría'
                });
            }

            if (resultado.affectedRows === 0) {
                return res.status(404).json({
                    error: 'Categoría no encontrada'
                });
            }

            res.json({
                mensaje: 'Categoría eliminada correctamente'
            });
        });
    });
});
// ========================================
// GESTIÓN DE PROVEEDORES
// ========================================

// LISTAR PROVEEDORES
app.get('/api/proveedores', (req, res) => {
    const sql = `
        SELECT
            id_proveedor,
            razon_social,
            ruc,
            telefono,
            correo,
            direccion,
            estado,
            fecha_creacion
        FROM proveedores
        ORDER BY razon_social ASC
    `;

    db.query(sql, (error, resultados) => {
        if (error) {
            console.error('Error al consultar proveedores:', error);
            return res.status(500).json({
                error: 'Error al consultar proveedores'
            });
        }

        res.json(resultados);
    });
});


// REGISTRAR PROVEEDOR
app.post('/api/proveedores', (req, res) => {
    const {
        razon_social,
        ruc,
        telefono,
        correo,
        direccion
    } = req.body;

    if (!razon_social || !razon_social.trim()) {
        return res.status(400).json({
            error: 'La razón social es obligatoria'
        });
    }

    if (ruc && !/^\d{11}$/.test(ruc)) {
        return res.status(400).json({
            error: 'El RUC debe contener exactamente 11 dígitos'
        });
    }

    const sql = `
        INSERT INTO proveedores (
            razon_social,
            ruc,
            telefono,
            correo,
            direccion
        )
        VALUES (?, ?, ?, ?, ?)
    `;

    const valores = [
        razon_social.trim(),
        ruc || null,
        telefono || null,
        correo || null,
        direccion || null
    ];

    db.query(sql, valores, (error, resultado) => {
        if (error) {
            console.error('Error al registrar proveedor:', error);

            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    error: 'Ya existe un proveedor con ese RUC'
                });
            }

            return res.status(500).json({
                error: 'Error al registrar proveedor'
            });
        }

        res.status(201).json({
            mensaje: 'Proveedor registrado correctamente',
            id_proveedor: resultado.insertId
        });
    });
});


// EDITAR PROVEEDOR
app.put('/api/proveedores/:id', (req, res) => {
    const { id } = req.params;

    const {
        razon_social,
        ruc,
        telefono,
        correo,
        direccion,
        estado
    } = req.body;

    if (!razon_social || !razon_social.trim()) {
        return res.status(400).json({
            error: 'La razón social es obligatoria'
        });
    }

    if (ruc && !/^\d{11}$/.test(ruc)) {
        return res.status(400).json({
            error: 'El RUC debe contener exactamente 11 dígitos'
        });
    }

    const sql = `
        UPDATE proveedores
        SET
            razon_social = ?,
            ruc = ?,
            telefono = ?,
            correo = ?,
            direccion = ?,
            estado = ?
        WHERE id_proveedor = ?
    `;

    const valores = [
        razon_social.trim(),
        ruc || null,
        telefono || null,
        correo || null,
        direccion || null,
        estado === undefined ? 1 : Number(estado),
        id
    ];

    db.query(sql, valores, (error, resultado) => {
        if (error) {
            console.error('Error al actualizar proveedor:', error);

            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    error: 'Ya existe un proveedor con ese RUC'
                });
            }

            return res.status(500).json({
                error: 'Error al actualizar proveedor'
            });
        }

        if (resultado.affectedRows === 0) {
            return res.status(404).json({
                error: 'Proveedor no encontrado o sin cambios'
            });
        }

        res.json({
            mensaje: 'Proveedor actualizado correctamente'
        });
    });
});
// ========================================
// LISTAR PRODUCTOS
// ========================================

app.get('/api/productos', (req, res) => {

    const sql = `
        SELECT 
            p.id_producto,
            p.codigo,
            p.nombre,
            p.descripcion,
            p.id_categoria,
            p.id_proveedor,
            p.precio_compra,
            p.precio_venta,
            p.stock_actual,
            p.stock_minimo,
            p.stock_maximo,
            p.unidad_medida,
            p.estado,
            c.nombre AS categoria,
            pr.razon_social AS proveedor
        FROM productos p
        INNER JOIN categorias c 
            ON p.id_categoria = c.id_categoria
        LEFT JOIN proveedores pr 
            ON p.id_proveedor = pr.id_proveedor
        WHERE p.estado = 1
        ORDER BY p.id_producto DESC
    `;

    db.query(sql, (error, resultados) => {

        if (error) {
            console.error('❌ Error al consultar productos:', error);

            return res.status(500).json({
                error: 'Error al consultar productos'
            });
        }

        res.json(resultados);
    });
});

// ========================================
// OBTENER UN PRODUCTO
// ========================================

app.get('/api/productos/:id', (req, res) => {

    const { id } = req.params;

    const sql = `
        SELECT *
        FROM productos
        WHERE id_producto = ?
    `;

    db.query(sql, [id], (error, resultados) => {

        if (error) {
            console.error('❌ Error al consultar producto:', error);

            return res.status(500).json({
                error: 'Error al consultar producto'
            });
        }

        if (resultados.length === 0) {
            return res.status(404).json({
                error: 'Producto no encontrado'
            });
        }

        res.json(resultados[0]);
    });
});

// ========================================
// REGISTRAR PRODUCTO
// ========================================

app.post('/api/productos', (req, res) => {

    const {
        codigo,
        nombre,
        descripcion,
        id_categoria,
        id_proveedor,
        precio_compra,
        precio_venta,
        stock_actual,
        stock_minimo,
        stock_maximo,
        unidad_medida
    } = req.body;

    if (!codigo || !nombre || !id_categoria || precio_compra === undefined || precio_venta === undefined) {
        return res.status(400).json({
            error: 'Faltan datos obligatorios'
        });
    }

    const sql = `
        INSERT INTO productos (
            codigo,
            nombre,
            descripcion,
            id_categoria,
            id_proveedor,
            precio_compra,
            precio_venta,
            stock_actual,
            stock_minimo,
            stock_maximo,
            unidad_medida
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const valores = [
        codigo,
        nombre,
        descripcion || null,
        id_categoria,
        id_proveedor || null,
        precio_compra,
        precio_venta,
        stock_actual || 0,
        stock_minimo || 5,
        stock_maximo || 100,
        unidad_medida || 'UNIDAD'
    ];

    db.query(sql, valores, (error, resultado) => {

        if (error) {
            console.error('❌ Error al registrar producto:', error);

            return res.status(500).json({
                error: 'Error al registrar producto'
            });
        }

        res.status(201).json({
            mensaje: 'Producto registrado correctamente',
            id_producto: resultado.insertId
        });
    });
});

// ========================================
// EDITAR PRODUCTO
// ========================================

app.put('/api/productos/:id', (req, res) => {

    const { id } = req.params;

    const {
        codigo,
        nombre,
        descripcion,
        id_categoria,
        id_proveedor,
        precio_compra,
        precio_venta,
        stock_actual,
        stock_minimo,
        stock_maximo,
        unidad_medida,
        estado
    } = req.body;

    const sql = `
        UPDATE productos
        SET
            codigo = ?,
            nombre = ?,
            descripcion = ?,
            id_categoria = ?,
            id_proveedor = ?,
            precio_compra = ?,
            precio_venta = ?,
            stock_actual = ?,
            stock_minimo = ?,
            stock_maximo = ?,
            unidad_medida = ?,
            estado = ?
        WHERE id_producto = ?
    `;

    const valores = [
        codigo,
        nombre,
        descripcion || null,
        id_categoria,
        id_proveedor || null,
        precio_compra,
        precio_venta,
        stock_actual,
        stock_minimo,
        stock_maximo,
        unidad_medida,
        estado ?? 1,
        id
    ];

    db.query(sql, valores, (error, resultado) => {

        if (error) {
            console.error('❌ Error al actualizar producto:', error);

            return res.status(500).json({
                error: 'Error al actualizar producto'
            });
        }

        if (resultado.affectedRows === 0) {
            return res.status(404).json({
                error: 'Producto no encontrado'
            });
        }

        res.json({
            mensaje: 'Producto actualizado correctamente'
        });
    });
});

// ========================================
// ELIMINAR PRODUCTO
// ========================================

app.delete('/api/productos/:id', (req, res) => {

    const { id } = req.params;

    const sql = `
        DELETE FROM productos
        WHERE id_producto = ?
    `;

    db.query(sql, [id], (error, resultado) => {

        if (error) {
            console.error('❌ Error al eliminar producto:', error);

            return res.status(500).json({
                error: 'No se puede eliminar el producto'
            });
        }

        if (resultado.affectedRows === 0) {
            return res.status(404).json({
                error: 'Producto no encontrado'
            });
        }

        res.json({
            mensaje: 'Producto eliminado correctamente'
        });
    });
});
// ==========================================
// MÓDULO DE COMPRAS
// ==========================================

// LISTAR COMPRAS
app.get('/api/compras', (req, res) => {
    const sql = `
        SELECT
            c.id_compra,
            c.fecha_compra,
            c.numero_documento,
            c.total,
            c.id_proveedor,
            pr.razon_social AS proveedor,
            c.id_usuario,
            CONCAT(u.nombre, ' ', u.apellido) AS usuario,
            COUNT(dc.id_detalle_compra) AS cantidad_detalles
        FROM compras c
        INNER JOIN proveedores pr
            ON c.id_proveedor = pr.id_proveedor
        INNER JOIN usuarios u
            ON c.id_usuario = u.id_usuario
        LEFT JOIN detalle_compras dc
            ON c.id_compra = dc.id_compra
        GROUP BY
            c.id_compra,
            c.fecha_compra,
            c.numero_documento,
            c.total,
            c.id_proveedor,
            pr.razon_social,
            c.id_usuario,
            u.nombre,
            u.apellido
        ORDER BY c.id_compra DESC
    `;

    db.query(sql, (error, resultados) => {
        if (error) {
            console.error('Error al listar compras:', error);
            return res.status(500).json({
                error: 'Error al consultar las compras'
            });
        }

        res.json(resultados);
    });
});


// CONSULTAR UNA COMPRA CON SUS DETALLES
app.get('/api/compras/:id', (req, res) => {
    const idCompra = Number(req.params.id);

    if (!Number.isInteger(idCompra) || idCompra <= 0) {
        return res.status(400).json({
            error: 'El identificador de compra no es válido'
        });
    }

    const sqlCompra = `
        SELECT
            c.id_compra,
            c.fecha_compra,
            c.numero_documento,
            c.total,
            c.id_proveedor,
            pr.razon_social AS proveedor,
            c.id_usuario,
            CONCAT(u.nombre, ' ', u.apellido) AS usuario
        FROM compras c
        INNER JOIN proveedores pr
            ON c.id_proveedor = pr.id_proveedor
        INNER JOIN usuarios u
            ON c.id_usuario = u.id_usuario
        WHERE c.id_compra = ?
    `;

    db.query(sqlCompra, [idCompra], (error, compras) => {
        if (error) {
            console.error('Error al consultar compra:', error);
            return res.status(500).json({
                error: 'Error al consultar la compra'
            });
        }

        if (compras.length === 0) {
            return res.status(404).json({
                error: 'Compra no encontrada'
            });
        }

        const sqlDetalles = `
            SELECT
                dc.id_detalle_compra,
                dc.id_producto,
                p.codigo,
                p.nombre AS producto,
                dc.cantidad,
                dc.precio_unitario,
                (dc.cantidad * dc.precio_unitario) AS subtotal
            FROM detalle_compras dc
            INNER JOIN productos p
                ON dc.id_producto = p.id_producto
            WHERE dc.id_compra = ?
            ORDER BY dc.id_detalle_compra ASC
        `;

        db.query(sqlDetalles, [idCompra], (errorDetalles, detalles) => {
            if (errorDetalles) {
                console.error('Error al consultar detalles:', errorDetalles);
                return res.status(500).json({
                    error: 'Error al consultar los detalles de la compra'
                });
            }

            res.json({
                ...compras[0],
                detalles
            });
        });
    });
});


// REGISTRAR UNA COMPRA
app.post('/api/compras', async (req, res) => {
    const {
        id_proveedor,
        id_usuario,
        numero_documento,
        productos
    } = req.body;

    const idProveedor = Number(id_proveedor);
    const idUsuario = Number(id_usuario);

    if (
        !Number.isInteger(idProveedor) ||
        idProveedor <= 0 ||
        !Number.isInteger(idUsuario) ||
        idUsuario <= 0
    ) {
        return res.status(400).json({
            error: 'Selecciona un proveedor y un usuario válidos'
        });
    }

    if (!Array.isArray(productos) || productos.length === 0) {
        return res.status(400).json({
            error: 'Debes agregar al menos un producto a la compra'
        });
    }

    // Validar productos y cantidades antes de iniciar la transacción.
    const productosCompra = [];

    for (const item of productos) {
        const idProducto = Number(item.id_producto);
        const cantidad = Number(item.cantidad);
        const precioUnitario = Number(item.precio_unitario);

        if (
            !Number.isInteger(idProducto) ||
            idProducto <= 0 ||
            !Number.isInteger(cantidad) ||
            cantidad <= 0 ||
            !Number.isFinite(precioUnitario) ||
            precioUnitario < 0
        ) {
            return res.status(400).json({
                error: 'Verifica los productos, las cantidades y los precios'
            });
        }

        // Convertir el precio a céntimos para calcular el total.
        const precioCentimos = Math.round(precioUnitario * 100);

        if (!Number.isSafeInteger(precioCentimos)) {
            return res.status(400).json({
                error: 'Uno de los precios no es válido'
            });
        }

        productosCompra.push({
            id_producto: idProducto,
            cantidad,
            precioCentimos
        });
    }

    // Evitar desbordamientos en el cálculo del total.
    const totalCentimos = productosCompra.reduce(
        (total, item) =>
            total + item.cantidad * item.precioCentimos,
        0
    );

    if (
        !Number.isSafeInteger(totalCentimos) ||
        totalCentimos > 9999999999
    ) {
        return res.status(400).json({
            error: 'El total de la compra supera el límite permitido'
        });
    }

    let conexion;

    try {
        conexion = await new Promise((resolve, reject) => {
            db.getConnection((error, connection) => {
                if (error) return reject(error);
                resolve(connection);
            });
        });

        const conn = conexion.promise();

        await conn.beginTransaction();

        // Verificar que el proveedor exista y esté activo.
        const [proveedores] = await conn.query(
            `SELECT id_proveedor
             FROM proveedores
             WHERE id_proveedor = ? AND estado = 1`,
            [idProveedor]
        );

        if (proveedores.length === 0) {
            throw new Error('El proveedor no existe o está desactivado');
        }

        // Verificar que el usuario exista y esté activo.
        const [usuarios] = await conn.query(
            `SELECT id_usuario
             FROM usuarios
             WHERE id_usuario = ? AND estado = 1`,
            [idUsuario]
        );

        if (usuarios.length === 0) {
            throw new Error('El usuario no existe o está desactivado');
        }

        // Crear la cabecera de la compra.
        const [resultadoCompra] = await conn.query(
            `INSERT INTO compras
                (id_proveedor, id_usuario, numero_documento, total)
             VALUES (?, ?, ?, ?)`,
            [
                idProveedor,
                idUsuario,
                numero_documento && String(numero_documento).trim()
                    ? String(numero_documento).trim().slice(0, 50)
                    : null,
                (totalCentimos / 100).toFixed(2)
            ]
        );

        const idCompra = resultadoCompra.insertId;

        // Guardar los detalles, actualizar el stock y registrar
        // un movimiento ENTRADA por cada línea de compra.
        for (const item of productosCompra) {
            const [productosEncontrados] = await conn.query(
                `SELECT id_producto, nombre, stock_actual
                 FROM productos
                 WHERE id_producto = ? AND estado = 1
                 FOR UPDATE`,
                [item.id_producto]
            );

            if (productosEncontrados.length === 0) {
                throw new Error(
                    `El producto ${item.id_producto} no existe o está desactivado`
                );
            }

            const producto = productosEncontrados[0];
            const stockAnterior = Number(producto.stock_actual);
            const stockNuevo = stockAnterior + item.cantidad;

            if (!Number.isSafeInteger(stockNuevo) || stockNuevo > 2147483647) {
                throw new Error(
                    `La cantidad supera el límite de stock para ${producto.nombre}`
                );
            }

            const precioUnitario = (item.precioCentimos / 100).toFixed(2);

            await conn.query(
                `INSERT INTO detalle_compras
                    (id_compra, id_producto, cantidad, precio_unitario)
                 VALUES (?, ?, ?, ?)`,
                [
                    idCompra,
                    item.id_producto,
                    item.cantidad,
                    precioUnitario
                ]
            );

            await conn.query(
                `UPDATE productos
                 SET stock_actual = stock_actual + ?
                 WHERE id_producto = ?`,
                [item.cantidad, item.id_producto]
            );

            await conn.query(
                `INSERT INTO movimientos_inventario
                    (id_producto, id_usuario, tipo_movimiento,
                     cantidad, stock_anterior, stock_nuevo, motivo)
                 VALUES (?, ?, 'ENTRADA', ?, ?, ?, ?)`,
                [
                    item.id_producto,
                    idUsuario,
                    item.cantidad,
                    stockAnterior,
                    stockNuevo,
                    `Compra #${idCompra}`
                ]
            );
        }

        await conn.commit();

        res.status(201).json({
            mensaje: 'Compra registrada correctamente',
            id_compra: idCompra,
            total: (totalCentimos / 100).toFixed(2)
        });

    } catch (error) {
        if (conexion) {
            try {
                await conexion.promise().rollback();
            } catch (errorRollback) {
                console.error('Error al revertir la compra:', errorRollback);
            }
        }

        console.error('Error al registrar compra:', error);

        const esValidacion =
            error.message.includes('no existe') ||
            error.message.includes('desactivado') ||
            error.message.includes('supera el límite');

        res.status(esValidacion ? 400 : 500).json({
            error: esValidacion
                ? error.message
                : 'No se pudo registrar la compra. No se confirmaron los cambios.'
        });

    } finally {
        if (conexion) {
            conexion.release();
        }
    }
});
// ========================================
// INICIAR SERVIDOR
// ========================================

const PORT = Number(process.env.PORT) || 3000;
// ==========================================
// DASHBOARD
// ==========================================

app.get('/api/dashboard', (req, res) => {

    const sql = `
        SELECT
            COUNT(*) AS total_productos,

            SUM(
                CASE
                    WHEN stock_actual = 0 THEN 1
                    ELSE 0
                END
            ) AS productos_agotados,

            SUM(
                CASE
                    WHEN stock_actual > 0
                    AND stock_actual <= stock_minimo
                    THEN 1
                    ELSE 0
                END
            ) AS productos_stock_bajo,

            SUM(
                CASE
                    WHEN stock_actual > stock_minimo
                    AND stock_actual <= stock_maximo
                    THEN 1
                    ELSE 0
                END
            ) AS productos_stock_normal,

            SUM(
                CASE
                    WHEN stock_actual > stock_maximo
                    THEN 1
                    ELSE 0
                END
            ) AS productos_sobrestock

        FROM productos
        WHERE estado = 1
    `;

    db.query(sql, (error, resultados) => {

        if (error) {
            console.error(
                '❌ Error al obtener dashboard:',
                error
            );

            return res.status(500).json({
                error: 'Error al obtener información del dashboard'
            });
        }

        const estadisticas = resultados[0];

        const sqlCategorias = `
            SELECT COUNT(*) AS total_categorias
            FROM categorias
            WHERE estado = 1
        `;

        db.query(
            sqlCategorias,
            (errorCategorias, resultadosCategorias) => {

                if (errorCategorias) {
                    console.error(
                        '❌ Error al obtener categorías:',
                        errorCategorias
                    );

                    return res.status(500).json({
                        error: 'Error al obtener categorías'
                    });
                }

                res.json({
                    total_productos:
                        Number(estadisticas.total_productos || 0),

                    productos_agotados:
                        Number(estadisticas.productos_agotados || 0),

                    productos_stock_bajo:
                        Number(estadisticas.productos_stock_bajo || 0),

                    productos_stock_normal:
                        Number(estadisticas.productos_stock_normal || 0),

                    productos_sobrestock:
                        Number(estadisticas.productos_sobrestock || 0),

                    total_categorias:
                        Number(
                            resultadosCategorias[0].total_categorias || 0
                        )
                });
            }
        );
    });
});
// ==========================================
// MOVIMIENTOS DE INVENTARIO
// ==========================================

// Obtener todos los movimientos
app.get('/api/movimientos', (req, res) => {
    const sql = `
        SELECT
            m.id_movimiento,
            m.id_producto,
            m.id_usuario,
            m.tipo_movimiento,
            m.cantidad,
            m.stock_anterior,
            m.stock_nuevo,
            m.motivo,
            m.fecha_movimiento,
            p.codigo,
            p.nombre AS nombre_producto
        FROM movimientos_inventario m
        INNER JOIN productos p
            ON m.id_producto = p.id_producto
        ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
    `;

    db.query(sql, (error, resultados) => {
        if (error) {
            console.error('❌ Error al obtener movimientos:', error);
            return res.status(500).json({
                error: 'Error al obtener movimientos'
            });
        }

        res.json(resultados);
    });
});


// Registrar un nuevo movimiento
app.post('/api/movimientos', (req, res) => {

    const {
        id_producto,
        id_usuario,
        tipo_movimiento,
        cantidad,
        motivo
    } = req.body;

    // Validaciones básicas
    if (!id_producto) {
        return res.status(400).json({
            error: 'El producto es obligatorio'
        });
    }

    if (!id_usuario) {
        return res.status(400).json({
            error: 'El usuario es obligatorio'
        });
    }

    if (!tipo_movimiento) {
        return res.status(400).json({
            error: 'El tipo de movimiento es obligatorio'
        });
    }

    if (!cantidad || Number(cantidad) <= 0) {
        return res.status(400).json({
            error: 'La cantidad debe ser mayor que 0'
        });
    }

    const tiposPermitidos = [
        'ENTRADA',
        'SALIDA',
        'AJUSTE',
        'DEVOLUCION'
    ];

    if (!tiposPermitidos.includes(tipo_movimiento)) {
        return res.status(400).json({
            error: 'Tipo de movimiento no válido'
        });
    }

    // Buscar producto
    const sqlProducto = `
        SELECT
            id_producto,
            nombre,
            stock_actual
        FROM productos
        WHERE id_producto = ?
          AND estado = 1
    `;

    db.query(
        sqlProducto,
        [id_producto],
        (error, productosEncontrados) => {

            if (error) {
                console.error('❌ Error al buscar producto:', error);

                return res.status(500).json({
                    error: 'Error al buscar producto'
                });
            }

            if (productosEncontrados.length === 0) {
                return res.status(404).json({
                    error: 'Producto no encontrado'
                });
            }

            const producto = productosEncontrados[0];

            const stockAnterior = Number(producto.stock_actual);
            const cantidadMovimiento = Number(cantidad);

            let stockNuevo;

            // Calcular nuevo stock
            switch (tipo_movimiento) {

                case 'ENTRADA':
                    stockNuevo = stockAnterior + cantidadMovimiento;
                    break;

                case 'SALIDA':
                    stockNuevo = stockAnterior - cantidadMovimiento;
                    break;

                case 'DEVOLUCION':
                    stockNuevo = stockAnterior + cantidadMovimiento;
                    break;

                case 'AJUSTE':
                    // En AJUSTE, cantidad representa
                    // el nuevo stock deseado.
                    stockNuevo = cantidadMovimiento;
                    break;

                default:
                    return res.status(400).json({
                        error: 'Tipo de movimiento no válido'
                    });
            }

            // Evitar stock negativo
            if (stockNuevo < 0) {
                return res.status(400).json({
                    error: `Stock insuficiente. Stock actual: ${stockAnterior}`
                });
            }

            // Actualizar producto
            const sqlActualizar = `
                UPDATE productos
                SET stock_actual = ?
                WHERE id_producto = ?
            `;

            db.query(
                sqlActualizar,
                [stockNuevo, id_producto],
                (errorActualizar) => {

                    if (errorActualizar) {
                        console.error(
                            '❌ Error al actualizar stock:',
                            errorActualizar
                        );

                        return res.status(500).json({
                            error: 'Error al actualizar stock'
                        });
                    }

                    // Registrar movimiento
                    const sqlMovimiento = `
                        INSERT INTO movimientos_inventario
                        (
                            id_producto,
                            id_usuario,
                            tipo_movimiento,
                            cantidad,
                            stock_anterior,
                            stock_nuevo,
                            motivo
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `;

                    db.query(
                        sqlMovimiento,
                        [
                            id_producto,
                            id_usuario,
                            tipo_movimiento,
                            cantidadMovimiento,
                            stockAnterior,
                            stockNuevo,
                            motivo || null
                        ],
                        (errorMovimiento, resultado) => {

                            if (errorMovimiento) {
                                console.error(
                                    '❌ Error al registrar movimiento:',
                                    errorMovimiento
                                );

                                // Intentar revertir el stock
                                db.query(
                                    `
                                    UPDATE productos
                                    SET stock_actual = ?
                                    WHERE id_producto = ?
                                    `,
                                    [stockAnterior, id_producto]
                                );

                                return res.status(500).json({
                                    error: 'Error al registrar movimiento'
                                });
                            }

                            res.status(201).json({
                                mensaje: 'Movimiento registrado correctamente',
                                id_movimiento: resultado.insertId,
                                producto: producto.nombre,
                                tipo_movimiento,
                                cantidad: cantidadMovimiento,
                                stock_anterior: stockAnterior,
                                stock_nuevo: stockNuevo
                            });
                        }
                    );
                }
            );
        }
    );
});

// OBTENER TODOS LOS MOVIMIENTOS
app.get('/api/movimientos', (req, res) => {
    const sql = `
        SELECT
            m.id_movimiento,
            m.id_producto,
            m.id_usuario,
            m.tipo_movimiento,
            m.cantidad,
            m.stock_anterior,
            m.stock_nuevo,
            m.motivo,
            m.fecha_movimiento,
            p.codigo,
            p.nombre AS nombre_producto,
            CONCAT(u.nombre, ' ', u.apellido) AS nombre_usuario
        FROM movimientos_inventario m
        INNER JOIN productos p
            ON m.id_producto = p.id_producto
        INNER JOIN usuarios u
            ON m.id_usuario = u.id_usuario
        ORDER BY m.fecha_movimiento DESC, m.id_movimiento DESC
    `;

    db.query(sql, (error, resultados) => {
        if (error) {
            console.error('❌ Error al obtener movimientos:', error);
            return res.status(500).json({
                error: 'Error al obtener movimientos'
            });
        }

        res.json(resultados);
    });
});


// REGISTRAR UN MOVIMIENTO
app.post('/api/movimientos', (req, res) => {

    const {
        id_producto,
        id_usuario,
        tipo_movimiento,
        cantidad,
        motivo
    } = req.body;

    // -----------------------------
    // VALIDACIONES
    // -----------------------------

    if (!id_producto) {
        return res.status(400).json({
            error: 'El producto es obligatorio'
        });
    }

    if (!id_usuario) {
        return res.status(400).json({
            error: 'El usuario es obligatorio'
        });
    }

    if (!tipo_movimiento) {
        return res.status(400).json({
            error: 'El tipo de movimiento es obligatorio'
        });
    }

    if (!cantidad || Number(cantidad) <= 0) {
        return res.status(400).json({
            error: 'La cantidad debe ser mayor que 0'
        });
    }

    const tiposPermitidos = [
        'ENTRADA',
        'SALIDA',
        'AJUSTE',
        'DEVOLUCION'
    ];

    if (!tiposPermitidos.includes(tipo_movimiento)) {
        return res.status(400).json({
            error: 'Tipo de movimiento no válido'
        });
    }

    // -----------------------------
    // BUSCAR PRODUCTO
    // -----------------------------

    const sqlProducto = `
        SELECT
            id_producto,
            nombre,
            stock_actual
        FROM productos
        WHERE id_producto = ?
        AND estado = 1
    `;

    db.query(
        sqlProducto,
        [id_producto],
        (error, productosEncontrados) => {

            if (error) {
                console.error('❌ Error al buscar producto:', error);

                return res.status(500).json({
                    error: 'Error al buscar producto'
                });
            }

            if (productosEncontrados.length === 0) {
                return res.status(404).json({
                    error: 'Producto no encontrado'
                });
            }

            const producto = productosEncontrados[0];

            const stockAnterior = Number(producto.stock_actual);
            const cantidadMovimiento = Number(cantidad);

            let stockNuevo;

            // -----------------------------
            // CALCULAR NUEVO STOCK
            // -----------------------------

            switch (tipo_movimiento) {

                case 'ENTRADA':
                    stockNuevo = stockAnterior + cantidadMovimiento;
                    break;

                case 'SALIDA':
                    stockNuevo = stockAnterior - cantidadMovimiento;
                    break;

                case 'DEVOLUCION':
                    stockNuevo = stockAnterior + cantidadMovimiento;
                    break;

                case 'AJUSTE':
                    // En AJUSTE, cantidad representa
                    // el nuevo stock deseado
                    stockNuevo = cantidadMovimiento;
                    break;

                default:
                    return res.status(400).json({
                        error: 'Tipo de movimiento no válido'
                    });
            }

            // -----------------------------
            // EVITAR STOCK NEGATIVO
            // -----------------------------

            if (stockNuevo < 0) {
                return res.status(400).json({
                    error: `Stock insuficiente. Stock actual: ${stockAnterior}`
                });
            }

            // -----------------------------
            // ACTUALIZAR PRODUCTO
            // -----------------------------

            const sqlActualizar = `
                UPDATE productos
                SET stock_actual = ?
                WHERE id_producto = ?
            `;

            db.query(
                sqlActualizar,
                [stockNuevo, id_producto],
                (errorActualizar) => {

                    if (errorActualizar) {
                        console.error(
                            '❌ Error al actualizar stock:',
                            errorActualizar
                        );

                        return res.status(500).json({
                            error: 'Error al actualizar stock'
                        });
                    }

                    // -----------------------------
                    // REGISTRAR MOVIMIENTO
                    // -----------------------------

                    const sqlMovimiento = `
                        INSERT INTO movimientos_inventario
                        (
                            id_producto,
                            id_usuario,
                            tipo_movimiento,
                            cantidad,
                            stock_anterior,
                            stock_nuevo,
                            motivo
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    `;

                    db.query(
                        sqlMovimiento,
                        [
                            id_producto,
                            id_usuario,
                            tipo_movimiento,
                            cantidadMovimiento,
                            stockAnterior,
                            stockNuevo,
                            motivo || null
                        ],
                        (errorMovimiento, resultado) => {

                            if (errorMovimiento) {

                                console.error(
                                    '❌ Error al registrar movimiento:',
                                    errorMovimiento
                                );

                                // Si falla el registro,
                                // intentamos recuperar el stock anterior
                                db.query(
                                    `
                                    UPDATE productos
                                    SET stock_actual = ?
                                    WHERE id_producto = ?
                                    `,
                                    [
                                        stockAnterior,
                                        id_producto
                                    ]
                                );

                                return res.status(500).json({
                                    error: 'Error al registrar movimiento'
                                });
                            }

                            // -----------------------------
                            // RESPUESTA EXITOSA
                            // -----------------------------

                            res.status(201).json({

                                mensaje:
                                    'Movimiento registrado correctamente',

                                id_movimiento:
                                    resultado.insertId,

                                producto:
                                    producto.nombre,

                                tipo_movimiento:
                                    tipo_movimiento,

                                cantidad:
                                    cantidadMovimiento,

                                stock_anterior:
                                    stockAnterior,

                                stock_nuevo:
                                    stockNuevo
                            });
                        }
                    );
                }
            );
        }
    );
});
// ==========================================
// ALERTAS DE INVENTARIO
// ==========================================

// Obtener todas las alertas
app.get('/api/alertas', (req, res) => {
    const sql = `
        SELECT
            a.id_alerta,
            a.id_producto,
            a.tipo_alerta,
            a.mensaje,
            a.nivel,
            a.atendida,
            a.fecha_alerta,
            p.codigo,
            p.nombre AS nombre_producto,
            p.stock_actual,
            p.stock_minimo,
            p.stock_maximo
        FROM alertas a
        INNER JOIN productos p
            ON a.id_producto = p.id_producto
        ORDER BY
            a.atendida ASC,
            a.fecha_alerta DESC,
            a.id_alerta DESC
    `;

    db.query(sql, (error, resultados) => {
        if (error) {
            console.error('❌ Error al obtener alertas:', error);
            return res.status(500).json({
                error: 'Error al obtener alertas'
            });
        }

        res.json(resultados);
    });
});


// Generar alertas automáticamente
app.post('/api/alertas/generar', (req, res) => {

    const sqlProductos = `
        SELECT
            id_producto,
            codigo,
            nombre,
            stock_actual,
            stock_minimo,
            stock_maximo
        FROM productos
        WHERE estado = 1
    `;

    db.query(sqlProductos, (error, productos) => {

        if (error) {
            console.error('❌ Error al consultar productos:', error);
            return res.status(500).json({
                error: 'Error al consultar productos'
            });
        }

        let alertasGeneradas = 0;
        let procesados = 0;

        if (productos.length === 0) {
            return res.json({
                mensaje: 'No existen productos para analizar',
                alertas_generadas: 0
            });
        }

        productos.forEach((producto) => {

            let tipoAlerta = null;
            let nivel = 'MEDIO';
            let mensaje = '';

            const stock = Number(producto.stock_actual);
            const stockMinimo = Number(producto.stock_minimo);
            const stockMaximo = Number(producto.stock_maximo);

            // STOCK AGOTADO
            if (stock === 0) {

                tipoAlerta = 'STOCK_AGOTADO';
                nivel = 'CRITICO';

                mensaje = `El producto ${producto.nombre} está agotado.`;

            }

            // STOCK BAJO
            else if (stock > 0 && stock <= stockMinimo) {

                tipoAlerta = 'STOCK_BAJO';
                nivel = 'ALTO';

                mensaje = `El producto ${producto.nombre} tiene stock bajo. Stock actual: ${stock}.`;

            }

            // SOBRESTOCK
            else if (stock > stockMaximo) {

                tipoAlerta = 'SOBRESTOCK';
                nivel = 'MEDIO';

                mensaje = `El producto ${producto.nombre} presenta sobrestock. Stock actual: ${stock}.`;

            }

            // Si no necesita alerta, continuamos
            if (!tipoAlerta) {
                procesados++;

                if (procesados === productos.length) {
                    return res.json({
                        mensaje: 'Análisis de inventario completado',
                        alertas_generadas: alertasGeneradas
                    });
                }

                return;
            }


            // Verificar si ya existe una alerta pendiente
            const sqlExiste = `
                SELECT id_alerta
                FROM alertas
                WHERE id_producto = ?
                AND tipo_alerta = ?
                AND atendida = 0
                LIMIT 1
            `;

            db.query(
                sqlExiste,
                [producto.id_producto, tipoAlerta],
                (errorExiste, alertasExistentes) => {

                    if (errorExiste) {
                        console.error('❌ Error al verificar alerta:', errorExiste);
                        procesados++;

                        if (procesados === productos.length) {
                            return res.json({
                                mensaje: 'Análisis completado con algunos errores',
                                alertas_generadas: alertasGeneradas
                            });
                        }

                        return;
                    }


                    // Si ya existe una alerta pendiente, no duplicarla
                    if (alertasExistentes.length > 0) {

                        procesados++;

                        if (procesados === productos.length) {
                            return res.json({
                                mensaje: 'Análisis de inventario completado',
                                alertas_generadas: alertasGeneradas
                            });
                        }

                        return;
                    }


                    // Crear nueva alerta
                    const sqlInsertar = `
                        INSERT INTO alertas
                        (
                            id_producto,
                            tipo_alerta,
                            mensaje,
                            nivel,
                            atendida
                        )
                        VALUES (?, ?, ?, ?, 0)
                    `;

                    db.query(
                        sqlInsertar,
                        [
                            producto.id_producto,
                            tipoAlerta,
                            mensaje,
                            nivel
                        ],
                        (errorInsertar) => {

                            if (errorInsertar) {
                                console.error('❌ Error al crear alerta:', errorInsertar);
                            } else {
                                alertasGeneradas++;
                                console.log(
                                    `⚠️ Alerta creada: ${producto.nombre} - ${tipoAlerta}`
                                );
                            }

                            procesados++;

                            if (procesados === productos.length) {
                                return res.json({
                                    mensaje: 'Análisis de inventario completado',
                                    alertas_generadas: alertasGeneradas
                                });
                            }
                        }
                    );
                }
            );
        });
    });
});


// Marcar alerta como atendida
app.put('/api/alertas/:id/atender', (req, res) => {

    const { id } = req.params;

    const sql = `
        UPDATE alertas
        SET atendida = 1
        WHERE id_alerta = ?
    `;

    db.query(sql, [id], (error, resultado) => {

        if (error) {
            console.error('❌ Error al atender alerta:', error);
            return res.status(500).json({
                error: 'Error al atender alerta'
            });
        }

        if (resultado.affectedRows === 0) {
            return res.status(404).json({
                error: 'Alerta no encontrada'
            });
        }

        res.json({
            mensaje: 'Alerta marcada como atendida'
        });
    });
});

// ==========================================
// PREDICCIÓN DE DEMANDA (MACHINE LEARNING)
// ==========================================

app.post(
    '/api/kardex/importar',
    express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '20mb' }),
    async (req, res) => {
        const origen = String(req.get('x-origen-datos') || '').toLowerCase();
        const reemplazarSimulados = req.get('x-reemplazar-simulados') === 'true';
        if (!['real', 'simulado'].includes(origen)) {
            return res.status(400).json({ error: 'Indica si el Kardex contiene datos reales o simulados.' });
        }

        if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
            return res.status(400).json({ error: 'Selecciona un archivo Excel válido.' });
        }

        try {
            const hojas = await readXlsxFile(req.body);
            const hojaKardex = hojas.find((hoja) => hoja.sheet.trim().toLowerCase() === 'kardex');
            if (!hojaKardex || hojaKardex.data.length < 2) {
                return res.status(400).json({ error: 'El libro debe incluir una hoja Kardex con encabezados y registros.' });
            }

            const hojaProductos = hojas.find((hoja) => hoja.sheet.trim().toLowerCase() === 'productos');
            const codigoPorIdOrigen = new Map();
            const nombrePorCodigoOrigen = new Map();
            if (hojaProductos?.data?.length > 1) {
                const encabezadosProductos = new Map(hojaProductos.data[0].map((valor, indice) => [String(valor || '').trim().toLowerCase(), indice]));
                if (encabezadosProductos.has('id_producto') && encabezadosProductos.has('codigo')) {
                    hojaProductos.data.slice(1).forEach((fila, indice) => {
                        const idOrigen = Number(fila[encabezadosProductos.get('id_producto')]);
                        const codigo = String(fila[encabezadosProductos.get('codigo')] || '').trim();
                        if (Number.isInteger(idOrigen) && idOrigen > 0 && codigo) {
                            if (codigoPorIdOrigen.has(idOrigen) || [...codigoPorIdOrigen.values()].includes(codigo)) {
                                throw new Error(`La hoja Productos tiene IDs o códigos duplicados cerca de la fila ${indice + 2}.`);
                            }
                            codigoPorIdOrigen.set(idOrigen, codigo);
                            if (encabezadosProductos.has('nombre')) {
                                nombrePorCodigoOrigen.set(codigo, String(fila[encabezadosProductos.get('nombre')] || '').trim());
                            }
                        }
                    });
                }
            }

            const hojaInicio = hojas.find((hoja) => hoja.sheet.trim().toLowerCase() === 'inicio');
            const declaracionSimulada = (hojaInicio?.data || [])
                .flat()
                .some((valor) => typeof valor === 'string' && /datos\s+simulados/i.test(valor));
            if (declaracionSimulada && origen !== 'simulado') {
                return res.status(400).json({ error: 'Este libro está marcado como simulado. Impórtalo como datos simulados.' });
            }

            const normalizarEncabezado = (valor) => String(valor || '').trim().toLowerCase();
            const encabezados = new Map(hojaKardex.data[0].map((valor, indice) => [normalizarEncabezado(valor), indice]));
            const campos = ['id_producto', 'fecha', 'stock_inicial', 'entradas', 'salidas', 'stock_final'];
            const faltantes = campos.filter((campo) => !encabezados.has(campo));
            if (faltantes.length) {
                return res.status(400).json({ error: `Faltan columnas requeridas en Kardex: ${faltantes.join(', ')}.` });
            }

            const filasKardex = hojaKardex.data.slice(1).filter((fila) => fila.some((valor) => valor !== null && valor !== undefined && valor !== ''));
            if (!filasKardex.length || filasKardex.length > 100000) {
                return res.status(400).json({ error: 'El Kardex debe contener entre 1 y 100,000 registros.' });
            }

            const registros = [];
            const clavesArchivo = new Set();
            const productosIds = new Set();
            const codigosOrigen = new Set();
            let fechaMinima = '';
            let fechaMaxima = '';
            const parsearEntero = (valor, campo, numeroFila) => {
                if (valor === null || valor === undefined || valor === '') {
                    throw new Error(`Falta ${campo} en la fila ${numeroFila}.`);
                }
                const numero = Number(valor);
                if (!Number.isSafeInteger(numero) || numero < 0) {
                    throw new Error(`${campo} debe ser un entero mayor o igual a cero (fila ${numeroFila}).`);
                }
                return numero;
            };
            const parsearFecha = (valor, numeroFila) => {
                if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
                    return valor.toISOString().slice(0, 10);
                }

                let texto = '';
                if (typeof valor === 'number' && Number.isFinite(valor) && valor >= 1) {
                    const serial = Math.floor(valor);
                    const fechaExcel = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
                    if (!Number.isNaN(fechaExcel.getTime())) texto = fechaExcel.toISOString().slice(0, 10);
                } else {
                    texto = String(valor ?? '').trim();
                }

                const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
                if (iso) {
                    const fecha = new Date(`${texto}T00:00:00.000Z`);
                    if (!Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto) return texto;
                }

                const local = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
                if (local) {
                    const [, dia, mes, anio] = local;
                    const normalizada = `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
                    const fecha = new Date(`${normalizada}T00:00:00.000Z`);
                    if (!Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === normalizada) return normalizada;
                }

                throw new Error(`La fecha no es válida (fila ${numeroFila}). Usa una fecha de Excel o el formato AAAA-MM-DD en la columna fecha.`);
            };

            for (const [indice, fila] of filasKardex.entries()) {
                const numeroFila = indice + 2;
                const valor = (campo) => fila[encabezados.get(campo)];
                const idProductoOrigen = parsearEntero(valor('id_producto'), 'id_producto', numeroFila);
                if (idProductoOrigen < 1) throw new Error(`id_producto debe ser mayor que cero (fila ${numeroFila}).`);
                const codigoOrigen = codigoPorIdOrigen.get(idProductoOrigen);
                if (codigoPorIdOrigen.size && !codigoOrigen) {
                    throw new Error(`El producto ${idProductoOrigen} de la hoja Kardex no tiene código asociado en la hoja Productos.`);
                }
                const fecha = parsearFecha(valor('fecha'), numeroFila);
                const stockInicial = parsearEntero(valor('stock_inicial'), 'stock_inicial', numeroFila);
                const entradas = parsearEntero(valor('entradas'), 'entradas', numeroFila);
                const salidas = parsearEntero(valor('salidas'), 'salidas', numeroFila);
                const stockFinal = parsearEntero(valor('stock_final'), 'stock_final', numeroFila);
                if (stockFinal !== stockInicial + entradas - salidas) {
                    throw new Error(`El stock no cuadra en la fila ${numeroFila}: inicial + entradas - salidas debe ser igual al stock final.`);
                }
                const clave = `${codigoOrigen || idProductoOrigen}|${fecha}`;
                if (clavesArchivo.has(clave)) throw new Error(`Hay más de un registro para el producto ${codigoOrigen || idProductoOrigen} en ${fecha}.`);
                clavesArchivo.add(clave);
                if (codigoOrigen) codigosOrigen.add(codigoOrigen);
                else productosIds.add(idProductoOrigen);
                if (!fechaMinima || fecha < fechaMinima) fechaMinima = fecha;
                if (!fechaMaxima || fecha > fechaMaxima) fechaMaxima = fecha;
                registros.push([idProductoOrigen, codigoOrigen, fecha, stockInicial, entradas, salidas, stockFinal, origen]);
            }

            if (codigosOrigen.size) {
                const codigos = [...codigosOrigen];
                const [productosEncontrados] = await db.promise().query(
                    'SELECT id_producto, codigo, nombre FROM productos WHERE estado = 1 AND codigo IN (?)',
                    [codigos]
                );
                const idPorCodigo = new Map(productosEncontrados.map((producto) => [producto.codigo, Number(producto.id_producto)]));
                const codigosDesconocidos = codigos.filter((codigo) => !idPorCodigo.has(codigo));
                if (codigosDesconocidos.length) {
                    return res.status(400).json({ error: `No existe en el catálogo un producto activo con código ${codigosDesconocidos.slice(0, 10).join(', ')}.` });
                }
                const nombrePorCodigoDb = new Map(productosEncontrados.map((producto) => [producto.codigo, String(producto.nombre || '').trim().toLowerCase().replace(/\s+/g, ' ')]));
                const nombresIncoherentes = codigos.filter((codigo) => {
                    const nombreArchivo = nombrePorCodigoOrigen.get(codigo);
                    return nombreArchivo && nombreArchivo.toLowerCase().replace(/\s+/g, ' ') !== nombrePorCodigoDb.get(codigo);
                });
                if (nombresIncoherentes.length) {
                    return res.status(409).json({ error: `Los nombres del Kardex no coinciden con el catálogo para: ${nombresIncoherentes.slice(0, 8).join(', ')}. Corrige el catálogo o el Kardex antes de importar.` });
                }
                for (let indice = 0; indice < registros.length; indice += 1) {
                    const [, codigo, fecha, stockInicial, entradas, salidas, stockFinal, origenRegistro] = registros[indice];
                    registros[indice] = [idPorCodigo.get(codigo), fecha, stockInicial, entradas, salidas, stockFinal, origenRegistro];
                }
                productosIds.clear();
                registros.forEach(([idProducto]) => productosIds.add(idProducto));
                codigosOrigen.clear();
            } else {
                for (let indice = 0; indice < registros.length; indice += 1) {
                    const [idProducto, , fecha, stockInicial, entradas, salidas, stockFinal, origenRegistro] = registros[indice];
                    registros[indice] = [idProducto, fecha, stockInicial, entradas, salidas, stockFinal, origenRegistro];
                }
            }

            const ids = [...productosIds];
            const [productosEncontrados] = await db.promise().query(
                'SELECT id_producto FROM productos WHERE estado = 1 AND id_producto IN (?)',
                [ids]
            );
            const idsValidos = new Set(productosEncontrados.map((producto) => Number(producto.id_producto)));
            const desconocidos = ids.filter((id) => !idsValidos.has(id));
            if (desconocidos.length) {
                return res.status(400).json({ error: `El Kardex contiene productos inexistentes o inactivos: ${desconocidos.slice(0, 10).join(', ')}.` });
            }

            const [existentes] = await db.promise().query(
                `SELECT id_producto, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, origen_datos,
                        stock_inicial, entradas, salidas, stock_final
                 FROM historial_stock
                 WHERE id_producto IN (?) AND fecha BETWEEN ? AND ?`,
                [ids, fechaMinima, fechaMaxima]
            );
            const filasExistentes = new Map(existentes.map((fila) => [`${fila.id_producto}|${fila.fecha}`, fila]));
            const conflictos = registros
                .map(([id, fecha]) => filasExistentes.get(`${id}|${fecha}`))
                .filter(Boolean);
            const kardexYaCargado = registros.length === existentes.length && registros.every(
                ([id, fecha, stockInicial, entradas, salidas, stockFinal, origenRegistro]) => {
                    const existente = filasExistentes.get(`${id}|${fecha}`);
                    return existente
                        && existente.origen_datos === origenRegistro
                        && Number(existente.stock_inicial) === stockInicial
                        && Number(existente.entradas) === entradas
                        && Number(existente.salidas) === salidas
                        && Number(existente.stock_final) === stockFinal;
                }
            );
            if (kardexYaCargado) {
                return res.json({
                    mensaje: 'Este Kardex ya está cargado. No se agregaron registros duplicados.',
                    ya_cargado: true,
                    origen,
                    registros_importados: 0,
                    productos: ids.length,
                    fecha_inicio: fechaMinima,
                    fecha_fin: fechaMaxima
                });
            }
            const soloSimulados = conflictos.every((fila) => fila.origen_datos === 'simulado');
            const puedeReemplazarSimulados = origen === 'real' && reemplazarSimulados && soloSimulados;
            if (conflictos.length && !puedeReemplazarSimulados) {
                const duplicado = conflictos[0];
                return res.status(409).json({
                    error: `Ya existe historial para el producto ${duplicado.id_producto} en ${duplicado.fecha}. No se insertó ningún registro. Para sustituir una muestra, marca la opción de reemplazar únicamente los registros simulados coincidentes.`
                });
            }

            const conexion = await db.promise().getConnection();
            try {
                await conexion.beginTransaction();
                if (puedeReemplazarSimulados) {
                    const pares = [...new Set(conflictos.map((fila) => `${fila.id_producto}|${fila.fecha}`))]
                        .map((clave) => clave.split('|'));
                    for (let inicio = 0; inicio < pares.length; inicio += 400) {
                        const grupo = pares.slice(inicio, inicio + 400);
                        const condiciones = grupo.map(() => '(id_producto = ? AND fecha = ?)').join(' OR ');
                        await conexion.query(
                            `DELETE FROM historial_stock
                             WHERE origen_datos = 'simulado' AND (${condiciones})`,
                            grupo.flat()
                        );
                    }
                }
                for (let inicio = 0; inicio < registros.length; inicio += 500) {
                    await conexion.query(
                        `INSERT INTO historial_stock
                            (id_producto, fecha, stock_inicial, entradas, salidas, stock_final, origen_datos)
                         VALUES ?`,
                        [registros.slice(inicio, inicio + 500)]
                    );
                }
                await conexion.commit();
            } catch (errorInsercion) {
                await conexion.rollback();
                throw errorInsercion;
            } finally {
                conexion.release();
            }

            res.status(201).json({
                mensaje: `Kardex ${origen} importado correctamente.`,
                origen,
                registros_importados: registros.length,
                registros_simulados_reemplazados: puedeReemplazarSimulados ? conflictos.length : 0,
                productos: ids.length,
                fecha_inicio: fechaMinima,
                fecha_fin: fechaMaxima
            });
        } catch (error) {
            console.error('Error al importar el Kardex:', error);
            const errorBaseDatos = typeof error.code === 'string'
                && (error.code.startsWith('ER_') || error.code.startsWith('PROTOCOL_'));
            res.status(errorBaseDatos ? 500 : 400).json({
                error: errorBaseDatos ? 'Ocurrió un problema al guardar el Kardex en la base de datos.' : (error.message || 'No se pudo leer el archivo Excel.')
            });
        }
    }
);

app.get('/api/predicciones', async (req, res) => {
    try {
        const [historial] = await db.promise().query(`
            SELECT
                COUNT(DISTINCT fecha) AS dias_disponibles,
                DATE_FORMAT(MIN(fecha), '%Y-%m-%d') AS fecha_inicio,
                DATE_FORMAT(MAX(fecha), '%Y-%m-%d') AS fecha_fin,
                SUM(origen_datos = 'simulado') AS registros_simulados,
                SUM(origen_datos = 'real') AS registros_reales,
                SUM(origen_datos = 'sin_clasificar') AS registros_sin_clasificar
            FROM historial_stock
        `);

        const [historialDiario] = await db.promise().query(`
            SELECT
                h.id_producto,
                DATE_FORMAT(h.fecha, '%Y-%m-%d') AS fecha,
                SUM(h.salidas) AS demanda
            FROM historial_stock h
            INNER JOIN productos p ON p.id_producto = h.id_producto
            WHERE h.origen_datos = 'real'
              AND p.estado = 1
              AND h.fecha >= DATE_SUB(
                    (SELECT MAX(fecha) FROM historial_stock WHERE origen_datos = 'real'),
                    INTERVAL 29 DAY
                  )
            GROUP BY h.id_producto, h.fecha
            ORDER BY h.fecha, p.nombre
        `);

        const [predicciones] = await db.promise().query(`
            SELECT
                pd.id_prediccion,
                pd.id_producto,
                p.codigo,
                p.nombre,
                p.stock_actual,
                DATE_FORMAT(pd.fecha_prediccion, '%Y-%m-%d') AS fecha_prediccion,
                pd.demanda_predicha,
                pd.mae,
                pd.rmse,
                pd.modelo,
                pd.fecha_generacion
            FROM predicciones_demanda pd
            INNER JOIN productos p ON p.id_producto = pd.id_producto
            WHERE pd.fecha_generacion = (
                SELECT MAX(fecha_generacion) FROM predicciones_demanda
            )
            ORDER BY pd.fecha_prediccion, p.nombre
        `);

        res.json({ historial: historial[0], historial_diario: historialDiario, predicciones });
    } catch (error) {
        console.error('Error al consultar las predicciones:', error);
        res.status(500).json({ error: 'No se pudieron consultar las predicciones.' });
    }
});

app.post('/api/predicciones/generar', async (req, res) => {
    const horizonte = Number(req.body.horizonte || 7);
    if (!Number.isInteger(horizonte) || horizonte < 1 || horizonte > 30) {
        return res.status(400).json({ error: 'El horizonte debe estar entre 1 y 30 días.' });
    }

    let conexion;
    try {
        const [historial] = await db.promise().query(`
            SELECT
                h.id_producto,
                DATE_FORMAT(h.fecha, '%Y-%m-%d') AS fecha,
                SUM(h.salidas) AS salidas
            FROM historial_stock h
            INNER JOIN productos p ON p.id_producto = h.id_producto
            WHERE p.estado = 1
            GROUP BY h.id_producto, h.fecha
            ORDER BY h.id_producto, h.fecha
        `);

        if (historial.length === 0) {
            return res.status(409).json({
                codigo: 'HISTORIAL_VACIO',
                error: 'No hay historial diario de inventario para entrenar el modelo. Importa primero el Kardex real.'
            });
        }

        const partesFechaLima = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        const hoyLima = `${partesFechaLima.find((parte) => parte.type === 'year').value}-${partesFechaLima.find((parte) => parte.type === 'month').value}-${partesFechaLima.find((parte) => parte.type === 'day').value}`;
        const fechaPronosticoInicial = new Date(`${hoyLima}T00:00:00.000Z`);
        fechaPronosticoInicial.setUTCDate(fechaPronosticoInicial.getUTCDate() + 1);
        const inicioFuturo = fechaPronosticoInicial.toISOString().slice(0, 10);
        const resultado = trainDemandForecast(historial, horizonte, inicioFuturo);
        if (resultado.trained.length === 0) {
            return res.status(409).json({
                codigo: 'HISTORIAL_INSUFICIENTE',
                error: `No hay productos con datos suficientes. Se requieren al menos ${MIN_TRAIN_DAYS} días de entrenamiento, ${MIN_VALIDATION_DAYS} días de validación y demanda registrada en varios días.`,
                productos_sin_datos_suficientes: resultado.skipped.length
            });
        }

        const filas = resultado.trained.flatMap((producto) =>
            producto.predictions.map((prediccion) => [
                producto.productId,
                prediccion.fecha,
                prediccion.demanda,
                producto.mae,
                producto.rmse,
                MODEL_NAME
            ])
        );

        conexion = await db.promise().getConnection();
        await conexion.beginTransaction();
        await conexion.query(`
            INSERT INTO predicciones_demanda
                (id_producto, fecha_prediccion, demanda_predicha, mae, rmse, modelo)
            VALUES ?
        `, [filas]);
        await conexion.commit();

        res.status(201).json({
            mensaje: 'Pronóstico generado con el historial disponible.',
            modelo: MODEL_NAME,
            horizonte,
            productos_entrenados: resultado.trained.length,
            predicciones_generadas: filas.length,
            productos_omitidos: resultado.skipped.length,
            metricas_promedio: {
                mae: Number((resultado.trained.reduce((sum, item) => sum + item.mae, 0) / resultado.trained.length).toFixed(4)),
                rmse: Number((resultado.trained.reduce((sum, item) => sum + item.rmse, 0) / resultado.trained.length).toFixed(4))
            }
        });
    } catch (error) {
        if (conexion) {
            try { await conexion.rollback(); } catch (rollbackError) {
                console.error('Error al revertir el guardado de predicciones:', rollbackError);
            }
        }
        console.error('Error al generar pronósticos:', error);
        res.status(500).json({ error: 'No se pudo entrenar o guardar el modelo de demanda.' });
    } finally {
        if (conexion) conexion.release();
    }
});


app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && fs.existsSync(path.join(frontendDist, 'index.html'))) {
        return res.sendFile(path.join(frontendDist, 'index.html'));
    }
    return next();
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
});
