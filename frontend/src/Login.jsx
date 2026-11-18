
import { useState } from 'react';
import './Login.css';
import { API_BASE } from './api';

function Login({ onLogin }) {
    const [correo, setCorreo] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);
    const [mostrarPassword, setMostrarPassword] = useState(false);

    const iniciarSesion = async (e) => {
        e.preventDefault();
        setError('');

        const correoLimpio = correo.trim().toLowerCase();

        if (!correoLimpio || !password) {
            setError('Ingresa tu correo y contraseña.');
            return;
        }

        if (cargando) return;

        try {
            setCargando(true);

            const respuesta = await fetch(
                `${API_BASE}/auth/login`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        correo: correoLimpio,
                        password
                    })
                }
            );

            const datos = await respuesta.json();

            if (!respuesta.ok) {
                setError(
                    datos.error || 'Correo o contraseña incorrectos.'
                );
                return;
            }

            if (!datos.token || !datos.usuario) {
                setError('El servidor no devolvió una sesión válida.');
                return;
            }

            localStorage.setItem('token', datos.token);
            localStorage.setItem(
                'usuario',
                JSON.stringify(datos.usuario)
            );

            onLogin(datos.usuario);

        } catch (err) {
            console.error('Error de inicio de sesión:', err);
            setError('No se pudo conectar con el servidor.');
        } finally {
            setCargando(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-shell">
              <section className="login-visual" aria-label="Minemarket Tito's">
                <div className="login-visual-brand">
                  <span>🛒</span>
                  <strong>Minemarket<br />Tito's</strong>
                </div>
                <div className="login-visual-copy">
                  <span className="login-eyebrow">GESTIÓN INTELIGENTE</span>
                  <h2>Tu inventario,<br />siempre en control.</h2>
                  <p>Administra productos, compras y movimientos desde un solo lugar.</p>
                </div>
                <div className="login-visual-mark" aria-hidden="true">M</div>
                <div className="login-visual-footer">Control claro para el día a día.</div>
              </section>

              <div className="login-card">

                <div className="login-header">
                    <div className="login-icon">
                        🛒
                    </div>

                    <span className="login-eyebrow">BIENVENIDO DE NUEVO</span>
                    <h1>Inicia sesión</h1>

                    <p>
                        Ingresa tus datos para continuar al sistema.
                    </p>
                </div>

                <form onSubmit={iniciarSesion}>

                    <div className="form-group">
                        <label htmlFor="correo">
                            Correo electrónico
                        </label>

                        <input
                            id="correo"
                            type="email"
                            placeholder="admin@inventario.com"
                            value={correo}
                            onChange={(e) => setCorreo(e.target.value)}
                            autoComplete="username"
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">
                            Contraseña
                        </label>

                        <div className="password-wrapper">
                            <input
                                id="password"
                                type={mostrarPassword ? 'text' : 'password'}
                                placeholder="Ingresa tu contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                autoComplete="current-password"
                                required
                            />

                            <button
                                type="button"
                                className="password-toggle"
                                onClick={() =>
                                    setMostrarPassword(!mostrarPassword)
                                }
                            >
                                {mostrarPassword ? 'Ocultar' : 'Mostrar'}
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="login-error" role="alert">
                            ⚠️ {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="login-button"
                        disabled={cargando}
                    >
                        {cargando
                            ? 'Ingresando...'
                            : 'Iniciar sesión →'}
                    </button>

                </form>

                <div className="login-footer">
                    <span>Minemarket Tito's</span>
                    <span>Sistema de Inventarios</span>
                </div>

              </div>
            </div>
        </div>
    );
}

export default Login;
