/* ====================================================================
   CONTROLADOR DE AUTENTICACIÓN: REGISTRO INDEPENDIENTE
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

    const registerForm = document.getElementById('register-form');
    registerForm.addEventListener('submit', handleRegisterSubmit);

    // Inicializar iconos Lucide
    if (window.lucide) {
        window.lucide.createIcons();
    }
});

async function handleRegisterSubmit(e) {
    e.preventDefault();

    const nombre = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    if (!nombre || !email || !password) {
        showToast('Por favor, completa todos los campos obligatorios', 'warning');
        return;
    }

    if (password.length < 6) {
        showToast('La contraseña debe tener al menos 6 caracteres', 'warning');
        return;
    }

    const submitBtn = document.getElementById('register-submit-btn');
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = "Procesando...";

    const { data, error } = await api.signUp(email, password, nombre);

    if (error) {
        showToast(`Error de registro: ${error}`, 'danger');
        submitBtn.disabled = false;
        submitBtn.querySelector('span').textContent = "Crear Cuenta";
        if (window.lucide) window.lucide.createIcons();
    } else {
        showToast('¡Cuenta creada con éxito! Redirigiendo al inicio de sesión...', 'success');
        
        // Esperar un instante para que el Toast sea visible
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1500);
    }
}
