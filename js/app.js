/* ====================================================================
   LÓGICA PRINCIPAL DE LA APLICACIÓN (SPA CONTROLLER)
   ==================================================================== */

import * as api from './supabase-api.js?v=1.1.0';
import * as ui from './components.js?v=1.1.0';

// Estado global de la aplicación (State Management)
const AppState = {
    user: null,         // Datos del usuario logueado en Supabase Auth
    profile: null,      // Perfil del usuario (rol, nombre) de public.profiles
    productos: [],      // Catálogo completo de productos cargado
    carrito: [],        // Elementos en el carrito de compras del cliente
    pedidos: [],        // Pedidos cargados de la base de datos
    currentView: 'catalog' // Vista actual en la SPA
};

// ====================================================================
// 1. INICIALIZACIÓN Y ENRUTADOR DE LA SPA
// ====================================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inicializar escuchas del DOM inmediatamente (catálogo público de lectura accesible)
    setupEventListeners();

    // 2. Cargar productos inicialmente (Lectura pública desde el primer segundo)
    await cargarProductos();

    // 3. Renderizar catálogo inicial en pantalla para todos (visitantes y logueados)
    renderCatalogo();

    // 4. Intentar recuperar la sesión actual en segundo plano para persistir el estado si está logueado
    const sessionUser = await api.getCurrentUser();
    if (sessionUser) {
        AppState.user = sessionUser;
        const { profile } = await api.getUserProfile(sessionUser.id);
        if (profile) {
            AppState.profile = profile;
        } else {
            AppState.profile = {
                rol: sessionUser.email === 'bjacnier28giler@gmail.com' ? 'admin' : 'cliente',
                nombre: sessionUser.user_metadata?.nombre || 'Usuario'
            };
        }
        // Renderizar barra de navegación con perfil y enrutar correspondientemente
        renderNavbar();
        if (AppState.profile?.rol === 'admin') {
            switchView('admin');
        } else {
            switchView('catalog');
        }
    } else {
        // Renderizar navbar simplificada para visitantes
        renderNavbar();
        switchView('catalog');
    }

    // 5. Escuchar cambios de estado en la autenticación de Supabase (inicios de sesión o cierres en vivo)
    api.supabase.auth.onAuthStateChange(async (event, session) => {
        console.log("Cambio de estado Auth en la SPA:", event);
        if (session && session.user) {
            AppState.user = session.user;
            
            // Cargar el perfil para determinar el rol
            const { profile, error } = await api.getUserProfile(session.user.id);
            if (!error && profile) {
                AppState.profile = profile;
                
                // Forzar el rol de administrador para el correo específico indicado por el usuario
                if (session.user.email === 'bjacnier28giler@gmail.com' && profile.rol !== 'admin') {
                    await api.updateProfile(profile.id, { rol: 'admin' });
                    AppState.profile.rol = 'admin';
                }
            } else {
                AppState.profile = {
                    rol: session.user.email === 'bjacnier28giler@gmail.com' ? 'admin' : 'cliente',
                    nombre: session.user.user_metadata?.nombre || 'Usuario'
                };
            }
            
            ui.showToast(`¡Bienvenido de nuevo, ${AppState.profile.nombre}!`, 'success');
            
            renderNavbar();
            if (AppState.profile?.rol === 'admin') {
                switchView('admin');
            } else {
                switchView('catalog');
            }
        } else {
            // Si el usuario cierra sesión, limpiar estado y redirigir al catálogo público sin forzar salida física
            AppState.user = null;
            AppState.profile = null;
            AppState.carrito = [];
            AppState.pedidos = [];
            actualizarContadorCarrito();
            renderNavbar();
            switchView('catalog');
        }
    });
    
    // Inicializar iconos Lucide
    if (window.lucide) {
        window.lucide.createIcons();
    }
});

/**
 * Registra los escuchas de eventos (listeners) generales para formularios y modales.
 */
