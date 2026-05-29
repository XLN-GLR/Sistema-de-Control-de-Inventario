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

    // Verificar si se redirigió por intentar agregar productos sin iniciar sesión
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auth_required') === 'true') {
        // Un pequeño retraso para asegurar que el DOM y los estilos estén completamente cargados
        setTimeout(() => {
            showToast('Debes iniciar sesión para agregar productos al carrito', 'warning');
        }, 150);
    }

    const loginForm = document.getElementById('login-form');
    loginForm.addEventListener('submit', handleLoginSubmit);

    // Manejar la visibilidad de la contraseña (alternar text/password)
    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('login-password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            
            // Alternar icono de Lucide
            const icon = togglePasswordBtn.querySelector('i');
            if (type === 'text') {
                icon.setAttribute('data-lucide', 'eye-off');
            } else {
                icon.setAttribute('data-lucide', 'eye');
            }
            
            if (window.lucide) {
                window.lucide.createIcons();
            }
        });
    }

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
