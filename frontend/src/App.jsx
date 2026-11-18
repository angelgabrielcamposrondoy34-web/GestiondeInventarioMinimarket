import { useEffect, useState } from 'react';
import './App.css';
import Login from './Login';
import Compras from './Compras';
import { API_BASE, apiFetch } from './api';

function PrediccionGraficos({ historialDiario = [], predicciones = [] }) {
  const [productoSeleccionado, setProductoSeleccionado] = useState('');
  const productos = [...new Map(predicciones.map((fila) => [fila.id_producto, {
    id: fila.id_producto,
    codigo: fila.codigo,
    nombre: fila.nombre
  }])).values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  const producto = productos.find((item) => String(item.id) === String(productoSeleccionado)) || productos[0];
  const observaciones = producto
    ? historialDiario.filter((fila) => Number(fila.id_producto) === Number(producto.id)).sort((a, b) => a.fecha.localeCompare(b.fecha)).slice(-14)
    : [];
  const pronostico = producto
    ? predicciones.filter((fila) => Number(fila.id_producto) === Number(producto.id)).sort((a, b) => a.fecha_prediccion.localeCompare(b.fecha_prediccion))
    : [];

  const primeraFecha = observaciones[0]?.fecha || pronostico[0]?.fecha_prediccion;
  const ultimaFecha = pronostico.at(-1)?.fecha_prediccion || observaciones.at(-1)?.fecha;
  const inicio = primeraFecha ? Date.parse(`${primeraFecha}T00:00:00Z`) : 0;
  const fin = ultimaFecha ? Date.parse(`${ultimaFecha}T00:00:00Z`) : inicio;
  const dias = primeraFecha && ultimaFecha
    ? Array.from({ length: Math.floor((fin - inicio) / 86400000) + 1 }, (_, indice) => new Date(inicio + indice * 86400000).toISOString().slice(0, 10))
    : [];
  const ancho = 760;
  const alto = 270;
  const margen = { arriba: 18, derecha: 18, abajo: 38, izquierda: 48 };
  const graficoAncho = ancho - margen.izquierda - margen.derecha;
  const graficoAlto = alto - margen.arriba - margen.abajo;
  const porFechaReal = new Map(observaciones.map((fila) => [fila.fecha, Number(fila.demanda) || 0]));
  const porFechaPrevista = new Map(pronostico.map((fila) => [fila.fecha_prediccion, Number(fila.demanda_predicha) || 0]));
  const valores = [...porFechaReal.values(), ...porFechaPrevista.values()];
  const maximo = Math.max(1, ...valores) * 1.15;
  const indiceFecha = new Map(dias.map((fecha, indice) => [fecha, indice]));
  const punto = (fecha, valor) => ({
    x: margen.izquierda + (dias.length > 1 ? (indiceFecha.get(fecha) / (dias.length - 1)) * graficoAncho : graficoAncho / 2),
    y: margen.arriba + graficoAlto - (valor / maximo) * graficoAlto
  });
  const trazo = (filas, fechaKey, valorKey) => filas.map((fila, indice) => {
    const coordenada = punto(fila[fechaKey], Number(fila[valorKey]) || 0);
    return `${indice ? 'L' : 'M'} ${coordenada.x.toFixed(1)} ${coordenada.y.toFixed(1)}`;
  }).join(' ');
  const etiquetasX = [...new Set([0, Math.round((dias.length - 1) / 3), Math.round(2 * (dias.length - 1) / 3), dias.length - 1])]
    .filter((indice) => indice >= 0 && dias[indice]);
  const diasSinDatos = observaciones.length && pronostico.length
    ? Math.max(0, Math.round((Date.parse(`${pronostico[0].fecha_prediccion}T00:00:00Z`) - Date.parse(`${observaciones.at(-1).fecha}T00:00:00Z`)) / 86400000) - 1)
    : 0;

  const demandaPorProducto = [...new Map(predicciones.map((fila) => {
    const total = predicciones
      .filter((item) => Number(item.id_producto) === Number(fila.id_producto))
      .reduce((suma, item) => suma + (Number(item.demanda_predicha) || 0), 0);
    return [fila.id_producto, { id: fila.id_producto, codigo: fila.codigo, nombre: fila.nombre, total }];
  })).values()].sort((a, b) => b.total - a.total).slice(0, 10);
  const maximoBarras = Math.max(1, ...demandaPorProducto.map((fila) => fila.total));
  const numero = (valor) => new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(valor);
  const fechaCorta = (fecha) => fecha ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}` : '';

  return (
    <div className="predicciones-graficos">
      <section className="predicciones-card predicciones-grafico-card">
        <div className="predicciones-card-heading">
          <div><h3>Historial y pronóstico</h3><p>Demanda diaria observada y estimada, en unidades.</p></div>
          <select aria-label="Producto para el gráfico" value={producto?.id || ''} onChange={(evento) => setProductoSeleccionado(evento.target.value)}>
            {productos.map((item) => <option key={item.id} value={item.id}>{item.codigo} · {item.nombre}</option>)}
          </select>
        </div>
        {observaciones.length && pronostico.length ? (
          <>
            <div className="predicciones-leyenda">
              <span><i className="predicciones-punto-real" />Historial real</span>
              <span><i className="predicciones-punto-previsto" />Pronóstico</span>
              {diasSinDatos > 0 && <small>Sin registros entre ambos períodos: {diasSinDatos} días</small>}
            </div>
            <svg className="predicciones-linea-chart" viewBox={`0 0 ${ancho} ${alto}`} role="img" aria-label={`Historial y pronóstico de demanda de ${producto.nombre}`}>
              {[0, 1, 2, 3, 4].map((division) => {
                const y = margen.arriba + (graficoAlto / 4) * division;
                const valor = maximo * (1 - division / 4);
                return <g key={division}><line x1={margen.izquierda} x2={ancho - margen.derecha} y1={y} y2={y} className="predicciones-gridline" /><text x={margen.izquierda - 9} y={y + 4} textAnchor="end" className="predicciones-axis-label">{numero(valor)}</text></g>;
              })}
              {observaciones.length && pronostico.length && diasSinDatos > 0 && <line x1={punto(pronostico[0].fecha_prediccion, 0).x} x2={punto(pronostico[0].fecha_prediccion, 0).x} y1={margen.arriba} y2={margen.arriba + graficoAlto} className="predicciones-inicio-pronostico" />}
              <path d={trazo(observaciones, 'fecha', 'demanda')} className="predicciones-linea-real" />
              <path d={trazo(pronostico, 'fecha_prediccion', 'demanda_predicha')} className="predicciones-linea-prevista" />
              {observaciones.map((fila) => { const p = punto(fila.fecha, Number(fila.demanda) || 0); return <circle key={`r-${fila.fecha}`} cx={p.x} cy={p.y} r="3.3" className="predicciones-dot-real"><title>{fechaCorta(fila.fecha)}: {numero(Number(fila.demanda) || 0)} unidades observadas</title></circle>; })}
              {pronostico.map((fila) => { const p = punto(fila.fecha_prediccion, Number(fila.demanda_predicha) || 0); return <circle key={`p-${fila.fecha_prediccion}`} cx={p.x} cy={p.y} r="3.5" className="predicciones-dot-previsto"><title>{fechaCorta(fila.fecha_prediccion)}: {numero(Number(fila.demanda_predicha) || 0)} unidades previstas</title></circle>; })}
              {etiquetasX.map((indice) => { const fecha = dias[indice]; const x = punto(fecha, 0).x; return <text key={fecha} x={x} y={alto - 10} textAnchor="middle" className="predicciones-axis-label">{fechaCorta(fecha)}</text>; })}
            </svg>
          </>
        ) : <div className="predicciones-chart-empty">Selecciona un producto con historial real y pronóstico disponible.</div>}
      </section>

      <section className="predicciones-card predicciones-grafico-card">
        <div className="predicciones-card-heading"><div><h3>Mayor demanda prevista</h3><p>Unidades acumuladas en el horizonte pronosticado.</p></div></div>
        <div className="predicciones-barras">
          {demandaPorProducto.map((fila) => (
            <div className="predicciones-barra-row" key={fila.id} title={`${fila.nombre}: ${numero(fila.total)} unidades`}>
              <div className="predicciones-barra-label"><strong>{fila.codigo}</strong><span>{fila.nombre}</span></div>
              <div className="predicciones-barra-track"><i style={{ width: `${Math.max(2, (fila.total / maximoBarras) * 100)}%` }} /></div>
              <b>{numero(fila.total)}</b>
            </div>
          ))}
          {!demandaPorProducto.length && <div className="predicciones-chart-empty">Genera un pronóstico para ver la comparación.</div>}
        </div>
      </section>
    </div>
  );
}

function App() {
    // ==========================================
  // AUTENTICACIÓN
  // ==========================================
  const [usuario, setUsuario] = useState(() => {
    const usuarioGuardado = localStorage.getItem('usuario');
    return usuarioGuardado
      ? JSON.parse(usuarioGuardado)
      : null;
  });
  const autenticado = usuario !== null;
  const manejarLogin = (datosUsuario) => {
    setUsuario(datosUsuario);
  };
  const cerrarSesion = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  };
  // ==========================================
  // VISTA
  // ==========================================
  const [vista, setVista] = useState('dashboard');
  // ==========================================
  // DASHBOARD
  // ==========================================
  const [dashboard, setDashboard] = useState({
    total_productos: 0,
    productos_agotados: 0,
    productos_stock_bajo: 0,
    productos_stock_normal: 0,
    productos_sobrestock: 0,
    total_categorias: 0
  });
  const [cargandoDashboard, setCargandoDashboard] = useState(true);
  // ==========================================
  // PRODUCTOS
  // ==========================================
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  // ESTADOS DEL MÓDULO DE PROVEEDORES
const [proveedores, setProveedores] = useState([]);
const [mostrarFormularioProveedor, setMostrarFormularioProveedor] = useState(false);
const [editandoProveedor, setEditandoProveedor] = useState(null);

const [formularioProveedor, setFormularioProveedor] = useState({
  razon_social: '',
  ruc: '',
  telefono: '',
  correo: '',
  direccion: ''
});
  // ==========================================
// GESTIÓN DE CATEGORÍAS
// ==========================================

const [mostrarFormularioCategoria, setMostrarFormularioCategoria] = useState(false);
const [editandoCategoria, setEditandoCategoria] = useState(null);
const [formularioCategoria, setFormularioCategoria] = useState({
  nombre: '',
  descripcion: ''
});
const [cargandoCategorias, setCargandoCategorias] = useState(false);
// =========================================
// MOVIMIENTOS
// ==========================================
const [movimientos, setMovimientos] = useState([]);
const [mostrarMovimiento, setMostrarMovimiento] = useState(false);
  const [filtroAlertas, setFiltroAlertas] = useState('');
// ==========================================
// ALERTAS
// ==========================================
const [alertas, setAlertas] = useState([]);
const [cargandoAlertas, setCargandoAlertas] = useState(false);
const [datosPredicciones, setDatosPredicciones] = useState({ historial: null, historial_diario: [], predicciones: [] });
const [cargandoPredicciones, setCargandoPredicciones] = useState(false);
const [generandoPredicciones, setGenerandoPredicciones] = useState(false);
const [errorPredicciones, setErrorPredicciones] = useState('');
const [mensajePredicciones, setMensajePredicciones] = useState('');
const [archivoKardex, setArchivoKardex] = useState(null);
const [importandoKardex, setImportandoKardex] = useState(false);
const [formularioMovimiento, setFormularioMovimiento] = useState({
  id_producto: '',
  id_usuario: 1,
  tipo_movimiento: 'ENTRADA',
  cantidad: '',
  motivo: ''
});
// ==========================================
// CARGAR MOVIMIENTOS
// ==========================================
const cargarMovimientos = async () => {
  try {
    const respuesta = await apiFetch(
      `${API_BASE}/movimientos`
    );
    if (!respuesta.ok) {
      throw new Error('Error al obtener movimientos');
    }
    const datos = await respuesta.json();
    setMovimientos(datos);
  } catch (error) {
    console.error('Error al cargar movimientos:', error);
  }
};
// ==========================================
// PREDICCIONES DE DEMANDA
// ==========================================
const cargarPredicciones = async () => {
  setCargandoPredicciones(true);
  setErrorPredicciones('');
  try {
    const respuesta = await apiFetch(`${API_BASE}/predicciones`);
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || 'No se pudieron cargar las predicciones.');
    setDatosPredicciones(datos);
  } catch (error) {
    setErrorPredicciones(error.message || 'No se pudo conectar con el servidor.');
  } finally {
    setCargandoPredicciones(false);
  }
};

const generarPredicciones = async () => {
  setGenerandoPredicciones(true);
  setErrorPredicciones('');
  setMensajePredicciones('');
  try {
    const respuesta = await apiFetch(`${API_BASE}/predicciones/generar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ horizonte: 7 })
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || 'No se pudo generar la predicción.');
    setMensajePredicciones(`${datos.predicciones_generadas} predicciones generadas para ${datos.productos_entrenados} productos. MAE promedio: ${datos.metricas_promedio.mae}; RMSE promedio: ${datos.metricas_promedio.rmse}.`);
    await cargarPredicciones();
  } catch (error) {
    setErrorPredicciones(error.message || 'No se pudo conectar con el servidor.');
  } finally {
    setGenerandoPredicciones(false);
  }
};