function setupEventListeners() {
    // Redirección de la marca del Logo
    document.getElementById('nav-brand').addEventListener('click', () => {
        if (AppState.profile?.rol === 'admin') {
            switchView('admin');
        } else {
            switchView('catalog');
        }
    });

    // Delegación global de eventos para el botón de cerrar sesión (Logout) - 100% robusto para admin y clientes
    document.addEventListener('click', async (e) => {
        const logoutBtn = e.target.closest('#logout-btn');
        if (logoutBtn) {
            e.preventDefault();
            
            // 1. Mostrar feedback inmediato
            ui.showToast('Cerrando sesión...', 'info');

            // 2. Limpiar de inmediato el estado local
            AppState.user = null;
            AppState.profile = null;
            AppState.carrito = [];
            AppState.pedidos = [];

            // 3. Limpiar storages de inmediato
            try {
                localStorage.clear();
                sessionStorage.clear();
            } catch (err) {
                console.error("Error al limpiar almacenamiento local:", err);
            }

            // 4. Actualizar la interfaz de inmediato
            actualizarContadorCarrito();
            renderNavbar();
            switchView('catalog');

            // 5. Notificar a Supabase en segundo plano sin bloquear
            try {
                await api.supabase.auth.signOut();
            } catch (signOutErr) {
                console.warn("Notificación de salida no bloqueante fallida:", signOutErr);
            }
        }
    });

    // Controles de búsqueda y filtros del catálogo de clientes
    document.getElementById('catalog-search').addEventListener('input', filtrarCatalogo);
    document.getElementById('catalog-category-filter').addEventListener('change', filtrarCatalogo);

    // Botón de checkout del carrito
    document.getElementById('cart-checkout-btn').addEventListener('click', procesarCompra);

    // Controles de búsqueda y filtros de la tabla de inventario del administrador
    document.getElementById('admin-search').addEventListener('input', filtrarInventario);
    document.getElementById('admin-category-filter').addEventListener('change', filtrarInventario);
    document.getElementById('admin-stock-filter').addEventListener('change', filtrarInventario);

    // Botón de Nuevo Producto
    document.getElementById('admin-add-product-btn').addEventListener('click', () => openProductModal());

    // Cierre del modal de productos
    document.getElementById('modal-product-close').addEventListener('click', closeProductModal);
    document.getElementById('modal-product-cancel').addEventListener('click', closeProductModal);
    
    // Formulario de Producto (Guardar / Editar)
    const formProduct = document.getElementById('form-product');
    formProduct.addEventListener('submit', handleProductSubmit);

    // Configuración del Selector Híbrido de Categorías (Chips de Selección)
    const categoryChips = document.querySelectorAll('.category-chip');
    const inputCategory = document.getElementById('prod-category');
    
    categoryChips.forEach(chip => {
        chip.addEventListener('click', () => {
            // Deseleccionar anteriores
            categoryChips.forEach(c => c.classList.remove('active'));
            
            // Activar actual
            chip.classList.add('active');
            
            // Copiar el valor seleccionado al input de texto libre
            inputCategory.value = chip.getAttribute('data-cat');
        });
    });

    // Si el usuario escribe manualmente, deseleccionamos los chips
    inputCategory.addEventListener('input', () => {
        categoryChips.forEach(chip => {
            if (chip.getAttribute('data-cat').toLowerCase() === inputCategory.value.trim().toLowerCase()) {
                chip.classList.add('active');
            } else {
                chip.classList.remove('active');
            }
        });
    });

    // Cierre de modal de detalles de pedido
    document.getElementById('modal-order-details-close').addEventListener('click', () => {
        document.getElementById('modal-order-details').classList.remove('active');
    });

    // Filtro de Historial de Pedidos
    document.getElementById('order-status-filter').addEventListener('change', filtrarPedidos);
}

/**
 * Administra el enrutamiento (Routing) dinámico de la SPA ocultando y mostrando secciones.
 */
