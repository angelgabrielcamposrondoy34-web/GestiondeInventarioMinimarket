
export const API_BASE = (
  import.meta.env.VITE_API_URL || 'https://minemarket-titos.onrender.com/api'
).replace(/\/+$/, '');

export function apiFetch(url, options = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, { ...options, headers }).then((respuesta) => {
    if (
      respuesta.status === 401 &&
      token &&
      !String(url).includes('/auth/login')
    ) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.reload();
    }

    return respuesta;
  });
}
