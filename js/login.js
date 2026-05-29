/* ====================================================================
   CONTROLADOR DE AUTENTICACIÓN: LOGIN INDEPENDIENTE
   ==================================================================== */

import * as api from './supabase-api.js';
import { showToast } from './components.js';

document.addEventListener('DOMContentLoaded', async () => {
    // Si el usuario ya está autenticado, redirigir directamente a la página principal
    const user = await api.getCurrentUser();
    if (user) {
        window.location.href = 'index.html';
        return;
    }

    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', handleLoginSubmit);

    // Inicializar iconos Lucide
    if (window.lucide) {
        window.lucide.createIcons();
    }
});

async function handleLoginSubmit(e) {
    e.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
        showToast('Por favor, completa todos los campos', 'warning');
        return;
    }

    const submitBtn = document.getElementById('login-submit-btn');
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = "Procesando...";

    const { data, error } = await api.signIn(email, password);

    if (error) {
        showToast(`Error al iniciar sesión: ${error}`, 'danger');
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = "Ingresar";
        if (window.lucide) window.lucide.createIcons();
    } else {
        showToast('¡Acceso concedido! Redireccionando...', 'success');
        
        // Esperar un instante para que el Toast sea visible
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1200);
    }
}