const importarKardex = async () => {
  if (!archivoKardex) {
    setErrorPredicciones('Selecciona el archivo Excel del Kardex.');
    return;
  }

  setImportandoKardex(true);
  setErrorPredicciones('');
  setMensajePredicciones('');
  try {
    const respuesta = await apiFetch(`${API_BASE}/kardex/importar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'X-Origen-Datos': 'real',
        'X-Reemplazar-Simulados': 'true'
      },
      body: archivoKardex
    });
    const datos = await respuesta.json();
    if (!respuesta.ok) throw new Error(datos.error || 'No se pudo importar el Kardex.');

    await cargarPredicciones();
    setMensajePredicciones(datos.ya_cargado
      ? `Este Kardex ya estaba cargado: ${datos.productos} productos, del ${datos.fecha_inicio} al ${datos.fecha_fin}. No se duplicaron datos.`
      : `Se importaron ${datos.registros_importados} registros de ${datos.productos} productos (${datos.fecha_inicio} a ${datos.fecha_fin}).`);
    setArchivoKardex(null);
    const selectorArchivo = document.getElementById('archivo-kardex');
    if (selectorArchivo) selectorArchivo.value = '';
  } catch (error) {
    setErrorPredicciones(error.message || 'No se pudo conectar con el servidor.');
  } finally {
    setImportandoKardex(false);
  }
};
// ==========================================
// CARGAR ALERTAS
// ==========================================
const cargarAlertas = async () => {
  try {
    setCargandoAlertas(true);
    const respuesta = await apiFetch(
      `${API_BASE}/alertas`
    );
    if (!respuesta.ok) {
      throw new Error('Error al obtener alertas');
    }
    const datos = await respuesta.json();
    setAlertas(datos);
  } catch (error) {
    console.error('Error al cargar alertas:', error);
  } finally {
    setCargandoAlertas(false);
  }
};
// ==========================================
// GENERAR ALERTAS
// ==========================================
const generarAlertas = async () => {
  try {
    const respuesta = await apiFetch(
      `${API_BASE}/alertas/generar`,
      {
        method: 'POST'
      }
    );
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(
        datos.error || 'Error al generar alertas'
      );
    }
    alert(
      `🔔 Análisis completado.\n\nAlertas nuevas generadas: ${datos.alertas_generadas}`
    );
    await cargarAlertas();
  } catch (error) {
    console.error('Error al generar alertas:', error);
    alert('❌ ' + error.message);
  }
};
// ==========================================
// ATENDER ALERTA
// ==========================================
const atenderAlerta = async (id) => {
  if (
    !window.confirm(
      '¿Deseas marcar esta alerta como atendida?'
    )
  ) {
    return;
  }
  try {
    const respuesta = await apiFetch(
      `${API_BASE}/alertas/${id}/atender`,
      {
        method: 'PUT'
      }
    );
    const datos = await respuesta.json();
    if (!respuesta.ok) {
      throw new Error(
        datos.error || 'Error al atender alerta'
      );
    }

    alert('✅ Alerta marcada como atendida');

    await cargarAlertas();

  } catch (error) {

    console.error('Error al atender alerta:', error);

    alert('❌ ' + error.message);
  }
};

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);

  const [busqueda, setBusqueda] = useState('');
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('');
  const [filtroStockDashboard, setFiltroStockDashboard] = useState('');

  // ==========================================
  // FORMULARIO
  // ==========================================

  const [formulario, setFormulario] = useState({
    codigo: '',
    nombre: '',
    descripcion: '',
    id_categoria: 1,
    id_proveedor: '',
    precio_compra: '',
    precio_venta: '',
    stock_actual: 0,
    stock_minimo: 5,
    stock_maximo: 100,
    unidad_medida: 'UNIDAD'
  });

  // ==========================================
  // CARGAR DASHBOARD
  // ==========================================

  const cargarDashboard = async () => {
    try {
      setCargandoDashboard(true);

      const respuesta = await apiFetch(
        `${API_BASE}/dashboard`
      );

      if (!respuesta.ok) {
        throw new Error('Error al obtener dashboard');
      }

      const datos = await respuesta.json();

      setDashboard(datos);

    } catch (error) {
      console.error('Error dashboard:', error);
    } finally {
      setCargandoDashboard(false);
    }
  };

  // ==========================================
  // CARGAR PRODUCTOS
  // ==========================================

  const cargarProductos = async () => {
    try {
      setCargando(true);

      const respuesta = await apiFetch(
        `${API_BASE}/productos`
      );

      if (!respuesta.ok) {
        throw new Error('Error al obtener productos');
      }

      const datos = await respuesta.json();

      setProductos(datos);
      setError('');

    } catch (error) {
      console.error(error);
      setError('No se pudo conectar con el servidor');

    } finally {
      setCargando(false);
    }
  };
const cargarCategorias = async () => {
  try {
    const respuesta = await apiFetch(`${API_BASE}/categorias`);
    if (!respuesta.ok) {
      throw new Error('Error al obtener categorías');
    }
    const datos = await respuesta.json();
    setCategorias(datos);
  } catch (error) {
    console.error('Error al cargar categorías:', error);
  }
};
// CARGAR PROVEEDORES
const cargarProveedores = async () => {
  try {
    const respuesta = await apiFetch(`${API_BASE}/proveedores`);

    if (!respuesta.ok) {
      throw new Error('No se pudieron cargar los proveedores');
    }

    const datos = await respuesta.json();
    setProveedores(datos);
  } catch (error) {
    console.error('Error al cargar proveedores:', error);
  }
};
  // ==========================================
  // CARGA INICIAL
  // ==========================================
    useEffect(() => {
      if (!autenticado) {
        return;
      }
      cargarProductos();
      cargarProveedores();
      cargarCategorias();
      cargarDashboard();
      cargarMovimientos();
      cargarAlertas();
    }, [autenticado]);
    // ==========================================
// ABRIR FORMULARIO DE CATEGORÍA
// ==========================================

const abrirFormularioCategoria = (categoria = null) => {
  setEditandoCategoria(categoria);

  setFormularioCategoria({
    nombre: categoria?.nombre || '',
    descripcion: categoria?.descripcion || ''
  });

  setMostrarFormularioCategoria(true);
};

// ==========================================
// REGISTRAR O EDITAR CATEGORÍA
// ==========================================

const guardarCategoria = async (e) => {
  e.preventDefault();

  if (!formularioCategoria.nombre.trim()) {
    alert('Ingresa el nombre de la categoría.');
    return;
  }

  try {
    const esEdicion = Boolean(editandoCategoria);

    const url = esEdicion
      ? `${API_BASE}/categorias/${editandoCategoria.id_categoria}`
      : `${API_BASE}/categorias`;

    const respuesta = await apiFetch(url, {
      method: esEdicion ? 'PUT' : 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nombre: formularioCategoria.nombre.trim(),
        descripcion: formularioCategoria.descripcion.trim()
      })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(datos.error || 'No se pudo guardar la categoría.');
    }

    alert(esEdicion
      ? 'Categoría actualizada correctamente.'
      : 'Categoría registrada correctamente.');

    setMostrarFormularioCategoria(false);
    setEditandoCategoria(null);

    setFormularioCategoria({
      nombre: '',
      descripcion: ''
    });

    await cargarCategorias();
    await cargarProductos();
    await cargarDashboard();

  } catch (error) {
    alert('Error: ' + error.message);
  }
};
// ==========================================
// ELIMINAR CATEGORÍA
// ==========================================

const eliminarCategoria = async (categoria) => {
  const confirmar = window.confirm(
    `¿Estás seguro de que deseas eliminar la categoría "${categoria.nombre}"?`
  );

  if (!confirmar) {
    return;
  }

  try {
    const respuesta = await apiFetch(
      `${API_BASE}/categorias/${categoria.id_categoria}`,
      {
        method: 'DELETE'
      }
    );

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(
        datos.error || 'No se pudo eliminar la categoría.'
      );
    }

    alert('Categoría eliminada correctamente.');

    await cargarCategorias();
    await cargarDashboard();

  } catch (error) {
    console.error('Error al eliminar categoría:', error);
    alert('Error: ' + error.message);
  }
};
  // ==========================================
  // CAMBIO DE FORMULARIO
  // ==========================================

  const manejarCambio = (e) => {
    const { name, value } = e.target;

    setFormulario({
      ...formulario,
      [name]: value
    });
  };
  
// ==========================================
// CAMBIO FORMULARIO MOVIMIENTO
// ==========================================

const manejarCambioMovimiento = (e) => {
  const { name, value } = e.target;

  setFormularioMovimiento({
    ...formularioMovimiento,
    [name]: value
  });
};
// ==========================================
// NUEVO MOVIMIENTO
// ==========================================

const abrirFormularioMovimiento = () => {
  setFormularioMovimiento({
    id_producto: '',
    id_usuario: 1,
    tipo_movimiento: 'ENTRADA',
    cantidad: '',
    motivo: ''
  });

  setMostrarMovimiento(true);
};

  // ==========================================
  // NUEVO PRODUCTO
  // ==========================================

  const abrirFormularioNuevo = () => {

    setModoEdicion(false);
    setProductoEditando(null);

    setFormulario({
      codigo: '',
      nombre: '',
      descripcion: '',
      id_categoria: categorias.length > 0 ? categorias[0].id_categoria: '',
      id_proveedor: '',
      precio_compra: '',
      precio_venta: '',
      stock_actual: 0,
      stock_minimo: 5,
      stock_maximo: 100,
      unidad_medida: 'UNIDAD'
    });

    setMostrarFormulario(true);
  };

  // ==========================================
  // EDITAR PRODUCTO
  // ==========================================

  const editarProducto = (producto) => {

    setProductoEditando(producto);
    setModoEdicion(true);
    setMostrarFormulario(true);

    setFormulario({
      codigo: producto.codigo,
      nombre: producto.nombre,
      descripcion: producto.descripcion || '',
      id_categoria: producto.id_categoria,
      id_proveedor: producto.id_proveedor || '',
      precio_compra: producto.precio_compra,
      precio_venta: producto.precio_venta,
      stock_actual: producto.stock_actual,
      stock_minimo: producto.stock_minimo,
      stock_maximo: producto.stock_maximo,
      unidad_medida: producto.unidad_medida || 'UNIDAD'
    });
  };
// ==========================================
// REGISTRAR MOVIMIENTO
// ==========================================

const registrarMovimiento = async (e) => {
  e.preventDefault();

  if (!formularioMovimiento.id_producto) {
    alert('⚠️ Selecciona un producto');
    return;
  }

  if (
    !formularioMovimiento.cantidad ||
    Number(formularioMovimiento.cantidad) <= 0
  ) {
    alert('⚠️ La cantidad debe ser mayor que 0');
    return;
  }

  try {

    const respuesta = await apiFetch(
      `${API_BASE}/movimientos`,
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        body: JSON.stringify({
          id_producto: Number(
            formularioMovimiento.id_producto
          ),

          id_usuario: Number(
            formularioMovimiento.id_usuario
          ),

          tipo_movimiento:
            formularioMovimiento.tipo_movimiento,

          cantidad: Number(
            formularioMovimiento.cantidad
          ),

          motivo:
            formularioMovimiento.motivo
        })
      }
    );

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      throw new Error(
        datos.error ||
        'Error al registrar movimiento'
      );
    }

    alert(
      '✅ Movimiento registrado correctamente'
    );

    setMostrarMovimiento(false);

    setFormularioMovimiento({
      id_producto: '',
      id_usuario: 1,
      tipo_movimiento: 'ENTRADA',
      cantidad: '',
      motivo: ''
    });

    // Actualizar información
    await cargarProductos();
    await cargarMovimientos();
    await cargarDashboard();

  } catch (error) {

    console.error(
      'Error al registrar movimiento:',
      error
    );

    alert('❌ ' + error.message);
  }
};

  // ==========================================
  // ACTUALIZAR PRODUCTO
  // ==========================================

  const actualizarProducto = async (e) => {

    e.preventDefault();

    try {

      const respuesta = await apiFetch(
        `${API_BASE}/productos/${productoEditando.id_producto}`,
        {
          method: 'PUT',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({

            ...formulario,

            id_categoria:
              Number(formulario.id_categoria),

            id_proveedor:
              formulario.id_proveedor
                ? Number(formulario.id_proveedor)
                : null,

            precio_compra:
              Number(formulario.precio_compra),

            precio_venta:
              Number(formulario.precio_venta),

            stock_actual:
              Number(formulario.stock_actual),

            stock_minimo:
              Number(formulario.stock_minimo),

            stock_maximo:
              Number(formulario.stock_maximo),

            estado: 1
          })
        }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.error ||
          'Error al actualizar producto'
        );
      }

      alert(
        '✅ Producto actualizado correctamente'
      );

      setMostrarFormulario(false);
      setModoEdicion(false);
      setProductoEditando(null);

      await cargarProductos();
      await cargarDashboard();

    } catch (error) {

      console.error(error);

      alert('❌ ' + error.message);
    }
  };

  // ==========================================
  // REGISTRAR PRODUCTO
  // ==========================================

  const registrarProducto = async (e) => {

    e.preventDefault();

    try {

      const respuesta = await apiFetch(
        `${API_BASE}/productos`,
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({

            ...formulario,

            id_categoria:
              Number(formulario.id_categoria),

            id_proveedor:
              formulario.id_proveedor
                ? Number(formulario.id_proveedor)
                : null,

            precio_compra:
              Number(formulario.precio_compra),

            precio_venta:
              Number(formulario.precio_venta),

            stock_actual:
              Number(formulario.stock_actual),

            stock_minimo:
              Number(formulario.stock_minimo),

            stock_maximo:
              Number(formulario.stock_maximo)
          })
        }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.error ||
          'Error al registrar producto'
        );
      }

      alert(
        '✅ Producto registrado correctamente'
      );

      setMostrarFormulario(false);

      setFormulario({
        codigo: '',
        nombre: '',
        descripcion: '',
        id_categoria: 1,
        id_proveedor: '',
        precio_compra: '',
        precio_venta: '',
        stock_actual: 0,
        stock_minimo: 5,
        stock_maximo: 100,
        unidad_medida: 'UNIDAD'
      });

      await cargarProductos();
      await cargarDashboard();

    } catch (error) {

      console.error(error);

      alert('❌ ' + error.message);
    }
  };

  // ==========================================
  // ELIMINAR PRODUCTO
  // ==========================================

  const eliminarProducto = async (id) => {

    if (
      !window.confirm(
        '¿Estás seguro de que deseas eliminar este producto?'
      )
    ) {
      return;
    }

    try {

      const respuesta = await apiFetch(
        `${API_BASE}/productos/${id}`,
        {
          method: 'DELETE'
        }
      );

      const datos = await respuesta.json();

      if (!respuesta.ok) {
        throw new Error(
          datos.error ||
          'Error al eliminar producto'
        );
      }

      alert(
        '🗑️ Producto eliminado correctamente'
      );

      await cargarProductos();
      await cargarDashboard();

    } catch (error) {

      console.error(error);

      alert('❌ ' + error.message);
    }
  };

  // ==========================================
  // FILTRAR PRODUCTOS
  // ==========================================
const productosFiltrados = productos.filter(
    (producto) => {
      const texto = busqueda.toLowerCase().trim();

      const nombre = String(producto.nombre || '').toLowerCase();
      const codigo = String(producto.codigo || '').toLowerCase();
      const categoria = String(producto.categoria || '').toLowerCase();
      const proveedor = String(producto.proveedor || '').toLowerCase();

      const coincideTexto =
        nombre.includes(texto) ||
        codigo.includes(texto) ||
        categoria.includes(texto) ||
        proveedor.includes(texto);

      const coincideCategoria =
        categoriaSeleccionada === '' ||
        String(producto.id_categoria) ===
          String(categoriaSeleccionada);

      const stock = Number(producto.stock_actual) || 0;
      const minimo = Number(producto.stock_minimo) || 0;
      const maximo = Number(producto.stock_maximo) || 0;
      const coincideStock = !filtroStockDashboard || (
        filtroStockDashboard === 'agotados' ? stock === 0 :
        filtroStockDashboard === 'bajo' ? stock > 0 && stock <= minimo :
        filtroStockDashboard === 'normal' ? stock > minimo && stock <= maximo :
        filtroStockDashboard === 'sobrestock' ? stock > maximo : true
      );

      return coincideTexto && coincideCategoria && coincideStock;
    }
  );
const productosStockDashboard = filtroStockDashboard
  ? productos.filter((producto) => {
      const stock = Number(producto.stock_actual) || 0;
      const minimo = Number(producto.stock_minimo) || 0;
      const maximo = Number(producto.stock_maximo) || 0;
      if (filtroStockDashboard === 'agotados') return stock === 0;
      if (filtroStockDashboard === 'bajo') return stock > 0 && stock <= minimo;
      if (filtroStockDashboard === 'normal') return stock > minimo && stock <= maximo;
      if (filtroStockDashboard === 'sobrestock') return stock > maximo;
      return true;
    })
  : [];
  // ==========================================
  // DASHBOARD
  // ==========================================

  const mostrarDashboard = () => {

    const total =
      dashboard.total_productos;

    const diasMovimiento = Array.from({ length: 7 }, (_, indice) => {
      const fecha = new Date();
      fecha.setHours(0, 0, 0, 0);
      fecha.setDate(fecha.getDate() - (6 - indice));
      const movimientosDelDia = movimientos.filter((movimiento) => {
        const fechaMovimiento = new Date(movimiento.fecha_movimiento);
        return Number.isFinite(fechaMovimiento.getTime()) &&
          fechaMovimiento.toDateString() === fecha.toDateString();
      });

      return {
        etiqueta: fecha.toLocaleDateString('es-PE', { weekday: 'short' }).replace('.', ''),
        entradas: movimientosDelDia
          .filter((movimiento) => movimiento.tipo_movimiento === 'ENTRADA' || movimiento.tipo_movimiento === 'DEVOLUCION')
          .reduce((suma, movimiento) => suma + Number(movimiento.cantidad || 0), 0),
        salidas: movimientosDelDia
          .filter((movimiento) => movimiento.tipo_movimiento === 'SALIDA')
          .reduce((suma, movimiento) => suma + Number(movimiento.cantidad || 0), 0)
      };
    });
    const maxMovimiento = Math.max(1, ...diasMovimiento.flatMap((dia) => [dia.entradas, dia.salidas]));
    const coordenadas = (clave) => diasMovimiento.map((dia, indice) => ({
      x: 34 + indice * 92,
      y: 154 - (dia[clave] / maxMovimiento) * 118
    }));
    const puntosEntradas = coordenadas('entradas');
    const puntosSalidas = coordenadas('salidas');
    const crearLinea = (puntos) => puntos.map((punto) => `${punto.x},${punto.y}`).join(' ');
    const productosPorCategoria = productos.reduce((resultado, producto) => {
      const nombre = producto.categoria || 'Sin categoría';
      resultado[nombre] = (resultado[nombre] || 0) + 1;
      return resultado;
    }, {});
    const coloresCategorias = ['#1677f9', '#ff9d22', '#19b88b', '#9854f6', '#12b9c7', '#ef6682'];
    let acumuladoCategorias = 0;
    const segmentosCategorias = Object.entries(productosPorCategoria).map(([nombre, cantidad], indice) => {
      const inicio = acumuladoCategorias;
      acumuladoCategorias += total ? (cantidad / total) * 100 : 0;
      return `${coloresCategorias[indice % coloresCategorias.length]} ${inicio}% ${acumuladoCategorias}%`;
    });
    const fondoCategorias = segmentosCategorias.length
      ? `conic-gradient(${segmentosCategorias.join(', ')})`
      : 'conic-gradient(#e8edf5 0% 100%)';

    return (

      <div className="dashboard">

        <div className="dashboard-header">

          <div>

            <h2>
              Bienvenido, {usuario?.nombre || 'al sistema'}
            </h2>

            <p>
              Resumen general de tu inventario
            </p>

          </div>

          <button
            className="btn-actualizar"
            onClick={cargarDashboard}
          >
            🔄 Actualizar
          </button>

        </div>

        {cargandoDashboard ? (

          <div className="mensaje">
            Cargando dashboard...
          </div>

        ) : (

          <>

            <div className="tarjetas-dashboard">

              <div className="tarjeta">

                <div className="icono">
                  📦
                </div>

                <div>

                  <h3>
                    {dashboard.total_productos}
                  </h3>

                  <p>
                    Total productos
                  </p>

                </div>

              </div>


              <div className="tarjeta">

                <div className="icono">
                  🟡
                </div>

                <div>

                  <h3>
                    {dashboard.productos_stock_bajo}
                  </h3>

                  <p>
                    Stock bajo
                  </p>

                </div>

              </div>


              <div className="tarjeta">

                <div className="icono">
                  🏷️
                </div>

                <div>

                  <h3>
                    {dashboard.total_categorias}
                  </h3>

                  <p>
                    Categorías
                  </p>

                </div>

              </div>

              <div className="tarjeta">
                <div className="icono">🔄</div>
                <div>
                  <h3>{movimientos.length}</h3>
                  <p>Movimientos</p>
                </div>
              </div>

            </div>


            <div className="panel-dashboard dashboard-movimientos">

              <h3>
                📊 Resumen de movimientos
              </h3>
              <p className="dashboard-panel-subtitle">Entradas y salidas de los últimos 7 días</p>
              <div className="dashboard-chart-legend">
                <span><i className="legend-entry" /> Entradas</span>
                <span><i className="legend-exit" /> Salidas</span>
              </div>
              <svg className="dashboard-line-chart" viewBox="0 0 620 190" role="img" aria-label="Gráfico de entradas y salidas de inventario durante los últimos siete días">
                {[36, 75, 114, 153].map((y) => <line key={y} x1="34" x2="586" y1={y} y2={y} className="chart-gridline" />)}
                <polyline points={`34,154 ${crearLinea(puntosEntradas)} 586,154`} className="chart-area-entry" />
                <polyline points={`34,154 ${crearLinea(puntosSalidas)} 586,154`} className="chart-area-exit" />
                <polyline points={crearLinea(puntosEntradas)} className="chart-line-entry" />
                <polyline points={crearLinea(puntosSalidas)} className="chart-line-exit" />
                {puntosEntradas.map((punto, indice) => <circle key={`entry-${indice}`} cx={punto.x} cy={punto.y} r="4" className="chart-dot-entry" />)}
                {puntosSalidas.map((punto, indice) => <circle key={`exit-${indice}`} cx={punto.x} cy={punto.y} r="4" className="chart-dot-exit" />)}
                {diasMovimiento.map((dia, indice) => <text key={dia.etiqueta + indice} x={34 + indice * 92} y="178" textAnchor="middle" className="chart-day">{dia.etiqueta}</text>)}
              </svg>
            </div>


            <div className="panel-dashboard dashboard-categorias">

              <h3>
                🏷️ Productos por categoría
              </h3>
              <div className="category-chart-layout">
                <div className="category-donut" style={{ background: fondoCategorias }}>
                  <div><strong>{total}</strong><span>Productos</span></div>
                </div>
                <div className="category-legend">
                  {Object.entries(productosPorCategoria).slice(0, 6).map(([nombre, cantidad], indice) => (
                    <div key={nombre}>
                      <span><i style={{ backgroundColor: coloresCategorias[indice % coloresCategorias.length] }} />{nombre}</span>
                      <strong>{total ? Math.round(cantidad / total * 100) : 0}%</strong>
                    </div>
                  ))}
                  {Object.keys(productosPorCategoria).length === 0 && <p>No hay productos por categoría.</p>}
                </div>
              </div>
            </div>

            <div className="panel-dashboard dashboard-recientes">
              <div className="dashboard-panel-heading">
                <h3>📦 Productos recientes</h3>
                <button onClick={() => { setFiltroStockDashboard(''); setVista('productos'); }}>Ver todos →</button>
              </div>
              <div className="tabla-container dashboard-tabla">
                <table>
                  <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th>Stock</th><th>Estado</th><th>Acciones</th></tr></thead>
                  <tbody>
                    {productos.slice(0, 4).map((producto) => {
                      const stockBajo = Number(producto.stock_actual) <= Number(producto.stock_minimo);
                      return (
                        <tr key={producto.id_producto}>
                          <td>{producto.codigo}</td><td>{producto.nombre}</td><td>{producto.categoria || '—'}</td><td>{producto.stock_actual}</td>
                          <td><span className={stockBajo ? 'dashboard-stock-bajo' : 'dashboard-stock-ok'}>{stockBajo ? 'Stock bajo' : 'Disponible'}</span></td>
                          <td className="dashboard-row-actions"><button className="btn-editar" onClick={() => { setVista('productos'); editarProducto(producto); }} aria-label={`Editar ${producto.nombre}`}>✏️</button><button className="btn-eliminar" onClick={() => eliminarProducto(producto.id_producto)} aria-label={`Eliminar ${producto.nombre}`}>🗑️</button></td>
                        </tr>
                      );
                    })}
                    {productos.length === 0 && <tr><td colSpan="6" className="dashboard-empty">No hay productos registrados.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="panel-dashboard dashboard-atencion">
              <h3>⚠️ Atención requerida</h3>
              {(dashboard.productos_agotados > 0 || dashboard.productos_stock_bajo > 0) ? (
                <div className="alerta-dashboard">
                  <div><strong>Se requiere revisar el inventario.</strong><p>Hay {dashboard.productos_agotados} producto(s) agotado(s) y {dashboard.productos_stock_bajo} producto(s) con stock bajo.</p></div>
                  <button onClick={() => setVista('productos')}>Ver productos</button>
                </div>
              ) : <div className="sin-alertas">✅ No hay productos con stock bajo o agotado.</div>}
              <div className="dashboard-stock-summary">
                <button type="button" className={filtroStockDashboard === 'normal' ? 'seleccionado' : ''} onClick={() => setFiltroStockDashboard(filtroStockDashboard === 'normal' ? '' : 'normal')} aria-label={`Ver ${dashboard.productos_stock_normal} productos con stock normal`}>
                  Normal <strong>{dashboard.productos_stock_normal}</strong>
                </button>
                <button type="button" className={filtroStockDashboard === 'bajo' ? 'seleccionado' : ''} onClick={() => setFiltroStockDashboard(filtroStockDashboard === 'bajo' ? '' : 'bajo')} aria-label={`Ver ${dashboard.productos_stock_bajo} productos con stock bajo`}>
                  Stock bajo <strong>{dashboard.productos_stock_bajo}</strong>
                </button>
                <button type="button" className={filtroStockDashboard === 'agotados' ? 'seleccionado' : ''} onClick={() => setFiltroStockDashboard(filtroStockDashboard === 'agotados' ? '' : 'agotados')} aria-label={`Ver ${dashboard.productos_agotados} productos agotados`}>
                  Agotados <strong>{dashboard.productos_agotados}</strong>
                </button>
                <button type="button" className={filtroStockDashboard === 'sobrestock' ? 'seleccionado' : ''} onClick={() => setFiltroStockDashboard(filtroStockDashboard === 'sobrestock' ? '' : 'sobrestock')} aria-label={`Ver ${dashboard.productos_sobrestock} productos con sobrestock`}>
                  Sobrestock <strong>{dashboard.productos_sobrestock}</strong>
                </button>
              </div>
            </div>

            {filtroStockDashboard && (
              <section className="panel-dashboard dashboard-stock-resultados">
                <div className="dashboard-panel-heading">
                  <div>
                    <h3>📦 Productos con {({ normal: 'stock normal', bajo: 'stock bajo', agotados: 'stock agotado', sobrestock: 'sobrestock' })[filtroStockDashboard]}</h3>
                    <p className="dashboard-panel-subtitle">{productosStockDashboard.length} producto(s) encontrados</p>
                  </div>
                  <button type="button" onClick={() => setFiltroStockDashboard('')}>Cerrar</button>
                </div>
                <div className="tabla-container dashboard-tabla dashboard-stock-tabla">
                  <table>
                    <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th>Proveedor</th><th>Stock actual</th><th>Stock mínimo</th><th>Stock máximo</th></tr></thead>
                    <tbody>
                      {productosStockDashboard.map((producto) => (
                        <tr key={producto.id_producto}>
                          <td><strong>{producto.codigo}</strong></td><td>{producto.nombre}</td><td>{producto.categoria || '—'}</td><td>{producto.proveedor || '—'}</td><td>{producto.stock_actual}</td><td>{producto.stock_minimo}</td><td>{producto.stock_maximo}</td>
                        </tr>
                      ))}
                      {!productosStockDashboard.length && <tr><td colSpan="7" className="dashboard-empty">No hay productos en este estado.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

          </>

        )}

      </div>
    );
  };

  const mostrarPredicciones = () => {
    const diasHistorial = Number(datosPredicciones.historial?.dias_disponibles || 0);
    return (
      <section className="predicciones-page">
        <div className="predicciones-header">
          <div>
            <span className="predicciones-eyebrow">ANÁLISIS PREDICTIVO</span>
            <h2>Predicción de demanda</h2>
            <p>Pronóstico por producto calculado a partir del Kardex diario.</p>
          </div>
          <div className="predicciones-actions">
            <button className="predicciones-btn-secundario" onClick={cargarPredicciones} disabled={cargandoPredicciones || generandoPredicciones}>Actualizar</button>
            <button className="predicciones-btn-primary" onClick={generarPredicciones} disabled={cargandoPredicciones || generandoPredicciones || importandoKardex}>
              {generandoPredicciones ? 'Entrenando modelo…' : 'Generar pronóstico de 7 días'}
            </button>
          </div>
        </div>

        <div className="predicciones-import-card">
          <div className="predicciones-import-copy">
            <strong>Cargar Kardex histórico</strong>
            <span>Selecciona un Excel con la hoja “Kardex” y las columnas del formato del sistema.</span>
          </div>
          <input
            id="archivo-kardex"
            className="predicciones-file-input"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(evento) => setArchivoKardex(evento.target.files?.[0] || null)}
            disabled={importandoKardex}
          />
          <label className="predicciones-file-label" htmlFor="archivo-kardex">
            {archivoKardex ? archivoKardex.name : 'Elegir archivo .xlsx'}
          </label>
          <button className="predicciones-btn-primary" onClick={importarKardex} disabled={!archivoKardex || importandoKardex || generandoPredicciones}>
            {importandoKardex ? 'Importando…' : 'Importar Kardex'}
          </button>
        </div>

        {Number(datosPredicciones.historial?.registros_sin_clasificar || 0) > 0 && (
          <div className="predicciones-mensaje predicciones-aviso" role="status">
            Hay {Number(datosPredicciones.historial.registros_sin_clasificar).toLocaleString()} movimientos anteriores sin clasificar. Confirma su origen antes de usar sus predicciones como resultados de tesis.
          </div>
        )}

        {errorPredicciones && <div className="predicciones-mensaje predicciones-error" role="alert">{errorPredicciones}</div>}
        {mensajePredicciones && <div className="predicciones-mensaje predicciones-exito" role="status">{mensajePredicciones}</div>}

        <div className="predicciones-resumen">
          <article><span>Días con historial</span><strong>{datosPredicciones.historial ? diasHistorial : '—'}</strong></article>
          <article><span>Productos pronosticados</span><strong>{new Set(datosPredicciones.predicciones.map((fila) => fila.id_producto)).size}</strong></article>
          <article><span>Horizonte</span><strong>7 días</strong></article>
          <article><span>Modelo</span><strong>Regresión lineal</strong></article>
        </div>

        {datosPredicciones.predicciones.length > 0 && (
          <PrediccionGraficos
            historialDiario={datosPredicciones.historial_diario || []}
            predicciones={datosPredicciones.predicciones}
          />
        )}

        <div className="predicciones-card">
          <div className="predicciones-card-heading">
            <div><h3>Pronóstico por producto</h3><p>La evaluación MAE y RMSE se calcula con los últimos días reservados para validación.</p></div>
            {datosPredicciones.historial?.fecha_inicio && <small>Historial: {String(datosPredicciones.historial.fecha_inicio).slice(0, 10)} – {String(datosPredicciones.historial.fecha_fin).slice(0, 10)}</small>}
          </div>

          {cargandoPredicciones ? <div className="predicciones-vacio">Cargando historial y pronósticos…</div> : (
            datosPredicciones.predicciones.length ? (
              <div className="tabla-container predicciones-tabla">
                <table>
                  <thead><tr><th>Producto</th><th>Fecha prevista</th><th>Demanda estimada</th><th>MAE</th><th>RMSE</th><th>Modelo</th></tr></thead>
                  <tbody>{datosPredicciones.predicciones.map((fila) => (
                    <tr key={fila.id_prediccion}>
                      <td><strong>{fila.nombre}</strong><small>{fila.codigo}</small></td>
                      <td>{String(fila.fecha_prediccion).slice(0, 10)}</td>
                      <td><strong>{Number(fila.demanda_predicha).toFixed(2)}</strong> unidades</td>
                      <td>{Number(fila.mae).toFixed(2)}</td>
                      <td>{Number(fila.rmse).toFixed(2)}</td>
                      <td>{fila.modelo}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : (
              <div className="predicciones-vacio">
                <span>📈</span>
                <h4>{diasHistorial ? 'Aún faltan datos para entrenar' : 'Falta cargar el Kardex histórico'}</h4>
                <p>{diasHistorial ? `Hay ${diasHistorial} días de historial. Se necesitan al menos 35 días con demanda suficiente para entrenar y validar el modelo.` : 'La base de datos no contiene registros diarios de demanda. El modelo solo se entrenará cuando se cargue el Kardex real; no se generarán pronósticos de ejemplo.'}</p>
              </div>
            )
          )}
        </div>
      </section>
    );
  };

  // ==========================================
  // PRODUCTOS
  // ==========================================

  const mostrarProductos = () => {

    return (

      <div className="productos">

        <div className="titulo-seccion">

          <div>

            <h2>
              📦 Productos
            </h2>

            <p>
              Administración de productos
              del inventario
            </p>

          </div>

          <div className="acciones">

            <input
              type="text"
              placeholder="🔍 Buscar por nombre, código, categoría o proveedor..."
              value={busqueda}
              onChange={(e) =>
                setBusqueda(e.target.value)
              }
            />

            <select
  value={categoriaSeleccionada}
  onChange={(e) => setCategoriaSeleccionada(e.target.value)}
>
  <option value="">Todas las categorías</option>

  {categorias.map((categoria) => (
    <option
      key={categoria.id_categoria}
      value={categoria.id_categoria}
    >
      {categoria.nombre}
    </option>
  ))}
</select>
            <button
              onClick={cargarProductos}
            >
              🔄 Actualizar
            </button>

            <button
              className="btn-nuevo"
              onClick={abrirFormularioNuevo}
            >
              ➕ Nuevo producto
            </button>

          </div>

        </div>

        {filtroStockDashboard && (
          <div className="filtro-stock-activo">
            <span>Mostrando productos: <strong>{{ normal: 'Stock normal', bajo: 'Stock bajo', agotados: 'Agotados', sobrestock: 'Sobrestock' }[filtroStockDashboard]}</strong> ({productosFiltrados.length})</span>
            <button type="button" onClick={() => setFiltroStockDashboard('')}>Mostrar todos</button>
          </div>
        )}

        {/* ALERTAS DE STOCK */}

        {!cargando &&
          !error && (

            <div
              className="alertas-container"
              style={{
                marginBottom: '20px'
              }}
            >

              {(() => {

                const productosCriticos =
                  productos.filter(
                    (p) =>
                      Number(p.stock_actual) <=
                      Number(p.stock_minimo)
                  );

                if (
                  productosCriticos.length === 0
                ) {
                  return null;
                }

                return (

                  <div
                    style={{
                      backgroundColor:
                        '#fff3cd',

                      border:
                        '1px solid #ffeeba',

                      color:
                        '#856404',

                      padding:
                        '12px 20px',

                      borderRadius:
                        '6px',

                      display:
                        'flex',

                      flexDirection:
                        'column',

                      gap:
                        '8px'
                    }}
                  >

                    <div
                      style={{
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      ⚠️ ¡Atención! Hay{' '}
                      {productosCriticos.length}{' '}
                      producto(s) con stock bajo
                      o crítico.
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '10px'
                      }}
                    >

                      {productosCriticos.map(
                        (p) => (

                          <span
                            key={
                              p.id_producto
                            }
                            style={{
                              backgroundColor:
                                '#f8d7da',

                              color:
                                '#721c24',

                              padding:
                                '4px 10px',

                              borderRadius:
                                '4px',

                              fontSize:
                                '14px',

                              border:
                                '1px solid #f5c6cb'
                            }}
                          >

                            <strong>
                              {p.nombre}
                            </strong>

                            {' '}
                            (Stock actual:{' '}
                            {p.stock_actual}
                            {' '}| Mínimo:{' '}
                            {p.stock_minimo})

                          </span>

                        )
                      )}

                    </div>

                  </div>

                );

              })()}

            </div>

          )
        }


        {/* FORMULARIO */}

        {mostrarFormulario && (

          <form
            className="formulario"
            onSubmit={
              modoEdicion
                ? actualizarProducto
                : registrarProducto
            }
          >

            <h3>

              {modoEdicion
                ? 'Editar producto'
                : 'Registrar nuevo producto'}

            </h3>


            <div className="form-grid">

              <div>

                <label>
                  Código
                </label>

                <input
                  type="text"
                  name="codigo"
                  value={
                    formulario.codigo
                  }
                  onChange={
                    manejarCambio
                  }
                  placeholder="Ej. BEB002"
                  required
                />

              </div>


              <div>

                <label>
                  Nombre
                </label>

                <input
                  type="text"
                  name="nombre"
                  value={
                    formulario.nombre
                  }
                  onChange={
                    manejarCambio
                  }
                  placeholder="Nombre del producto"
                  required
                />

              </div>


              <div>

                <label>
                  Descripción
                </label>

                <input
                  type="text"
                  name="descripcion"
                  value={
                    formulario.descripcion
                  }
                  onChange={
                    manejarCambio
                  }
                  placeholder="Descripción"
                />

              </div>


              <div>

                <label>
                  Categoría
                </label>

                <select
  name="id_categoria"
  value={formulario.id_categoria}
  onChange={manejarCambio}
  required
>
  <option value="">Seleccionar categoría</option>

  {categorias.map((categoria) => (
    <option
      key={categoria.id_categoria}
      value={categoria.id_categoria}
    >
      {categoria.nombre}
    </option>
  ))}
</select>
</div>

<div>
  <label>Proveedor</label>
  <select
    name="id_proveedor"
    value={formulario.id_proveedor}
    onChange={manejarCambio}
  >
    <option value="">Sin proveedor</option>
    {proveedores.map((proveedor) => (
      <option
        key={proveedor.id_proveedor}
        value={proveedor.id_proveedor}
      >
        {proveedor.razon_social}
      </option>
    ))}
  </select>
</div>

              <div>
                <label>
                  Precio de compra
                </label>

                <input
                  type="number"
                  step="0.01"
                  name="precio_compra"
                  value={
                    formulario.precio_compra
                  }
                  onChange={
                    manejarCambio
                  }
                  required
                />

              </div>


              <div>

                <label>
                  Precio de venta
                </label>

                <input
                  type="number"
                  step="0.01"
                  name="precio_venta"
                  value={
                    formulario.precio_venta
                  }
                  onChange={
                    manejarCambio
                  }
                  required
                />

              </div>


              <div>

                <label>
                  Stock actual
                </label>

                <input
                  type="number"
                  name="stock_actual"
                  value={
                    formulario.stock_actual
                  }
                  onChange={
                    manejarCambio
                  }
                  min="0"
                />

              </div>


              <div>

                <label>
                  Stock mínimo
                </label>

                <input
                  type="number"
                  name="stock_minimo"
                  value={
                    formulario.stock_minimo
                  }
                  onChange={
                    manejarCambio
                  }
                  min="0"
                />

              </div>


              <div>

                <label>
                  Stock máximo
                </label>

                <input
                  type="number"
                  name="stock_maximo"
                  value={
                    formulario.stock_maximo
                  }
                  onChange={
                    manejarCambio
                  }
                  min="1"
                />

              </div>


              <div>

                <label>
                  Unidad de medida
                </label>

                <select
                  name="unidad_medida"
                  value={
                    formulario.unidad_medida
                  }
                  onChange={
                    manejarCambio
                  }
                >

                  <option value="UNIDAD">
                    UNIDAD
                  </option>

                  <option value="CAJA">
                    CAJA
                  </option>

                  <option value="PAQUETE">
                    PAQUETE
                  </option>

                  <option value="KILOGRAMO">
                    KILOGRAMO
                  </option>

                  <option value="LITRO">
                    LITRO
                  </option>

                </select>

              </div>

            </div>


            <div
              className="botones-formulario"
            >

              <button
                type="button"
                className="btn-cancelar"
                onClick={() =>
                  setMostrarFormulario(false)
                }
              >
                Cancelar
              </button>

              <button
                type="submit"
                className="btn-guardar"
              >

                {modoEdicion
                  ? '💾 Guardar cambios'
                  : '💾 Guardar producto'}

              </button>

            </div>

          </form>

        )}


        {cargando && (

          <div className="mensaje">
            Cargando productos...
          </div>

        )}


        {error && (

          <div className="error">
            {error}
          </div>

        )}


        {!cargando &&
          !error &&
          productos.length === 0 && (

            <div className="mensaje">
              No hay productos registrados.
            </div>

          )
        }


        {!cargando &&
          !error &&
          productos.length > 0 && (

            <div className="tabla-container">
              <div className="buscador-productos">
                <input
                   type="text"
                   placeholder="Buscar por producto, categoría o proveedor..."
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                       />
                </div>
              <table>
                <thead>

                  <tr>

                    <th>ID</th>
                    <th>Código</th>
                    <th>Producto</th>
                    <th>Categoría</th>
                    <th>Proveedor</th>
                    <th>Precio compra</th>
                    <th>Precio venta</th>
                    <th>Stock</th>
                    <th>Estado</th>
                    <th>Acciones</th>

                  </tr>

                </thead>


                <tbody>

                  {productosFiltrados.map(
                    (producto) => (

                      <tr
                        key={
                          producto.id_producto
                        }
                      >

                        <td>
                          {producto.id_producto}
                        </td>

                        <td>
                          <strong>
                            {producto.codigo}
                          </strong>
                        </td>

                        <td>
                          {producto.nombre}
                        </td>

                        <td>
                          {producto.categoria}
                        </td>

                        <td>
                           {producto.proveedor || 'Sin proveedor'}
                        </td>

                        <td>
                          S/{' '}
                          {Number(
                            producto.precio_compra
                          ).toFixed(2)}
                        </td>

                        <td>
                          S/{' '}
                          {Number(
                            producto.precio_venta
                          ).toFixed(2)}
                        </td>

                        <td>
                          <span className="stock">
                            {producto.stock_actual}
                          </span>
                        </td>

                        <td>

                          {producto.estado === 1 ? (

                            <span className="activo">
                              Activo
                            </span>

                          ) : (

                            <span className="inactivo">
                              Inactivo
                            </span>

                          )}

                        </td>

                        <td>

                          <button
                            className="btn-editar"
                            onClick={() =>
                              editarProducto(
                                producto
                              )
                            }
                          >
                            ✏️ Editar
                          </button>


                          <button
                            className="btn-eliminar"
                            onClick={() =>
                              eliminarProducto(
                                producto.id_producto
                              )
                            }
                            style={{
                              marginLeft: '8px',
                              backgroundColor: '#e74c3c',
                              color: 'white',
                              border: 'none',
                              padding: '5px 10px',
                              borderRadius: '4px',
                              cursor: 'pointer'
                            }}
                          >
                            🗑️ Eliminar
                          </button>

                        </td>

                      </tr>

                    )
                  )}

                  {productosFiltrados.length === 0 && (
                    <tr><td colSpan="10" className="dashboard-empty">No hay productos que coincidan con este filtro.</td></tr>
                  )}

                </tbody>

              </table>

            </div>

          )
        }

      </div>
    );
  };
// ==========================================
// MOVIMIENTOS
// ==========================================

const mostrarMovimientos = () => {

  return (

    <div className="productos">

      <div className="titulo-seccion">

        <div>

          <h2>
            🔄 Movimientos de Inventario
          </h2>

          <p>
            Registro de entradas, salidas,
            ajustes y devoluciones
          </p>

        </div>

        <div className="acciones">

          <button
            onClick={cargarMovimientos}
          >
            🔄 Actualizar
          </button>

          <button
            className="btn-nuevo"
            onClick={abrirFormularioMovimiento}
          >
            ➕ Nuevo movimiento
          </button>

        </div>

      </div>


      {/* FORMULARIO */}

      {mostrarMovimiento && (

        <form
          className="formulario"
          onSubmit={registrarMovimiento}
        >

          <h3>
            Registrar movimiento de inventario
          </h3>


          <div className="form-grid">


            {/* PRODUCTO */}

            <div>

              <label>
                Producto
              </label>

              <select
                name="id_producto"
                value={
                  formularioMovimiento.id_producto
                }
                onChange={
                  manejarCambioMovimiento
                }
                required
              >

                <option value="">
                  Seleccionar producto
                </option>

                {productos.map(
                  (producto) => (

                    <option
                      key={
                        producto.id_producto
                      }
                      value={
                        producto.id_producto
                      }
                    >

                      {producto.codigo}
                      {' - '}
                      {producto.nombre}
                      {' | Stock: '}
                      {producto.stock_actual}

                    </option>

                  )
                )}

              </select>

            </div>


            {/* TIPO */}

            <div>

              <label>
                Tipo de movimiento
              </label>

              <select
                name="tipo_movimiento"
                value={
                  formularioMovimiento.tipo_movimiento
                }
                onChange={
                  manejarCambioMovimiento
                }
                required
              >

                <option value="ENTRADA">
                  ➕ Entrada
                </option>

                <option value="SALIDA">
                  ➖ Salida
                </option>

                <option value="AJUSTE">
                  🔄 Ajuste
                </option>

                <option value="DEVOLUCION">
                  ↩️ Devolución
                </option>

              </select>

            </div>


            {/* CANTIDAD */}

            <div>

              <label>

                {
                  formularioMovimiento.tipo_movimiento ===
                  'AJUSTE'
                    ? 'Nuevo stock'
                    : 'Cantidad'
                }

              </label>

              <input
                type="number"
                name="cantidad"
                value={
                  formularioMovimiento.cantidad
                }
                onChange={
                  manejarCambioMovimiento
                }
                min="1"
                required
              />

            </div>
            {/* MOTIVO */}
            <div>
              <label>
                Motivo
              </label>
              <input
                type="text"
                name="motivo"
                value={
                  formularioMovimiento.motivo
                }
                onChange={
                  manejarCambioMovimiento
                }
                placeholder="Ej. Compra de mercadería"
              />
            </div>

          </div>
          {/* BOTONES */}
          <div className="botones-formulario">
            <button
              type="button"
              className="btn-cancelar"
              onClick={() =>
                setMostrarMovimiento(false)
              }
            >
              Cancelar
            </button>

            <button
              type="submit"
              className="btn-guardar"
            >
              💾 Registrar movimiento
            </button>

          </div>

        </form>

      )}


      {/* TABLA */}

      <div className="tabla-container">

        <table>

          <thead>

            <tr>

              <th>ID</th>
              <th>Fecha</th>
              <th>Código</th>
              <th>Producto</th>
              <th>Tipo</th>
              <th>Cantidad</th>
              <th>Stock anterior</th>
              <th>Stock nuevo</th>
              <th>Motivo</th>

            </tr>

          </thead>


          <tbody>

            {movimientos.length === 0 ? (

              <tr>

                <td
                  colSpan="9"
                  style={{
                    textAlign: 'center'
                  }}
                >
                  No hay movimientos registrados.
                </td>

              </tr>

            ) : (

              movimientos.map(
                (movimiento) => (

                  <tr
                    key={
                      movimiento.id_movimiento
                    }
                  >

                    <td>
                      {movimiento.id_movimiento}
                    </td>

                    <td>
                      {movimiento.fecha_movimiento}
                    </td>

                    <td>
                      <strong>
                        {movimiento.codigo}
                      </strong>
                    </td>

                    <td>
                      {movimiento.nombre_producto}
                    </td>

                    <td>

                      {movimiento.tipo_movimiento ===
                        'ENTRADA' && (

                        <span className="movimiento-entrada">
                          ➕ ENTRADA
                        </span>

                      )}

                      {movimiento.tipo_movimiento ===
                        'SALIDA' && (

                        <span className="movimiento-salida">
                          ➖ SALIDA
                        </span>

                      )}

                      {movimiento.tipo_movimiento ===
                        'AJUSTE' && (

                        <span className="movimiento-ajuste">
                          🔄 AJUSTE
                        </span>

                      )}

                      {movimiento.tipo_movimiento ===
                        'DEVOLUCION' && (

                        <span className="movimiento-devolucion">
                          ↩️ DEVOLUCIÓN
                        </span>

                      )}

                    </td>

                    <td>
                      <strong>
                        {movimiento.cantidad}
                      </strong>
                    </td>

                    <td>
                      {movimiento.stock_anterior}
                    </td>

                    <td>
                      <strong>
                        {movimiento.stock_nuevo}
                      </strong>
                    </td>

                    <td>
                      {movimiento.motivo || '-'}
                    </td>

                  </tr>

                )
              )

            )}

          </tbody>

        </table>

      </div>

    </div>

  );
};
// ==========================================
// ALERTAS
// ==========================================

const mostrarAlertas = () => {

  const alertasPendientes = alertas.filter(
    (alerta) => Number(alerta.atendida) === 0
  );

  const alertasAtendidas = alertas.filter(
    (alerta) => Number(alerta.atendida) === 1
  );
  const alertasFiltradas = alertas.filter((alerta) => {
    if (filtroAlertas === 'pendientes') return Number(alerta.atendida) === 0;
    if (filtroAlertas === 'criticas') return Number(alerta.atendida) === 0 && alerta.nivel === 'CRITICO';
    if (filtroAlertas === 'altas') return Number(alerta.atendida) === 0 && alerta.nivel === 'ALTO';
    if (filtroAlertas === 'atendidas') return Number(alerta.atendida) === 1;
    return true;
  });
  const cambiarFiltroAlertas = (filtro) => setFiltroAlertas((actual) => actual === filtro ? '' : filtro);

  return (

    <div className="productos">

      <div className="titulo-seccion">

        <div>

          <h2>
            ⚠️ Alertas de Inventario
          </h2>

          <p>
            Monitoreo de productos con problemas de stock
          </p>

        </div>

        <div className="acciones">

          <button
            onClick={cargarAlertas}
          >
            🔄 Actualizar
          </button>

          <button
            className="btn-nuevo"
            onClick={generarAlertas}
          >
            🔍 Analizar inventario
          </button>

        </div>

      </div>


      {/* RESUMEN */}

      <div className="tarjetas-dashboard">

        <button type="button" className={`tarjeta tarjeta-alerta-interactiva ${filtroAlertas === 'pendientes' ? 'seleccionada' : ''}`} onClick={() => cambiarFiltroAlertas('pendientes')} aria-pressed={filtroAlertas === 'pendientes'}>

          <div className="icono">
            ⚠️
          </div>

          <div>

            <h3>
              {alertasPendientes.length}
            </h3>

            <p>
              Alertas pendientes
            </p>

          </div>

        </button>


        <button type="button" className={`tarjeta tarjeta-alerta-interactiva ${filtroAlertas === 'criticas' ? 'seleccionada' : ''}`} onClick={() => cambiarFiltroAlertas('criticas')} aria-pressed={filtroAlertas === 'criticas'}>

          <div className="icono">
            🔴
          </div>

          <div>

            <h3>
              {
                alertasPendientes.filter(
                  (a) => a.nivel === 'CRITICO'
                ).length
              }
            </h3>

            <p>
              Alertas críticas
            </p>

          </div>

        </button>


        <button type="button" className={`tarjeta tarjeta-alerta-interactiva ${filtroAlertas === 'altas' ? 'seleccionada' : ''}`} onClick={() => cambiarFiltroAlertas('altas')} aria-pressed={filtroAlertas === 'altas'}>

          <div className="icono">
            🟠
          </div>

          <div>

            <h3>
              {
                alertasPendientes.filter(
                  (a) => a.nivel === 'ALTO'
                ).length
              }
            </h3>

            <p>
              Nivel alto
            </p>

          </div>

        </button>


        <button type="button" className={`tarjeta tarjeta-alerta-interactiva ${filtroAlertas === 'atendidas' ? 'seleccionada' : ''}`} onClick={() => cambiarFiltroAlertas('atendidas')} aria-pressed={filtroAlertas === 'atendidas'}>

          <div className="icono">
            ✅
          </div>

          <div>

            <h3>
              {alertasAtendidas.length}
            </h3>

            <p>
              Atendidas
            </p>

          </div>

        </button>

      </div>


      {/* LISTA DE ALERTAS */}

      {filtroAlertas && <div className="filtro-alertas-activo">
        <span>Mostrando: <strong>{{ pendientes: 'Alertas pendientes', criticas: 'Alertas críticas', altas: 'Alertas de nivel alto', atendidas: 'Alertas atendidas' }[filtroAlertas]}</strong> ({alertasFiltradas.length})</span>
        <button type="button" onClick={() => setFiltroAlertas('')}>Ver todas</button>
      </div>}

      {cargandoAlertas ? (

        <div className="mensaje">
          Cargando alertas...
        </div>

      ) : alertas.length === 0 ? (

        <div className="sin-alertas">

          ✅ No hay alertas registradas.

        </div>

      ) : (

        <div className="tabla-container">

          <table>

            <thead>

              <tr>

                <th>ID</th>
                <th>Fecha</th>
                <th>Código</th>
                <th>Producto</th>
                <th>Tipo</th>
                <th>Mensaje</th>
                <th>Nivel</th>
                <th>Stock</th>
                <th>Estado</th>
                <th>Acción</th>

              </tr>

            </thead>


            <tbody>

              {alertasFiltradas.map(
                (alerta) => (

                  <tr
                    key={alerta.id_alerta}
                  >

                    <td>
                      {alerta.id_alerta}
                    </td>

                    <td>
                      {new Date(alerta.fecha_alerta).toLocaleString('es-PE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                      })}
                    </td>
                    <td>
                      <strong>
                        {alerta.codigo}
                      </strong>
                    </td>

                    <td>
                      {alerta.nombre_producto}
                    </td>

                    <td>

                      {alerta.tipo_alerta ===
                        'STOCK_AGOTADO' && (
                        <span className="alerta-agotado">
                          🔴 AGOTADO
                        </span>
                      )}

                      {alerta.tipo_alerta ===
                        'STOCK_BAJO' && (
                        <span className="alerta-bajo">
                          🟠 STOCK BAJO
                        </span>
                      )}

                      {alerta.tipo_alerta ===
                        'SOBRESTOCK' && (
                        <span className="alerta-sobrestock">
                          🟡 SOBRESTOCK
                        </span>
                      )}

                      {alerta.tipo_alerta ===
                        'REPOSICION' && (
                        <span className="alerta-reposicion">
                          🔄 REPOSICIÓN
                        </span>
                      )}

                    </td>

                    <td>
                      {alerta.mensaje}
                    </td>

                    <td>

                      {alerta.nivel ===
                        'CRITICO' && (
                        <span className="nivel-critico">
                          CRÍTICO
                        </span>
                      )}

                      {alerta.nivel ===
                        'ALTO' && (
                        <span className="nivel-alto">
                          ALTO
                        </span>
                      )}

                      {alerta.nivel ===
                        'MEDIO' && (
                        <span className="nivel-medio">
                          MEDIO
                        </span>
                      )}

                      {alerta.nivel ===
                        'BAJO' && (
                        <span className="nivel-bajo">
                          BAJO
                        </span>
                      )}

                    </td>

                    <td>

                      <strong>
                        {alerta.stock_actual}
                      </strong>

                      {' / '}

                      {alerta.stock_minimo}

                    </td>

                    <td>

                      {Number(alerta.atendida) === 0 ? (

                        <span className="alerta-pendiente">
                          ⏳ Pendiente
                        </span>

                      ) : (

                        <span className="alerta-atendida">
                          ✅ Atendida
                        </span>

                      )}

                    </td>

                    <td>
                      {Number(alerta.atendida) === 0 ? (
                        <button
                          className="btn-atender"
                          onClick={() => atenderAlerta(alerta.id_alerta)}
                        >
                          ✅ Atender
                        </button>
                      ) : (
                        <span className="alerta-atendida">
                          ✅ Atendida
                        </span>
                      )}
                    </td>

                  </tr>
                )
              )}

              {alertasFiltradas.length === 0 && <tr><td colSpan="10" className="dashboard-empty">No hay alertas para este filtro.</td></tr>}

            </tbody>

          </table>

        </div>

      )}

    </div>

  );
};
  // ==========================================
  // PANTALLA DE LOGIN
  // ==========================================
  if (!autenticado) {
    return (
      <Login onLogin={manejarLogin} />
    );
  }
  // ==========================================
// PANTALLA DE CATEGORÍAS
// ==========================================

const mostrarCategorias = () => (
  <div className="seccion">
    <div className="seccion-header">
      <div>
        <h2>🏷️ Gestión de categorías</h2>
        <p>Administra las categorías de tus productos.</p>
      </div>

      <button
        className="btn-primario"
        onClick={() => abrirFormularioCategoria()}
      >
        + Nueva categoría
      </button>
    </div>

    {mostrarFormularioCategoria && (
      <div className="formulario-contenedor">
        <h3>
          {editandoCategoria ? 'Editar categoría' : 'Registrar categoría'}
        </h3>

        <form onSubmit={guardarCategoria}>
          <label>Nombre de la categoría</label>
          <input
            type="text"
            value={formularioCategoria.nombre}
            onChange={(e) =>
              setFormularioCategoria({
                ...formularioCategoria,
                nombre: e.target.value
              })
            }
            maxLength={100}
            required
          />

          <label>Descripción</label>
          <textarea
            value={formularioCategoria.descripcion}
            onChange={(e) =>
              setFormularioCategoria({
                ...formularioCategoria,
                descripcion: e.target.value
              })
            }
            maxLength={255}
            rows={3}
          />

          <div className="acciones-formulario">
            <button type="submit" className="btn-primario">
              Guardar
            </button>

            <button
              type="button"
              className="btn-secundario"
              onClick={() => {
                setMostrarFormularioCategoria(false);
                setEditandoCategoria(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    )}

    <div className="tabla-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Nombre</th>
            <th>Descripción</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {categorias.length === 0 ? (
            <tr>
              <td colSpan="5">No hay categorías registradas.</td>
            </tr>
          ) : (
            categorias.map((categoria) => (
              <tr key={categoria.id_categoria}>
                <td>{categoria.id_categoria}</td>
                <td>{categoria.nombre}</td>
                <td>{categoria.descripcion || 'Sin descripción'}</td>
                <td>
                  {Number(categoria.estado) === 1
                    ? 'Activa'
                    : 'Inactiva'}
                </td>
               <td>
                <button
                type="button"
                className="btn-editar"
                onClick={() => abrirFormularioCategoria(categoria)}
                >
                ✏️ Editar
                </button>
                <button
                type="button"
                className="btn-eliminar"
                style={{ marginLeft: '8px' }}
                onClick={() => eliminarCategoria(categoria)}
                >
              🗑️ Eliminar
              </button>
              </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);
const mostrarProveedores = () => (
  <div className="seccion">
    <div className="seccion-header">
      <div>
        <h2>🚚 Gestión de proveedores</h2>
        <p>Administra los proveedores de tus productos.</p>
      </div>

      <button
        className="btn-primario"
        onClick={() => {
          setEditandoProveedor(null);
          setFormularioProveedor({
            razon_social: '',
            ruc: '',
            telefono: '',
            correo: '',
            direccion: ''
          });
          setMostrarFormularioProveedor(true);
        }}
      >
        + Nuevo proveedor
      </button>
    </div>

    {mostrarFormularioProveedor && (
      <div className="formulario-contenedor">
        <h3>
          {editandoProveedor ? 'Editar proveedor' : 'Registrar proveedor'}
        </h3>

        <form
          onSubmit={async (e) => {
            e.preventDefault();

            try {
              const url = editandoProveedor
                ? `${API_BASE}/proveedores/${editandoProveedor.id_proveedor}`
                : `${API_BASE}/proveedores`;

              const respuesta = await apiFetch(url, {
                method: editandoProveedor ? 'PUT' : 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(formularioProveedor)
              });

              const resultado = await respuesta.json();

              if (!respuesta.ok) {
                throw new Error(
                  resultado.mensaje || resultado.error || 'No se pudo guardar el proveedor'
                );
              }

              alert(
                editandoProveedor
                  ? 'Proveedor actualizado correctamente.'
                  : 'Proveedor registrado correctamente.'
              );

              setMostrarFormularioProveedor(false);
              setEditandoProveedor(null);

              setFormularioProveedor({
                razon_social: '',
                ruc: '',
                telefono: '',
                correo: '',
                direccion: ''
              });

              await cargarProveedores();
            } catch (error) {
              console.error('Error al guardar proveedor:', error);
              alert(error.message || 'Ocurrió un error al guardar el proveedor.');
            }
          }}
        >
          <label>Razón social</label>
          <input
            type="text"
            value={formularioProveedor.razon_social}
            onChange={(e) =>
              setFormularioProveedor({
                ...formularioProveedor,
                razon_social: e.target.value
              })
            }
            maxLength={150}
            required
          />

          <label>RUC</label>
          <input
            type="text"
            value={formularioProveedor.ruc}
            onChange={(e) =>
              setFormularioProveedor({
                ...formularioProveedor,
                ruc: e.target.value
              })
            }
            maxLength={11}
            pattern="[0-9]{11}"
            title="El RUC debe contener exactamente 11 dígitos."
          />

          <label>Teléfono</label>
          <input
            type="text"
            value={formularioProveedor.telefono}
            onChange={(e) =>
              setFormularioProveedor({
                ...formularioProveedor,
                telefono: e.target.value
              })
            }
            maxLength={20}
          />

          <label>Correo electrónico</label>
          <input
            type="email"
            value={formularioProveedor.correo}
            onChange={(e) =>
              setFormularioProveedor({
                ...formularioProveedor,
                correo: e.target.value
              })
            }
            maxLength={150}
          />

          <label>Dirección</label>
          <textarea
            value={formularioProveedor.direccion}
            onChange={(e) =>
              setFormularioProveedor({
                ...formularioProveedor,
                direccion: e.target.value
              })
            }
            maxLength={255}
            rows={3}
          />

          <div className="acciones-formulario">
            <button type="submit" className="btn-primario">
              Guardar proveedor
            </button>

            <button
              type="button"
              className="btn-secundario"
              onClick={() => {
                setMostrarFormularioProveedor(false);
                setEditandoProveedor(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    )}

    <div className="tabla-container">
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Razón social</th>
            <th>RUC</th>
            <th>Teléfono</th>
            <th>Correo</th>
            <th>Dirección</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>

        <tbody>
          {proveedores.length === 0 ? (
            <tr>
              <td colSpan="8">No hay proveedores registrados.</td>
            </tr>
          ) : (
            proveedores.map((proveedor) => (
              <tr key={proveedor.id_proveedor}>
                <td>{proveedor.id_proveedor}</td>
                <td>{proveedor.razon_social}</td>
                <td>{proveedor.ruc || '—'}</td>
                <td>{proveedor.telefono || '—'}</td>
                <td>{proveedor.correo || '—'}</td>
                <td>{proveedor.direccion || '—'}</td>
                <td>
                  {Number(proveedor.estado) === 1 ? 'Activo' : 'Inactivo'}
                </td>
                <td>
                  <button
                    className="btn-editar"
                    onClick={() => {
                      setEditandoProveedor(proveedor);

                      setFormularioProveedor({
                        razon_social: proveedor.razon_social || '',
                        ruc: proveedor.ruc || '',
                        telefono: proveedor.telefono || '',
                        correo: proveedor.correo || '',
                        direccion: proveedor.direccion || ''
                      });

                      setMostrarFormularioProveedor(true);
                    }}
                  >
                    ✏️ Editar
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  </div>
);
  // ==========================================
  // INTERFAZ PRINCIPAL
  // ==========================================
  return (

    <div className="app">
      <header className="header">
          <div className="header-welcome">
            <h1>Bienvenido, {usuario?.nombre} {usuario?.apellido}</h1>
            <p>Sistema de Gestión de Inventarios</p>
          </div>
          <div className="header-actions">
            <div className="header-date">
              <span>▦</span>
              {new Date().toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <div className="usuario-header">
              <div className="usuario-avatar">{usuario?.nombre?.charAt(0)}{usuario?.apellido?.charAt(0)}</div>
              <div>
                <strong>{usuario?.nombre} {usuario?.apellido}</strong>
                <small>{usuario?.rol}</small>
              </div>
            <button
              className="btn-cerrar-sesion"
              onClick={cerrarSesion}
            >
              Cerrar sesión <span>↗</span>
            </button>
          </div>
          </div>
        </header>
      <div className="layout">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <div className="sidebar-brand">
            <span className="sidebar-brand-icon">🛒</span>
            <strong>Minemarket<br />Tito’s</strong>
          </div>
          <h3>
            MENÚ PRINCIPAL
          </h3>
          <button
            className={
              vista === 'dashboard'
                ? 'menu-activo'
                : ''
            }
            onClick={() => {

              setVista('dashboard');
              cargarDashboard();

            }}
          >
            📊 Dashboard
          </button>


          <button
            className={
              vista === 'productos'
                ? 'menu-activo'
                : ''
            }
            onClick={() => {

              setVista('productos');
              cargarProductos();

            }}
          >
            📦 Productos
          </button>

            <button
              className={vista === 'categorias' ? 'menu-activo' : ''}
              onClick={() => {
               setVista('categorias');
                 cargarCategorias();
                }}
                >
                🏷️ Categorías
          </button>
        
            <button
              className={vista === 'proveedores' ? 'menu-activo' : ''}
              onClick={() => {
              setVista('proveedores');
              cargarProveedores();
              }}
              >
              🚚 Proveedores
            </button>
          
            <button
              className={vista === 'compras' ? 'menu-activo' : ''}
              onClick={() => {
                setVista('compras');
              }}
>
              📥 Compras
            </button>

            <button
              className={
              vista === 'movimientos'
              ? 'menu-activo'
                 : ''
               }
              onClick={() => {
                setVista('movimientos');
                cargarMovimientos();
                cargarProductos();
              }}
              >
                🔄 Movimientos
            </button>
          <button
            className={
              vista === 'alertas'
                ? 'menu-activo'
                : ''
            }
            onClick={() => {
              setVista('alertas');
              cargarAlertas();
            }}
          >
            ⚠️ Alertas
          </button>
          <button
            className={vista === 'predicciones' ? 'menu-activo' : ''}
            onClick={() => {
              setVista('predicciones');
              cargarPredicciones();
            }}
          >
            🤖 Predicción ML
          </button>
        </aside>
        {/* CONTENIDO */}
        <main className="contenido">
          {vista === 'compras' && <Compras />}
          {vista === 'categorias' &&
           mostrarCategorias()}
          {vista === 'proveedores' &&
           mostrarProveedores()}
          {vista === 'dashboard' &&
            mostrarDashboard()}
          {vista === 'productos' &&
            mostrarProductos()}
          {vista === 'movimientos' &&
            mostrarMovimientos()}
          {vista === 'alertas' &&
            mostrarAlertas()}
          {vista === 'predicciones' &&
            mostrarPredicciones()}
        </main>
      </div>
    </div>
  );
}
export default App;