function switchView(viewId) {
    // 1. Protección de rutas seguras
    if (viewId === 'admin' && AppState.profile?.rol !== 'admin') {
        ui.showToast('Acceso no autorizado al panel administrativo', 'danger');
        switchView('catalog');
        return;
    }
    
    if (viewId === 'orders' && !AppState.user) {
        ui.showToast('Inicia sesión para ver tu historial de pedidos', 'warning');
        window.location.href = 'login.html';
        return;
    }

    // 2. Cambiar clases activas en las secciones HTML
    const views = document.querySelectorAll('.view-section');
    views.forEach(view => {
        if (view.id === `view-${viewId}`) {
            view.classList.add('active');
        } else {
            view.classList.remove('active');
        }
    });

    // 3. Cambiar clases activas en los enlaces de navegación
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        if (link.getAttribute('data-view') === viewId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    AppState.currentView = viewId;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // 4. Cargar datos específicos de la vista al entrar
    if (viewId === 'catalog') {
        renderCatalogo();
    } else if (viewId === 'admin') {
        cargarEstadisticasAdmin();
        renderInventario();
    } else if (viewId === 'orders') {
        cargarPedidos();
    }

    // Refrescar iconos Lucide cargados
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

/**
 * Renderiza dinámicamente la barra de navegación basada en la sesión y el rol.
 */
function renderNavbar() {
    const navMenu = document.getElementById('nav-menu');
    const userMenu = document.getElementById('user-menu');

    // 1. Poblar Enlaces de Navegación según Rol
    let menuHTML = `<a class="nav-link active" data-view="catalog">Catálogo</a>`;
    
    if (AppState.user) {
        if (AppState.profile?.rol === 'admin') {
            menuHTML = `
                <a class="nav-link" data-view="admin">Dashboard Inventario</a>
                <a class="nav-link" data-view="orders">Gestión de Pedidos</a>
                <a class="nav-link" data-view="catalog">Ver Catálogo</a>
            `;
        } else {
            menuHTML += `
                <a class="nav-link" data-view="orders">Mis Pedidos</a>
            `;
        }
    }
    navMenu.innerHTML = menuHTML;

    // Configurar listeners de la navegación recién creada
    const navLinks = navMenu.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            switchView(link.getAttribute('data-view'));
        });
    });

    // 2. Poblar Menú de Usuario (Perfil / Login / Logout)
    if (AppState.user) {
        const isAdmin = AppState.profile?.rol === 'admin';
        const badgeClass = isAdmin ? 'user-badge admin-badge' : 'user-badge';
        const badgeIcon = isAdmin ? 'shield' : 'user';
        const badgeText = isAdmin ? 'Administrador' : 'Cliente';

        userMenu.innerHTML = `
            <div class="${badgeClass}">
                <i data-lucide="${badgeIcon}" style="width: 14px; height: 14px;"></i>
                <span>${AppState.profile?.nombre || 'Usuario'}</span>
            </div>
            <button id="logout-btn" class="btn btn-secondary btn-sm">
                <i data-lucide="log-out"></i>
                <span>Salir</span>
            </button>
        `;
    } else {
        userMenu.innerHTML = `
            <button id="nav-login-btn" class="btn btn-primary btn-sm">
                <i data-lucide="log-in"></i>
                <span>Ingresar / Registro</span>
            </button>
        `;

        document.getElementById('nav-login-btn').addEventListener('click', () => {
            window.location.href = 'login.html';
        });
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}


// ====================================================================
// 2. LÓGICA DE AUTENTICACIÓN (LOGIN / REGISTRO TRASLADADOS)
// ====================================================================
// La lógica de login y registro se maneja de forma independiente en sus
// respectivos controladores: js/login.js y js/registro.js para un diseño más despejado


// ====================================================================
// 3. LÓGICA DEL CATÁLOGO DE PRODUCTOS (CLIENTE)
// ====================================================================

async function cargarProductos() {
    const { productos, error } = await api.getProductos();
    if (!error) {
        AppState.productos = productos;
    } else {
        ui.showToast('Error al conectar con la base de datos de productos', 'danger');
    }
}

