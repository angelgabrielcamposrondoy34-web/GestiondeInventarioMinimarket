import { useEffect, useState } from 'react';
import './Compras.css';
import { API_BASE as API, apiFetch } from './api';

function Compras() {
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [compras, setCompras] = useState([]);

  const [idProveedor, setIdProveedor] = useState('');
  const [numeroDocumento, setNumeroDocumento] = useState('');
  const [productoSeleccionado, setProductoSeleccionado] = useState('');
  const [cantidad, setCantidad] = useState(1);
  const [precioCompra, setPrecioCompra] = useState('');

  const [detalle, setDetalle] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [mostrarFormularioCompra, setMostrarFormularioCompra] = useState(false);

  const usuario = JSON.parse(
    localStorage.getItem('usuario') || 'null'
  );

  const cargarDatos = async () => {
    setCargando(true);
    setError('');

    try {
      const [resProductos, resProveedores, resCompras] =
        await Promise.all([
          apiFetch(`${API}/productos`),
          apiFetch(`${API}/proveedores`),
          apiFetch(`${API}/compras`)
        ]);

      if (!resProductos.ok) {
        throw new Error('No se pudieron cargar los productos.');
      }

      if (!resProveedores.ok) {
        throw new Error('No se pudieron cargar los proveedores.');
      }

      if (!resCompras.ok) {
        throw new Error('No se pudo cargar el historial de compras.');
      }

      const datosProductos = await resProductos.json();
      const datosProveedores = await resProveedores.json();
      const datosCompras = await resCompras.json();

      setProductos(datosProductos);
      setProveedores(datosProveedores);
      setCompras(datosCompras);
    } catch (err) {
      setError(err.message || 'Error al cargar los datos.');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const seleccionarProducto = (id) => {
    setProductoSeleccionado(id);

    const producto = productos.find(
      (p) => String(p.id_producto) === String(id)
    );

    setPrecioCompra(
      producto ? String(producto.precio_compra ?? '') : ''
    );
  };

  const agregarProducto = () => {
    setError('');
    setMensaje('');

    if (!productoSeleccionado) {
      setError('Selecciona un producto.');
      return;
    }

    const cantidadNumero = Number(cantidad);
    const precioNumero = Number(precioCompra);

    if (
      !Number.isInteger(cantidadNumero) ||
      cantidadNumero <= 0
    ) {
      setError('La cantidad debe ser un número entero mayor que cero.');
      return;
    }

    if (!Number.isFinite(precioNumero) || precioNumero <= 0) {
      setError('Ingresa un precio de compra válido.');
      return;
    }

    const producto = productos.find(
      (p) =>
        String(p.id_producto) === String(productoSeleccionado)
    );

    if (!producto) {
      setError('El producto seleccionado no existe.');
      return;
    }

    const existente = detalle.find(
      (item) =>
        String(item.id_producto) === String(producto.id_producto)
    );

    if (existente) {
      setDetalle((actual) =>
        actual.map((item) =>
          String(item.id_producto) === String(producto.id_producto)
            ? {
                ...item,
                cantidad: item.cantidad + cantidadNumero,
                precio_unitario: precioNumero
              }
            : item
        )
      );
    } else {
      setDetalle((actual) => [
        ...actual,
        {
          id_producto: producto.id_producto,
          nombre: producto.nombre,
          codigo: producto.codigo,
          cantidad: cantidadNumero,
          precio_unitario: precioNumero
        }
      ]);
    }

    setProductoSeleccionado('');
    setCantidad(1);
    setPrecioCompra('');
  };

  const cambiarCantidad = (idProducto, valor) => {
    const nuevaCantidad = Number(valor);

    if (!Number.isInteger(nuevaCantidad) || nuevaCantidad <= 0) {
      return;
    }

    setDetalle((actual) =>
      actual.map((item) =>
        String(item.id_producto) === String(idProducto)
          ? { ...item, cantidad: nuevaCantidad }
          : item
      )
    );
  };

  const cambiarPrecio = (idProducto, valor) => {
    setDetalle((actual) =>
      actual.map((item) =>
        String(item.id_producto) === String(idProducto)
          ? { ...item, precio_unitario: valor }
          : item
      )
    );
  };

  const eliminarProducto = (idProducto) => {
    setDetalle((actual) =>
      actual.filter(
        (item) =>
          String(item.id_producto) !== String(idProducto)
      )
    );
  };

  const total = detalle.reduce(
    (suma, item) =>
      suma +
      item.cantidad * Number(item.precio_unitario || 0),
    0
  );

  const formatoMoneda = (valor) =>
    Number(valor || 0).toLocaleString('es-PE', {
      style: 'currency',
      currency: 'PEN'
    });

  const registrarCompra = async (e) => {
    e.preventDefault();
    setError('');
    setMensaje('');

    if (!idProveedor) {
      setError('Selecciona un proveedor.');
      return;
    }

    if (detalle.length === 0) {
      setError('Agrega al menos un producto a la compra.');
      return;
    }

    if (
      detalle.some(
        (item) =>
          !Number.isInteger(Number(item.cantidad)) ||
          Number(item.cantidad) <= 0 ||
          !Number.isFinite(Number(item.precio_unitario)) ||
          Number(item.precio_unitario) <= 0
      )
    ) {
      setError('Revisa las cantidades y los precios de los productos.');
      return;
    }

    const idUsuario = Number(
      usuario?.id_usuario ?? usuario?.id
    );

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      setError(
        'No se encontró el ID del usuario. Verifica los datos de la sesión.'
      );
      return;
    }

    const confirmar = window.confirm(
      `¿Registrar la compra por ${formatoMoneda(total)}?\n\n` +
      'Esta operación actualizará el stock del inventario.'
    );

    if (!confirmar) return;

    setGuardando(true);

    try {
      const respuesta = await apiFetch(`${API}/compras`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id_proveedor: Number(idProveedor),
          id_usuario: idUsuario,
          numero_documento: numeroDocumento.trim() || null,
          productos: detalle.map((item) => ({
            id_producto: Number(item.id_producto),
            cantidad: Number(item.cantidad),
            precio_unitario: Number(item.precio_unitario)
          }))
        })
      });

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.mensaje ||
          datos.error ||
          'No se pudo registrar la compra.'
        );
      }

      setMensaje('¡Compra registrada correctamente!');
      setIdProveedor('');
      setNumeroDocumento('');
      setDetalle([]);
      setMostrarFormularioCompra(false);

      await cargarDatos();
    } catch (err) {
      setError(err.message || 'Error al registrar la compra.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="compras-contenedor">
      <div className="compras-encabezado">
        <div>
          <h2>📥 Gestión de compras</h2>
          <p>
            Registra las compras a proveedores y actualiza el inventario.
          </p>
        </div>

        <div className="compras-encabezado-acciones">
          <button
            type="button"
            className="compras-btn-secundario"
            onClick={cargarDatos}
            disabled={cargando}
          >
            🔄 Actualizar
          </button>
          <button
            type="button"
            className="compras-btn-guardar"
            onClick={() => setMostrarFormularioCompra(true)}
          >
            + Nueva compra
          </button>
        </div>
      </div>

      {error && (
        <div className="compras-mensaje compras-error">
          {error}
        </div>
      )}

      {mensaje && (
        <div className="compras-mensaje compras-exito">
          {mensaje}
        </div>
      )}

      {mostrarFormularioCompra && (
      <div className="compras-modal-backdrop">
      <form className="compras-modal" onSubmit={registrarCompra}>
        <div className="compras-modal-encabezado">
          <div>
            <span>REGISTRO DE INVENTARIO</span>
            <h3>Nueva compra</h3>
          </div>
          <button
            type="button"
            className="compras-modal-cerrar"
            aria-label="Cerrar formulario de compra"
            onClick={() => setMostrarFormularioCompra(false)}
          >
            ×
          </button>
        </div>
        <div className="compras-tarjeta">
          <h3>1. Información de la compra</h3>

          <div className="compras-formulario">
            <label>
              Proveedor *
              <select
                value={idProveedor}
                onChange={(e) => setIdProveedor(e.target.value)}
                required
              >
                <option value="">Seleccionar proveedor</option>

                {proveedores.map((proveedor) => (
                  <option
                    key={proveedor.id_proveedor}
                    value={proveedor.id_proveedor}
                  >
                    {proveedor.razon_social}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Número de documento
              <input
                type="text"
                value={numeroDocumento}
                onChange={(e) =>
                  setNumeroDocumento(e.target.value)
                }
                maxLength={50}
                placeholder="Ej. F001-000123"
              />
            </label>
          </div>
        </div>

        <div className="compras-tarjeta">
          <h3>2. Agregar productos</h3>

          <div className="compras-formulario compras-formulario-producto">
            <label>
              Producto *
              <select
                value={productoSeleccionado}
                onChange={(e) =>
                  seleccionarProducto(e.target.value)
                }
              >
                <option value="">Seleccionar producto</option>

                {productos.map((producto) => (
                  <option
                    key={producto.id_producto}
                    value={producto.id_producto}
                  >
                    {producto.codigo} - {producto.nombre}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Cantidad *
              <input
                type="number"
                min="1"
                step="1"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
              />
            </label>

            <label>
              Precio unitario (S/) *
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={precioCompra}
                onChange={(e) =>
                  setPrecioCompra(e.target.value)
                }
              />
            </label>

            <button
              type="button"
              className="compras-btn-agregar"
              onClick={agregarProducto}
            >
              ➕ Agregar
            </button>
          </div>

          <div className="compras-tabla-contenedor">
            <table className="compras-tabla">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Precio unitario</th>
                  <th>Subtotal</th>
                  <th>Acción</th>
                </tr>
              </thead>

              <tbody>
                {detalle.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="compras-vacio">
                      Todavía no agregaste productos.
                    </td>
                  </tr>
                ) : (
                  detalle.map((item) => (
                    <tr key={item.id_producto}>
                      <td>
                        <strong>{item.nombre}</strong>
                        <small>{item.codigo}</small>
                      </td>

                      <td>
                        <input
                          className="compras-input-tabla"
                          type="number"
                          min="1"
                          step="1"
                          value={item.cantidad}
                          onChange={(e) =>
                            cambiarCantidad(
                              item.id_producto,
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        <input
                          className="compras-input-tabla"
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.precio_unitario}
                          onChange={(e) =>
                            cambiarPrecio(
                              item.id_producto,
                              e.target.value
                            )
                          }
                        />
                      </td>

                      <td>
                        {formatoMoneda(
                          item.cantidad *
                          Number(item.precio_unitario || 0)
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="compras-btn-eliminar"
                          onClick={() =>
                            eliminarProducto(item.id_producto)
                          }
                        >
                          🗑️ Quitar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="compras-total">
            <span>Total de la compra</span>
            <strong>{formatoMoneda(total)}</strong>
          </div>

          <div className="compras-acciones">
            <button
              type="button"
              className="compras-btn-secundario"
              onClick={() => {
                setDetalle([]);
                setError('');
                setMensaje('');
              }}
              disabled={guardando || detalle.length === 0}
            >
              Limpiar productos
            </button>

            <button
              type="submit"
              className="compras-btn-guardar"
              disabled={guardando || cargando}
            >
              {guardando
                ? 'Registrando...'
                : '💾 Registrar compra'}
            </button>
          </div>
        </div>
      </form>
      </div>
      )}

      <div className="compras-tarjeta">
        <h3>3. Historial de compras</h3>

        {cargando ? (
          <p>Cargando compras...</p>
        ) : (
          <div className="compras-tabla-contenedor">
            <table className="compras-tabla">
              <thead>
                <tr>
                  <th>N.º</th>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Documento</th>
                  <th>Productos</th>
                  <th>Total</th>
                </tr>
              </thead>

              <tbody>
                {compras.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="compras-vacio">
                      No hay compras registradas.
                    </td>
                  </tr>
                ) : (
                  compras.map((compra) => (
                    <tr key={compra.id_compra}>
                      <td>{compra.id_compra}</td>

                      <td>
                        {compra.fecha_compra
                          ? new Date(
                              compra.fecha_compra
                            ).toLocaleString('es-PE')
                          : '—'}
                      </td>

                      <td>
                        {compra.razon_social ||
                          compra.proveedor ||
                          '—'}
                      </td>

                      <td>{compra.numero_documento || '—'}</td>

                      <td>
                        {compra.cantidad_productos ?? compra.cantidad_detalles ?? '—'}
                      </td>

                      <td>
                        <strong>
                          {formatoMoneda(compra.total)}
                        </strong>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

export default Compras;