function renderCatalogo() {
    const catalogGrid = document.getElementById('catalog-grid');
    catalogGrid.innerHTML = '';

    const query = document.getElementById('catalog-search').value.toLowerCase().trim();
    const category = document.getElementById('catalog-category-filter').value;

    const productosFiltrados = AppState.productos.filter(prod => {
        const coincideNombre = prod.nombre.toLowerCase().includes(query) || (prod.codigo_barras && prod.codigo_barras.includes(query));
        const coincideCategoria = !category || prod.categoria === category;
        return coincideNombre && coincideCategoria;
    });

    if (productosFiltrados.length === 0) {
        catalogGrid.innerHTML = `
            <div class="card" style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-muted);">
                <i data-lucide="shopping-bag" style="width: 48px; height: 48px; margin: 0 auto 1rem auto; opacity: 0.5;"></i>
                <p>No se encontraron productos disponibles con los criterios de búsqueda.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    productosFiltrados.forEach(prod => {
        const card = ui.renderProductCard(prod, agregarAlCarrito);
        catalogGrid.appendChild(card);
    });
}

function filtrarCatalogo() {
    renderCatalogo();
}


// ====================================================================
// 4. LÓGICA DEL CARRITO DE COMPRAS
// ====================================================================

function agregarAlCarrito(producto) {
    if (!AppState.user) {
        window.location.href = 'login.html?auth_required=true';
        return;
    }

    // Buscar si ya está en el carrito
    const itemEnCarrito = AppState.carrito.find(item => item.id === producto.id);
    
    // Verificar stock límite
    const cantidadActual = itemEnCarrito ? itemEnCarrito.cantidad : 0;
    if (cantidadActual + 1 > producto.stock) {
        ui.showToast(`Lo sentimos, solo quedan ${producto.stock} unidades de este producto`, 'warning');
        return;
    }

    if (itemEnCarrito) {
        itemEnCarrito.cantidad += 1;
    } else {
        AppState.carrito.push({
            id: producto.id,
            nombre: producto.nombre,
            precio: Number(producto.precio),
            cantidad: 1
        });
    }

    ui.showToast(`"${producto.nombre}" agregado al carrito`, 'success');
    renderCarrito();
}

function incrementarItemCarrito(id) {
    const item = AppState.carrito.find(item => item.id === id);
    const prodOriginal = AppState.productos.find(p => p.id === id);

    if (item && prodOriginal) {
        if (item.cantidad + 1 > prodOriginal.stock) {
            ui.showToast(`Límite de stock alcanzado (${prodOriginal.stock} unidades)`, 'warning');
            return;
        }
        item.cantidad += 1;
        renderCarrito();
    }
}

function decrementarItemCarrito(id) {
    const item = AppState.carrito.find(item => item.id === id);
    if (item) {
        item.cantidad -= 1;
        if (item.cantidad <= 0) {
            removerItemCarrito(id);
        } else {
            renderCarrito();
        }
    }
}

function removerItemCarrito(id) {
    AppState.carrito = AppState.carrito.filter(item => item.id !== id);
    ui.showToast('Producto removido del carrito', 'warning');
    renderCarrito();
}

function renderCarrito() {
    const cartItemsContainer = document.getElementById('cart-items');
    cartItemsContainer.innerHTML = '';

    if (AppState.carrito.length === 0) {
        cartItemsContainer.innerHTML = `<p class="cart-empty-text">El carrito está vacío</p>`;
        actualizarContadorCarrito();
        return;
    }

    AppState.carrito.forEach(item => {
        const itemEl = ui.renderCartItem(item, incrementarItemCarrito, decrementarItemCarrito, removerItemCarrito);
        cartItemsContainer.appendChild(itemEl);
    });

    actualizarContadorCarrito();
    
    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function actualizarContadorCarrito() {
    const countLabel = document.getElementById('cart-count-label');
    const totalLabel = document.getElementById('cart-total-label');
    const checkoutBtn = document.getElementById('cart-checkout-btn');

    const totalProductos = AppState.carrito.reduce((sum, item) => sum + item.cantidad, 0);
    const totalDinero = AppState.carrito.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);

    countLabel.textContent = totalProductos;
    totalLabel.textContent = `$${totalDinero.toFixed(2)}`;

    checkoutBtn.disabled = AppState.carrito.length === 0;
}

async function procesarCompra() {
    if (AppState.carrito.length === 0) return;
    
    const checkoutBtn = document.getElementById('cart-checkout-btn');
    checkoutBtn.disabled = true;
    checkoutBtn.querySelector('span').textContent = "Confirmando...";

    try {
        const totalDinero = AppState.carrito.reduce((sum, item) => sum + (item.cantidad * item.precio), 0);

        const { pedido, error } = await api.crearPedido(AppState.user.id, totalDinero, AppState.carrito);

        if (error) {
            ui.showToast(`Error al procesar la compra: ${error}`, 'danger');
            checkoutBtn.disabled = false;
            checkoutBtn.querySelector('span').textContent = "Confirmar Pedido";
        } else {
            ui.showToast('¡Pedido realizado con éxito!', 'success');
            AppState.carrito = [];
            renderCarrito();
            
            // Recargar productos para refrescar stock en la pantalla
            await cargarProductos();
            renderCatalogo();
            
            // Restaurar el botón de checkout de forma exitosa
            checkoutBtn.disabled = false;
            checkoutBtn.querySelector('span').textContent = "Confirmar Pedido";
            
            // Redirigir a sus pedidos
            switchView('orders');
        }
    } catch (err) {
        console.error("Excepción al procesar compra:", err);
        ui.showToast(`Error crítico: ${err.message || String(err)}`, 'danger');
        checkoutBtn.disabled = false;
        checkoutBtn.querySelector('span').textContent = "Confirmar Pedido";
    }
    
    if (window.lucide) window.lucide.createIcons();
}


// ====================================================================
// 5. PANEL DE ADMINISTRADOR (CONTROL DE INVENTARIO Y ALERTAS EN ROJO)
// ====================================================================

function cargarEstadisticasAdmin() {
    const totalProductsEl = document.getElementById('stat-total-products');
    const valueEl = document.getElementById('stat-inventory-value');
    const criticalEl = document.getElementById('stat-critical-products');
    const alertCard = document.getElementById('stat-alert-card');

    // Salvaguarda robusta para evitar excepciones si la vista no tiene estos elementos
    if (!totalProductsEl || !valueEl || !criticalEl || !alertCard) return;

    const total = AppState.productos.length;
    const valorInventario = AppState.productos.reduce((sum, p) => sum + (p.stock * Number(p.precio)), 0);
    
    // Cuenta los productos en ALERTA CRÍTICA (stock <= stock_minimo)
    const criticos = AppState.productos.filter(p => p.stock <= p.stock_minimo).length;

    totalProductsEl.textContent = total;
    valueEl.textContent = `$${valorInventario.toFixed(2)}`;
    criticalEl.textContent = criticos;

    // Resaltado extra de la tarjeta de alerta en caso de stock crítico presente
    if (criticos > 0) {
        alertCard.style.borderColor = 'var(--color-danger)';
        alertCard.style.background = 'rgba(239, 68, 68, 0.05)';
        alertCard.style.boxShadow = 'var(--shadow-danger-glow)';
    } else {
        alertCard.style.borderColor = 'var(--border-color)';
        alertCard.style.background = 'var(--bg-card)';
        alertCard.style.boxShadow = 'none';
    }
}

function renderInventario() {
    const tableBody = document.getElementById('admin-inventory-table-body');
    tableBody.innerHTML = '';

    const query = document.getElementById('admin-search').value.toLowerCase().trim();
    const category = document.getElementById('admin-category-filter').value;
    const stockFilter = document.getElementById('admin-stock-filter').value;

    const productosFiltrados = AppState.productos.filter(prod => {
        const coincideNombre = prod.nombre.toLowerCase().includes(query) || (prod.codigo_barras && prod.codigo_barras.includes(query));
        const coincideCategoria = !category || prod.categoria === category;
        
        let coincideStock = true;
        if (stockFilter === 'critico') {
            coincideStock = prod.stock <= prod.stock_minimo;
        } else if (stockFilter === 'suficiente') {
            coincideStock = prod.stock > prod.stock_minimo;
        }

        return coincideNombre && coincideCategoria && coincideStock;
    });

    if (productosFiltrados.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                    <i data-lucide="package-search" style="width: 40px; height: 40px; margin: 0 auto 0.75rem auto; opacity: 0.5; display: block;"></i>
                    No se encontraron productos registrados con los filtros aplicados.
                </td>
            </tr>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    productosFiltrados.forEach(prod => {
        // Genera la fila. RenderInventoryRow aplica automáticamente la clase "stock-critico" (fondo rojo suave) si cumple la condición
        const tr = ui.renderInventoryRow(prod, openProductModal, eliminarProducto);
        tableBody.appendChild(tr);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function filtrarInventario() {
    renderInventario();
}

// --- CRUD DE PRODUCTOS (MODAL ADMINISTRACIÓN) ---

function openProductModal(producto = null) {
    const modal = document.getElementById('modal-product');
    const title = document.getElementById('modal-product-title');
    const form = document.getElementById('form-product');
    const chips = document.querySelectorAll('.category-chip');
    
    form.reset();
    chips.forEach(c => c.classList.remove('active'));

    if (producto) {
        title.textContent = "Editar Producto";
        document.getElementById('prod-id').value = producto.id;
        document.getElementById('prod-name').value = producto.nombre;
        document.getElementById('prod-category').value = producto.categoria;
        document.getElementById('prod-price').value = producto.precio;
        document.getElementById('prod-barcode').value = producto.codigo_barras || '';
        document.getElementById('prod-stock').value = producto.stock;
        document.getElementById('prod-min-stock').value = producto.stock_minimo;
        document.getElementById('prod-image').value = producto.imagen_url || '';

        // Activar chip si coincide
        chips.forEach(chip => {
            if (chip.getAttribute('data-cat') === producto.categoria) {
                chip.classList.add('active');
            }
        });
    } else {
        title.textContent = "Nuevo Producto";
        document.getElementById('prod-id').value = "";
    }

    modal.classList.add('active');
    
    if (window.lucide) window.lucide.createIcons();
}

function closeProductModal() {
    document.getElementById('modal-product').classList.remove('active');
}

async function handleProductSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('prod-id').value;
    const productoData = {
        nombre: document.getElementById('prod-name').value.trim(),
        categoria: document.getElementById('prod-category').value.trim(),
        precio: parseFloat(document.getElementById('prod-price').value),
        codigo_barras: document.getElementById('prod-barcode').value.trim() || null,
        stock: parseInt(document.getElementById('prod-stock').value),
        stock_minimo: parseInt(document.getElementById('prod-min-stock').value),
        imagen_url: document.getElementById('prod-image').value.trim() || null
    };

    if (!productoData.nombre || !productoData.categoria || isNaN(productoData.precio) || isNaN(productoData.stock)) {
        ui.showToast('Por favor, completa los campos requeridos', 'warning');
        return;
    }

    const saveBtn = document.getElementById('modal-product-submit');
    saveBtn.disabled = true;
    saveBtn.textContent = "Guardando...";

    try {
        let result;
        if (id) {
            // Actualización
            result = await api.updateProducto(id, productoData);
        } else {
            // Inserción
            result = await api.addProducto(productoData);
        }

        if (result.error) {
            ui.showToast(`Error al guardar el producto: ${result.error}`, 'danger');
        } else {
            ui.showToast(`Producto "${productoData.nombre}" guardado con éxito`, 'success');
            closeProductModal();
            
            // Recargar inventario
            await cargarProductos();
            cargarEstadisticasAdmin();
            renderInventario();
        }
    } catch (err) {
        console.error("Excepción en handleProductSubmit:", err);
        ui.showToast(`Error crítico al guardar: ${err.message || String(err)}`, 'danger');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = id ? "Guardar Cambios" : "Guardar Producto";
    }
}

async function eliminarProducto(id) {
    const prod = AppState.productos.find(p => p.id === id);
    if (!prod) return;

    const confirmado = await ui.showConfirm(
        'Eliminar Producto',
        `¿Estás seguro de que deseas eliminar permanentemente el producto "${prod.nombre}" del inventario? Esta acción no se puede deshacer.`,
        'Eliminar',
        'Cancelar',
        true
    );

    if (confirmado) {
        const { error } = await api.deleteProducto(id);
        if (error) {
            ui.showToast(`Error al eliminar: ${error}`, 'danger');
        } else {
            ui.showToast('Producto eliminado exitosamente', 'success');
            await cargarProductos();
            cargarEstadisticasAdmin();
            renderInventario();
        }
    }
}


// ====================================================================
// 6. LÓGICA DE HISTORIAL Y DETALLES DE PEDIDOS
// ====================================================================

async function cargarPedidos() {
    const isAdmin = AppState.profile?.rol === 'admin';
    const { pedidos, error } = await api.getPedidos(isAdmin, AppState.user.id);
    
    if (!error) {
        AppState.pedidos = pedidos;
        
        // Ajustar títulos dinámicamente según rol
        const titleEl = document.getElementById('orders-view-title');
        const subtitleEl = document.getElementById('orders-view-subtitle');

        if (isAdmin) {
            titleEl.textContent = "Gestión de Pedidos de Clientes";
            subtitleEl.textContent = "Verifica y actualiza el estado de las órdenes en la tienda";
        } else {
            titleEl.textContent = "Historial de Pedidos";
            subtitleEl.textContent = "Consulta tus compras realizadas y estados de entrega";
        }

        renderPedidos();
    } else {
        ui.showToast('Error al cargar pedidos', 'danger');
    }
}

function renderPedidos() {
    const ordersList = document.getElementById('orders-list');
    ordersList.innerHTML = '';

    const filterStatus = document.getElementById('order-status-filter').value;

    const pedidosFiltrados = AppState.pedidos.filter(ped => {
        return filterStatus === 'todos' || ped.estado === filterStatus;
    });

    if (pedidosFiltrados.length === 0) {
        ordersList.innerHTML = `
            <div class="card" style="text-align: center; padding: 3rem; color: var(--text-muted);">
                <i data-lucide="receipt" style="width: 48px; height: 48px; margin: 0 auto 1rem auto; opacity: 0.5;"></i>
                <p>No se encontraron registros de pedidos en este estado.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const isAdmin = AppState.profile?.rol === 'admin';

    pedidosFiltrados.forEach(pedido => {
        // Renderizar tarjeta pasando callbacks globales para acciones rápidas
        const orderCard = ui.renderOrderCard(
            pedido, 
            isAdmin, 
            abrirDetallesPedido,
            (id) => cambiarEstado(id, 'cancelado'),
            (id) => cambiarEstado(id, 'completado'),
            (id) => eliminarPedido(id)
        );
        ordersList.appendChild(orderCard);
    });

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

function filtrarPedidos() {
    renderPedidos();
}

/**
 * Cambia el estado de un pedido en la base de datos (con confirmación de seguridad).
 */
async function cambiarEstado(id, nuevoEstado) {
    const estadoDb = nuevoEstado === 'completated' ? 'completado' : nuevoEstado;
    
    // Diálogos de confirmación premium para evitar clics accidentales
    if (estadoDb === 'cancelado') {
        const confirmado = await ui.showConfirm(
            'Cancelar Pedido',
            '¿Estás seguro de que deseas cancelar este pedido?',
            'Cancelar Pedido',
            'Volver',
            true
        );
        if (!confirmado) return;
    } else if (estadoDb === 'completado') {
        const confirmado = await ui.showConfirm(
            'Completar Pedido',
            '¿Estás seguro de que deseas marcar este pedido como COMPLETADO? Se registrará la entrega y cierre de la orden.',
            'Completar',
            'Volver',
            false // Estilo verde / éxito
        );
        if (!confirmado) return;
    }
    
    const { data, error: errUpdate } = await api.updateEstadoPedido(id, estadoDb);
    
    if (errUpdate) {
        ui.showToast(`Error al actualizar estado: ${errUpdate}`, 'danger');
    } else {
        const mensajeToast = estadoDb === 'cancelado' ? 'Pedido cancelado con éxito.' : 'Pedido completado con éxito.';
        ui.showToast(mensajeToast, 'success');
        
        // Cerrar el modal de detalles si está abierto
        const modal = document.getElementById('modal-order-details');
        if (modal) {
            modal.classList.remove('active');
        }
        
        // Recargar pedidos e inventario de forma asíncrona
        await cargarPedidos();
        await cargarProductos();
        cargarEstadisticasAdmin();
        renderInventario();
    }
}

/**
 * Elimina físicamente un pedido de la base de datos (con confirmación de seguridad).
 */
async function eliminarPedido(id) {
    const confirmado = await ui.showConfirm(
        'Eliminar Registro de Pedido',
        '¿Estás seguro de que deseas eliminar permanentemente este registro de pedido de la base de datos? Esta acción es irreversible y borrará todo el historial asociado.',
        'Eliminar',
        'Cancelar',
        true
    );

    if (confirmado) {
        const { error } = await api.deletePedido(id);
        if (error) {
            ui.showToast(`Error al eliminar pedido: ${error}`, 'danger');
        } else {
            ui.showToast('Pedido eliminado permanentemente de la base de datos.', 'success');
            
            // Cerrar el modal de detalles si está abierto
            const modal = document.getElementById('modal-order-details');
            if (modal) {
                modal.classList.remove('active');
            }
            
            // Recargar listados
            await cargarPedidos();
        }
    }
}

/**
 * Abre el modal detallado de un pedido cargando sus productos desde Supabase.
 */
async function abrirDetallesPedido(pedido) {
    const modal = document.getElementById('modal-order-details');
    
    // Setear datos de cabecera
    const idCorto = pedido.id.substring(0, 8).toUpperCase();
    document.getElementById('det-order-id').textContent = `#${idCorto}`;
    
    const fecha = new Date(pedido.creado_en).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    document.getElementById('det-order-date').textContent = fecha;
    
    const clienteNombre = pedido.profiles ? pedido.profiles.nombre : 'Desconocido';
    document.getElementById('det-order-client').textContent = clienteNombre;
    
    const statusBadge = document.getElementById('det-order-status');
    statusBadge.className = `order-status ${pedido.estado}`;
    statusBadge.textContent = pedido.estado.toUpperCase();
    
    document.getElementById('det-order-total').textContent = `$${Number(pedido.total).toFixed(2)}`;

    // Cargar detalles de productos del pedido desde la API
    const itemsBody = document.getElementById('det-order-items-body');
    itemsBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Cargando productos...</td></tr>';
    
    modal.classList.add('active');

    const { detalles, error } = await api.getDetallesPedido(pedido.id);
    
    if (error || !detalles) {
        itemsBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--color-danger);">Fallo al cargar ítems.</td></tr>';
        return;
    }

    itemsBody.innerHTML = '';
    detalles.forEach(det => {
        const prod = det.productos || { nombre: 'Producto Eliminado', categoria: 'N/A' };
        const subtotal = det.cantidad * Number(det.precio_unitario);
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <strong>${prod.nombre}</strong><br>
                <span class="product-cat-tag" style="margin-top: 0.15rem; display: inline-block;">${prod.categoria}</span>
            </td>
            <td style="text-align: center; font-weight: 600;">${det.cantidad}</td>
            <td style="text-align: right;">$${Number(det.precio_unitario).toFixed(2)}</td>
            <td style="text-align: right; font-weight: 700; color: white;">$${subtotal.toFixed(2)}</td>
        `;
        itemsBody.appendChild(tr);
    });

    // Configurar footer del modal (Acciones especiales para el Admin)
    const footer = document.getElementById('det-order-footer');
    footer.innerHTML = '';

    const isAdmin = AppState.profile?.rol === 'admin';
    
    if (isAdmin && pedido.estado === 'pendiente') {
        footer.innerHTML = `
            <button class="btn btn-danger btn-sm cancel-order-btn">Cancelar Pedido</button>
            <button class="btn btn-primary btn-sm complete-order-btn">Completar Pedido</button>
        `;

        footer.querySelector('.cancel-order-btn').addEventListener('click', () => cambiarEstado(pedido.id, 'cancelado'));
        footer.querySelector('.complete-order-btn').addEventListener('click', () => cambiarEstado(pedido.id, 'completado'));
    } else if (!isAdmin && pedido.estado === 'pendiente') {
        // Permitir que el cliente cancele su propio pedido si aún está pendiente
        footer.innerHTML = `
            <button class="btn btn-danger btn-sm cancel-order-btn">Cancelar Pedido</button>
            <button class="btn btn-secondary btn-sm close-modal-btn">Cerrar</button>
        `;

        footer.querySelector('.cancel-order-btn').addEventListener('click', () => cambiarEstado(pedido.id, 'cancelado'));
        footer.querySelector('.close-modal-btn').addEventListener('click', () => modal.classList.remove('active'));
    } else if (isAdmin && (pedido.estado === 'completado' || pedido.estado === 'cancelado')) {
        // Permitir que el administrador elimine registros de pedidos completados o cancelados
        footer.innerHTML = `
            <button class="btn btn-danger btn-sm delete-order-btn" style="background: rgba(239, 68, 68, 0.15); border-color: var(--color-danger); color: #fca5a5;">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                <span>Eliminar Registro</span>
            </button>
            <button class="btn btn-secondary btn-sm close-modal-btn">Cerrar</button>
        `;

        footer.querySelector('.delete-order-btn').addEventListener('click', () => eliminarPedido(pedido.id));
        footer.querySelector('.close-modal-btn').addEventListener('click', () => modal.classList.remove('active'));
    } else {
        footer.innerHTML = `<button class="btn btn-secondary btn-sm close-modal-btn">Cerrar</button>`;
        footer.querySelector('.close-modal-btn').addEventListener('click', () => modal.classList.remove('active'));
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}
